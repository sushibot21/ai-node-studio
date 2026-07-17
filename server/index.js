import "dotenv/config";
import express from "express";
import cors from "cors";
import { PROVIDERS } from "./providers.js";
import { callMCPTool, listMCPTools } from "./mcp.js";
import { capturePage, extractPageContext } from "./dom.js";
import { captureWithBrowser, htmlToPdf } from "./browser.js";
import { captureFigmaDesign } from "./figmaCapture.js";
import { buildAnalysisPrompt } from "./uxLenses.js";
import { extractJSON, normalizeFinding } from "./uxUtil.js";
import { mergeAudit } from "./uxReview.js";
import { buildReportHTML } from "./report.js";
import { writeFigma, normalizeRedesignSpec } from "./figma.js";
import { classifyFigmaTools } from "./figmaMcp.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
// Trace pipeline calls (skip the bridge poll heartbeat which fires every ~1.5s).
app.use((req, _res, next) => { if (req.path.startsWith("/api/") && !req.path.includes("figma-bridge/poll")) console.log(`[req] ${req.method} ${req.path}`); next(); });

// Tells the client which providers currently have a key configured,
// so the UI can gray out options that won't work yet.
app.get("/api/providers", (_req, res) => {
  res.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    gemini: !!process.env.GOOGLE_API_KEY,
    ollama: true
  });
});

app.get("/api/ollama/models", async (_req, res) => {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags");
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Ollama is unavailable");
    res.json({ models: (data.models || []).map((model) => model.name) });
  } catch (err) {
    res.status(503).json({ error: err.message || "Could not connect to Ollama" });
  }
});

app.post("/api/run-node", async (req, res) => {
  const { provider, model, systemPrompt, input, temperature } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!fn) {
    return res.status(400).json({ error: `Unknown provider "${provider}"` });
  }
  try {
    const result = await fn({ model, systemPrompt, input, temperature });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Node execution failed" });
  }
});

app.post("/api/refine", async (req, res) => {
  const { provider, model, goal, rubric, input, temperature, maxIterations = 4, targetScore = 9 } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });
  try {
    let draft = input || "";
    const history = [];
    // The UI exposes up to 25 rounds; retain a finite server guard so a malformed
    // request cannot start an unbounded local-model job.
    const roundLimit = Math.min(Math.max(Number(maxIterations) || 1, 1), 25);
    if (!draft) {
      const initial = await fn({ model, temperature, systemPrompt: "You are a brand and content strategist. Return only the requested first draft.", input: `Goal: ${goal}\nRubric: ${rubric}\nCreate the initial draft now.` });
      draft = initial.text || "";
    }
    for (let iteration = 1; iteration <= roundLimit; iteration++) {
      const evaluation = await fn({ model, temperature: 0, systemPrompt: "You are a strict evaluator. Return exactly: SCORE: <0-10>\\nCRITIQUE: <actionable feedback>", input: `Goal: ${goal}\nRubric: ${rubric}\nDraft: ${draft || "(none — create an initial draft)"}` });
      const match = evaluation.text.match(/SCORE:\s*(10|[0-9](?:\.\d+)?)/i);
      const score = Math.min(10, Math.max(0, Number(match?.[1] || 0)));
      const critique = evaluation.text.replace(/SCORE:\s*[^\n]*/i, "").replace(/^\s*CRITIQUE:\s*/i, "").trim();
      history.push({ iteration, score, critique, draft });
      if (iteration < roundLimit) {
        const revised = await fn({ model, temperature, systemPrompt: "You improve drafts. Return only the revised draft.", input: `Goal: ${goal}\nRubric: ${rubric}\nCurrent draft: ${draft}\nEvaluator feedback: ${critique}\nWrite a better draft.` });
        draft = revised.text || draft;
      }
    }
    const bestIndex = history.reduce((best, item, index) => item.score > history[best].score ? index : best, 0);
    const best = history[bestIndex];
    const tiedBestCount = history.filter((item) => item.score === best.score).length;
    const markedHistory = history.map((item, index) => ({
      ...item,
      selected: index === bestIndex,
      selectionReason: index === bestIndex
        ? `Selected: ${tiedBestCount > 1 ? `tied for the highest score (${item.score}/10) and was the earliest such candidate` : `highest evaluation score (${item.score}/10)`} after comparing all ${history.length} rounds${item.score >= Number(targetScore) ? `; it meets the ${targetScore}/10 target.` : `; no candidate reached the ${targetScore}/10 target.`}`
        : item.score === best.score
          ? `Not selected: tied for the highest score (${item.score}/10); the earliest tied candidate was selected as final.`
          : `Not selected: scored ${item.score}/10, below the best candidate's ${best.score}/10.`
    }));
    res.json({ text: best.draft, score: best.score, history: markedHistory });
  } catch (err) { res.status(500).json({ error: err.message || "Refinement failed" }); }
});

// --- UX Review pipeline -----------------------------------------------------

// Validates + resolves redirects, loads the page, and extracts DOM/interface
// metadata into a PageContext. Screenshots are best-effort and degrade cleanly.
app.post("/api/capture", async (req, res) => {
  const { url } = req.body || {};
  if (!url?.trim()) return res.status(400).json({ error: "Provide a URL to audit" });
  const target = url.trim();
  try {
    // Figma design link → render + read it via the Figma REST API.
    if (/figma\.com\/(file|design|board)\//i.test(target)) {
      return res.json(await captureFigmaDesign(target));
    }
    // Prefer a real browser (screenshot + element regions for report markers);
    // fall back to dependency-free fetch capture if it's unavailable or fails.
    const bx = await captureWithBrowser(target);
    if (bx && bx.html) {
      const context = extractPageContext(bx.html, target, { url: bx.finalUrl, redirected: bx.finalUrl !== target, status: bx.status });
      context.screenshot = bx.screenshot;
      context.viewportScreenshot = bx.viewportScreenshot;
      context.regions = bx.regions;
      context.pageDimensions = { width: bx.pageWidth, height: bx.pageHeight };
      context.screenshotNote = "Full-page screenshot captured via headless browser; numbered markers in the report reference the findings below.";
      return res.json(context);
    }
    res.json(await capturePage(target));
  } catch (err) {
    res.status(502).json({ error: err.message || "Could not capture the page" });
  }
});

// One independent review pass: runs the given lenses against the PageContext
// and returns structured, normalised Findings.
app.post("/api/ux-analyze", async (req, res) => {
  const { provider = "ollama", model = "hermes3:latest", temperature = 0.4, lenses = [], pageContext } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });
  try {
    const prompt = buildAnalysisPrompt(lenses, pageContext);
    const result = await fn({
      model,
      temperature,
      systemPrompt: "You are a meticulous senior UX researcher. Return only valid JSON.",
      input: prompt,
      // Ground findings in the rendered page (above-the-fold shot) when available.
      image: pageContext?.viewportScreenshot || pageContext?.screenshot
    });
    const parsed = extractJSON(result.text);
    const rawFindings = Array.isArray(parsed) ? parsed : parsed?.findings || [];
    const findings = rawFindings
      .map((raw, i) => normalizeFinding(raw, Array.isArray(lenses) ? lenses[0] : undefined, i))
      .filter(Boolean);
    res.json({ findings });
  } catch (err) {
    res.status(500).json({ error: err.message || "UX analysis failed" });
  }
});

// Consolidates every analysis pass into one de-duplicated, severity-ranked,
// scored UXAudit. Deterministic (reproducible + offline-safe).
app.post("/api/merge-findings", (req, res) => {
  const { groups = [], pageContext } = req.body || {};
  try {
    res.json({ audit: mergeAudit(groups, pageContext) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not merge findings" });
  }
});

// Renders the verified audit into a presentation-grade, print-to-PDF HTML report.
app.post("/api/report", (req, res) => {
  let { audit, narrative, title, pageContext } = req.body || {};
  // Degrade gracefully: if the structured audit wasn't wired in but a narrative
  // JSON audit came through instead, recover it; else render a minimal report
  // rather than failing the whole pipeline.
  if (!audit || !Array.isArray(audit.findings)) {
    const recovered = extractJSON(typeof narrative === "string" ? narrative : "");
    if (recovered && Array.isArray(recovered.findings)) {
      audit = recovered;
      narrative = undefined;
    } else if (!audit) {
      audit = { title: title || "UX Audit", findings: [], scorecard: [], severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0 }, methodology: "No structured audit reached the report stage." };
    }
  }
  try {
    res.json({ html: buildReportHTML(audit, narrative, title, pageContext) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not build report" });
  }
});

// Audits a Figma MCP server's capabilities by discovering its tools and
// classifying them (read/write/frame/component/text/variable/style/instance).
// Powers the "Detect capabilities" button and documents what a server supports.
app.post("/api/figma-capabilities", async (req, res) => {
  const { serverUrl } = req.body || {};
  if (!serverUrl?.trim()) return res.status(400).json({ error: "Enter a Figma MCP server URL" });
  try {
    const tools = await listMCPTools(serverUrl.trim());
    res.json({
      capabilities: classifyFigmaTools(tools),
      tools: tools.map((t) => ({ name: t.name, description: (t.description || "").slice(0, 160) }))
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "Could not reach the Figma MCP server" });
  }
});

// --- Node Studio ↔ Figma bridge --------------------------------------------
// A local job queue the Node Studio Figma plugin polls. This lets the APP write
// native, editable layers straight into the user's open Figma file — no agent,
// no paste, no external MCP server. The plugin: polls for a job, builds it with
// the Figma API, and posts back the result.
const bridge = { lastSeen: 0, jobs: [], results: new Map() };
// Wide window: the plugin long-polls (one held request), and Figma throttles
// its timers when backgrounded, so allow a generous gap before "disconnected".
const bridgeConnected = () => Date.now() - bridge.lastSeen < 40000;

// Enqueues a job for the plugin (either a build-from-spec or a clone-and-patch)
// and waits for the result.
async function enqueueBridge(payload, label) {
  const id = crypto.randomUUID();
  bridge.jobs.push({ id, payload });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const r = bridge.results.get(id);
    if (r) {
      bridge.results.delete(id);
      if (!r.ok) throw new Error(r.error || "The Figma plugin failed to build the redesign");
      return { mode: "bridge", text: `${label}${r.frameName ? ` — "${r.frameName}"` : ""}.${r.edits != null ? ` ${r.edits} content fixes applied.` : ""}`, frameId: r.frameId };
    }
    await new Promise((r2) => setTimeout(r2, 350));
  }
  throw new Error("The Figma bridge plugin didn't respond in time (make sure the Node Studio Bridge plugin is running in your Figma file).");
}

// Plugin ← LONG-POLLS for the next build job (also its heartbeat). The request
// is held open up to ~25s, returning as soon as a job is enqueued. A held
// request survives Figma's background-timer throttling, so jobs are delivered
// even while the user is looking at the Node Studio app (Figma in background).
app.get("/api/figma-bridge/poll", async (_req, res) => {
  bridge.lastSeen = Date.now();
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (bridge.jobs.length) {
      const job = bridge.jobs.shift();
      console.log(`[bridge] delivered job ${job.id} to plugin`);
      return res.json({ job });
    }
    await new Promise((r) => setTimeout(r, 250));
    bridge.lastSeen = Date.now();
  }
  res.json({ job: null });
});
// Plugin → reports a build result. GET (query params) so it's a CORS-"simple"
// request with no preflight — the plugin's sandboxed origin can't get blocked.
app.get("/api/figma-bridge/result", (req, res) => {
  const { jobId, ok, frameId, frameName, error, edits } = req.query;
  console.log(`[bridge] result for ${jobId}: ok=${ok}${error ? " error=" + error : ""}`);
  if (jobId) bridge.results.set(jobId, { jobId, ok: ok === "true" || ok === "1", frameId, frameName, error, edits: edits != null ? Number(edits) : undefined });
  res.json({ ok: true });
});
// App → is a plugin currently connected?
app.get("/api/figma-bridge/status", (_req, res) => res.json({ connected: bridgeConnected() }));

// Produces EDITABLE Figma output from a redesign spec. Preference order:
// 1) the live bridge plugin (writes into the open file), 2) a Figma MCP server,
// 3) a plugin-ready spec for a supplied file link, else asks for a destination.
app.post("/api/figma-write", async (req, res) => {
  const { serverUrl, figmaFileUrl, spec } = req.body || {};
  try {
    console.log(`[figma-write] bridgeConnected=${bridgeConnected()} specLen=${(spec || "").length}`);
    if (bridgeConnected()) {
      // Figma-design audits produce a PATCH — clone the original design and fix
      // its content in place (high fidelity, on brand). Web audits build a spec.
      const parsed = extractJSON(spec);
      console.log(`[figma-write] parsed.mode=${parsed && parsed.mode} sourceNodeId=${parsed && parsed.sourceNodeId}`);
      if (parsed && parsed.mode === "patch" && parsed.sourceNodeId) {
        return res.json(await enqueueBridge(
          { sourceNodeId: parsed.sourceNodeId, textEdits: parsed.textEdits || [], styleEdits: parsed.styleEdits || [], screenName: parsed.screenName },
          "Applied the redesign to a copy of your original design in your connected file"
        ));
      }
      const { spec: normalized } = normalizeRedesignSpec(spec);
      return res.json(await enqueueBridge({ spec: normalized }, "Created editable native Figma layers in your connected file"));
    }
    if (!serverUrl && !figmaFileUrl) {
      return res.json({
        mode: "needs-destination",
        text: "⏸ The redesign specification is ready. Run the Node Studio Bridge plugin in your Figma file (Plugins → Development → Node Studio Bridge → Connect), or paste a Figma file link, and I'll generate the redesigned screens."
      });
    }
    res.json(await writeFigma(req.body || {}, { listTools: listMCPTools, callTool: callMCPTool }));
  } catch (err) {
    res.status(502).json({ error: err.message || "Figma write failed" });
  }
});

// Renders a report's HTML into a downloadable PDF (via headless browser).
app.post("/api/report-pdf", async (req, res) => {
  const { html } = req.body || {};
  if (!html) return res.status(400).json({ error: "No report HTML provided" });
  try {
    const pdf = await htmlToPdf(html);
    if (!pdf) return res.status(503).json({ error: "PDF renderer unavailable — install puppeteer to export PDFs, or use the browser's Print → Save as PDF." });
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", "attachment; filename=ux-audit-report.pdf");
    res.send(Buffer.from(pdf));
  } catch (err) {
    res.status(500).json({ error: err.message || "PDF generation failed" });
  }
});

app.post("/api/mcp/tools", async (req, res) => {
  try { res.json({ tools: await listMCPTools(req.body?.serverUrl) }); }
  catch (err) { res.status(400).json({ error: err.message || "Could not discover MCP tools" }); }
});

app.post("/api/mcp/call", async (req, res) => {
  try { res.json(await callMCPTool(req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message || "MCP tool call failed" }); }
});

// The Workflow Assistant. Given a plain-English brief (or a URL), it designs a
// runnable node graph itself — choosing the right blocks and wiring them. It
// knows the full palette, including the UX Review nodes, so it can assemble an
// autonomous UX audit → redesign → report pipeline on its own. Runs on the best
// available model (Anthropic Claude when a key is configured).
app.post("/api/build-workflow", async (req, res) => {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const {
    task,
    provider = hasAnthropic ? "anthropic" : "ollama",
    model = hasAnthropic ? "claude-sonnet-4-6" : "hermes3:latest"
  } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!task?.trim()) return res.status(400).json({ error: "Describe the workflow you want to build" });
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });

  const reasoningProvider = hasAnthropic ? "anthropic" : "ollama";
  const reasoningModel = hasAnthropic ? "claude-sonnet-4-6" : "hermes3:latest";

  const prompt = `Design a runnable node workflow for this task:
"""${task}"""

NODE KINDS (use only these; include only the fields shown):
- textInput { text }              — a static input (a brief, or a URL to audit).
- webCapture { url }              — loads a URL, follows redirects, extracts DOM + interface metadata. FIRST stage of any UX audit.
- uxAnalysis { lenses:[...], provider, model } — ONE independent UX review pass over the given lenses. Emits structured findings.
- mergeFindings { provider, model } — merges ALL analysis passes, de-duplicates, ranks by severity → one verified audit.
- iterativeRefiner { goal, rubric, provider, model } — critiques & strengthens findings over several rounds.
- llm { systemPrompt, provider, model } — a single model call (e.g. to turn an audit into a redesign spec).
- reportGenerator { title }       — renders the verified audit into a professional HTML/PDF report.
- figmaWrite { }                  — produces an EDITABLE Figma redesign (native MCP write, or plugin fallback).
- template { template }           — text templating with {{in1}} {{in2}}.
- mcpTool { serverUrl, toolName, argumentsTemplate } — call an external MCP tool.
- output { format }               — display a result ("markdown" | "text").

UX LENS KEYS (for uxAnalysis.lenses): nielsen, wcag, visualHierarchy, gestalt, informationArchitecture, interactionDesign, mobileUX, navigation, conversion, trust, forms, errorPrevention, contentReadability, designConsistency, cognitiveLoad, progressiveDisclosure, recognitionRecall, feedbackStatus.

RULES:
- Edges are [fromIndex, toIndex] into the nodes array.
- For a UX audit of a URL, build this shape: textInput(url) → webCapture → SEVERAL uxAnalysis passes (split the 18 lenses across 4-5 passes, each pass independent) → mergeFindings. Also connect webCapture → mergeFindings (page context). Then mergeFindings → iterativeRefiner → reportGenerator, AND mergeFindings → reportGenerator, AND reportGenerator → output. Also mergeFindings → llm (redesign spec) → figmaWrite → output.
- Put the URL from the task into the first textInput's text AND the webCapture url.
- For every reasoning node (uxAnalysis, mergeFindings, iterativeRefiner, llm) set provider:"${reasoningProvider}" and model:"${reasoningModel}".
- Give the llm redesign node a systemPrompt telling it to output a JSON redesign spec (layout, component hierarchy, spacing, typography, interaction states, rationale, cards, colours).
- Keep it executable; 10-16 nodes for a full UX audit.

Return ONLY valid JSON: {"nodes":[{...}],"edges":[[0,1],...],"notes":"one line on your design"}`;

  try {
    const result = await fn({
      model,
      temperature: 0.2,
      systemPrompt: "You are a workflow architect for AI Node Studio. You assemble node graphs by choosing the right blocks and wiring them. Follow the JSON schema exactly and return only JSON.",
      input: prompt
    });
    const raw = result.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const graph = JSON.parse(raw);
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("The model returned an invalid workflow shape");
    res.json(graph);
  } catch (err) { res.status(500).json({ error: err.message || "Could not build workflow" }); }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`AI Node Studio server on http://localhost:${port}`));
