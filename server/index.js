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
import { buildRedesignPrompt } from "./redesignPrompt.js";
import { governRedesignSpec } from "./governance.js";

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
    const target = Number(targetScore) || 9;
    let terminationReason = "iteration_cap";
    for (let iteration = 1; iteration <= roundLimit; iteration++) {
      const evaluation = await fn({ model, temperature: 0, systemPrompt: "You are a strict evaluator. Return exactly: SCORE: <0-10>\\nCRITIQUE: <actionable feedback>", input: `Goal: ${goal}\nRubric: ${rubric}\nDraft: ${draft || "(none — create an initial draft)"}` });
      const match = evaluation.text.match(/SCORE:\s*(10|[0-9](?:\.\d+)?)/i);
      const score = Math.min(10, Math.max(0, Number(match?.[1] || 0)));
      const critique = evaluation.text.replace(/SCORE:\s*[^\n]*/i, "").replace(/^\s*CRITIQUE:\s*/i, "").trim();
      history.push({ iteration, score, critique, draft });

      // Early exit: target met
      if (score >= target) {
        terminationReason = "target_met";
        console.log(`[refine] target ${target}/10 hit at iteration ${iteration} — stopping`);
        break;
      }
      // Convergence gate: last 2 iterations same score (no progress)
      if (history.length >= 3) {
        const [a, b, c] = history.slice(-3).map((h) => h.score);
        if (a === b && b === c) {
          terminationReason = "converged";
          console.log(`[refine] converged at score ${score}/10 across 3 iterations — stopping`);
          break;
        }
      }
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
    res.json({ text: best.draft, score: best.score, history: markedHistory, terminationReason, iterationsUsed: history.length });
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
    let attempt = 0;
    let findings = [];
    let lastRawText = "";
    while (attempt < 2 && findings.length === 0) {
      const result = await fn({
        model,
        temperature: attempt === 0 ? temperature : 0.1,
        systemPrompt: attempt === 0
          ? "You are a meticulous senior UX researcher. Return only valid JSON."
          : "You are a meticulous senior UX researcher. Return ONLY a JSON array of findings. No prose, no markdown fences. Start with [ and end with ].",
        input: attempt === 0 ? prompt : `${prompt}\n\nCRITICAL: previous response was not parseable JSON. Emit only a raw JSON array starting with [ ending with ]. No prose.`,
        image: pageContext?.viewportScreenshot || pageContext?.screenshot
      });
      lastRawText = result.text;
      const parsed = extractJSON(result.text);
      const rawFindings = Array.isArray(parsed) ? parsed : parsed?.findings || [];
      findings = rawFindings
        .map((raw, i) => normalizeFinding(raw, Array.isArray(lenses) ? lenses[0] : undefined, i))
        .filter(Boolean);
      if (findings.length === 0) console.log(`[ux-analyze] retry ${attempt + 1}: got ${rawFindings.length} raw, ${findings.length} normalized`);
      attempt++;
    }
    res.json({ findings, rawSample: findings.length === 0 ? lastRawText.slice(0, 400) : undefined });
  } catch (err) {
    res.status(500).json({ error: err.message || "UX analysis failed" });
  }
});

// Consolidates every analysis pass into one de-duplicated, severity-ranked,
// scored UXAudit. Deterministic (reproducible + offline-safe).
app.post("/api/merge-findings", (req, res) => {
  const { groups = [], pageContext } = req.body || {};
  try {
    const totalFindings = groups.flat().filter(Boolean).length;
    if (totalFindings === 0) {
      console.warn("[merge-findings] all groups empty — analysis passes produced no findings");
      return res.json({ audit: mergeAudit([], pageContext), warning: "No findings from any analysis pass. Check model output — likely JSON parse failure upstream." });
    }
    console.log(`[merge-findings] merging ${totalFindings} findings from ${groups.length} passes`);
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
const bridgeConnected = () => Date.now() - bridge.lastSeen < 90000;

// Enqueues a job for the plugin (either a build-from-spec or a clone-and-patch)
// and waits for the result.
async function enqueueBridge(payload, label) {
  const id = crypto.randomUUID();
  bridge.jobs.push({ id, payload });
  // 3-minute deadline: 30-op redesigns can take 90s+ on complex frames, and the
  // plugin has to serialize clone + patch through Figma's throttled main thread.
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const r = bridge.results.get(id);
    if (r) {
      bridge.results.delete(id);
      if (!r.ok) throw new Error(r.error || "The Figma plugin failed to build the redesign");
      return { mode: "bridge", text: `${label}${r.frameName ? ` — "${r.frameName}"` : ""}.${r.edits != null ? ` ${r.edits} content fixes applied.` : ""}`, frameId: r.frameId };
    }
    await new Promise((r2) => setTimeout(r2, 350));
  }
  throw new Error("The Figma bridge plugin didn't respond in time (180s). Make sure the Node Studio Bridge plugin is running and the Figma tab is foregrounded.");
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
  const { jobId, ok, frameId, frameName, error, edits, opErrors } = req.query;
  console.log(`[bridge] result for ${jobId}: ok=${ok} edits=${edits}${error ? " error=" + error : ""}${opErrors ? " opErrors=" + opErrors : ""}`);
  const { debug, skipped } = req.query;
  if (jobId) bridge.results.set(jobId, { jobId, ok: ok === "true" || ok === "1", frameId, frameName, error, edits: edits != null ? Number(edits) : undefined, debug, skipped, opErrors });
  res.json({ ok: true });
});
// App → is a plugin currently connected?
app.get("/api/figma-bridge/status", (_req, res) => res.json({ connected: bridgeConnected() }));

// Generate redesign operations from UX findings using the safe prompt template.
// Input: { sourceNodeId, findings, nodeTree, pageContext, provider?, model? }
// Output: { operations: [...], mode: "redesign", ... }
app.post("/api/generate-redesign", async (req, res) => {
  const { sourceNodeId, findings, nodeTree, pageContext, screenName,
    provider = "anthropic", model = "claude-opus-4-7" } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });
  if (!findings || !sourceNodeId) return res.status(400).json({ error: "findings and sourceNodeId required" });
  try {
    const { system, user } = buildRedesignPrompt(pageContext, findings, nodeTree || {});
    const result = await fn({ model, temperature: 0.2, systemPrompt: system, input: user });
    const parsed = extractJSON(result.text);
    if (!parsed || !parsed.operations) throw new Error("Model did not return valid operations JSON");
    parsed.sourceNodeId = sourceNodeId;
    if (screenName) parsed.screenName = screenName;
    console.log(`[generate-redesign] ${parsed.operations.length} operations generated`);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message || "Redesign generation failed" });
  }
});

// Governed generate — worker produces ops, reviewer critiques, worker regenerates
// until reviewer approves or maxAttempts hit. Returns approved spec + governance log.
// Input: { sourceNodeId, findings, nodeTree, pageContext, provider?, model?, maxAttempts?, minScore? }
app.post("/api/govern-generate", async (req, res) => {
  const { sourceNodeId, findings, nodeTree, pageContext, screenName,
    provider = "anthropic", model = "claude-opus-4-7",
    maxAttempts = 3, minScore = 7 } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });
  if (!findings || !sourceNodeId) return res.status(400).json({ error: "findings and sourceNodeId required" });

  const attemptsLog = [];
  let critique = "";
  let spec = null;
  let approved = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { system, user } = buildRedesignPrompt(pageContext, findings, nodeTree || {});
    const revisionNote = critique ? `\n\n## GOVERNANCE CRITIQUE FROM PRIOR ATTEMPT (address these BEFORE producing new JSON):\n${critique}\n\nRegenerate the operations addressing every point above. Do NOT repeat the same mistakes.` : "";
    const result = await fn({ model, temperature: 0.2, systemPrompt: system, input: user + revisionNote });
    spec = extractJSON(result.text);
    if (!spec || !spec.operations) {
      attemptsLog.push({ attempt, error: "invalid JSON from worker" });
      critique = "Prior response was not valid JSON. Return ONLY {mode:redesign, operations:[...]} — no prose, no markdown fences.";
      continue;
    }
    spec.sourceNodeId = sourceNodeId;
    if (screenName) spec.screenName = screenName;

    // Governance review
    const gov = await governRedesignSpec({ spec, findings, providerFn: fn, model, minScore });
    attemptsLog.push({
      attempt,
      ops: spec.operations.length,
      score: gov.score,
      verdict: gov.verdict,
      violationCount: gov.violations.length,
      approved: gov.approved
    });
    console.log(`[govern-generate] attempt ${attempt}: ${spec.operations.length} ops, score ${gov.score}/10, verdict ${gov.verdict}, approved ${gov.approved}`);

    if (gov.approved) {
      approved = true;
      break;
    }
    critique = gov.critique;
  }

  res.json({
    ...spec,
    _governance: {
      approved,
      attempts: attemptsLog.length,
      log: attemptsLog,
      finalScore: attemptsLog[attemptsLog.length - 1]?.score
    }
  });
});

// Full outer-loop orchestrator: capture → analyze → merge → generate → push → verify.
// If verifier fails, feeds gaps back to generate for the next iteration.
// Loop terminates on: (a) verifier passes, (b) convergence (2 same-score iterations),
// (c) maxIterations (default 3).
// Streams progress via Server-Sent Events.
// Input: { figmaUrl, provider?, model?, maxIterations?, targetScore? }
app.post("/api/loop-audit", async (req, res) => {
  const { figmaUrl, provider = "anthropic", model = "claude-opus-4-7",
    maxIterations = 3, targetScore = 7 } = req.body || {};
  if (!figmaUrl) return res.status(400).json({ error: "figmaUrl required" });

  // SSE headers
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  res.flushHeaders?.();
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const parseFigma = (url) => {
    const key = (url.match(/figma\.com\/(?:file|design|board)\/([A-Za-z0-9]+)/i) || [])[1];
    const rawNode = (url.match(/node-id=([0-9]+[-:][0-9]+)/i) || [])[1];
    const nodeId = rawNode ? rawNode.replace("-", ":") : null;
    return { key, nodeId };
  };

  try {
    const { key: fileKey, nodeId: sourceNodeId } = parseFigma(figmaUrl);
    if (!fileKey || !sourceNodeId) throw new Error("Could not parse Figma file key + node-id from URL");
    if (!bridgeConnected()) throw new Error("Figma bridge plugin not connected — open the Node Studio Bridge plugin in your Figma file");

    // Stage 1: capture
    emit("stage", { name: "capture", status: "running" });
    const pageContext = await captureFigmaDesign(figmaUrl);
    emit("stage", { name: "capture", status: "done", textItems: pageContext.textInventory?.length || 0 });

    // Stage 2: analyze (4 parallel lens passes)
    emit("stage", { name: "analyze", status: "running" });
    const lensSets = [
      ["nielsen", "wcag", "visualHierarchy", "gestalt"],
      ["navigation", "conversion", "trust", "forms"],
      ["contentReadability", "designConsistency", "cognitiveLoad", "mobileUX"],
      ["informationArchitecture", "interactionDesign", "progressiveDisclosure", "recognitionRecall"]
    ];
    const fn = PROVIDERS[provider];
    const analyses = await Promise.all(lensSets.map(async (lenses) => {
      const prompt = buildAnalysisPrompt(lenses, pageContext);
      const result = await fn({
        model, temperature: 0.4,
        systemPrompt: "You are a meticulous senior UX researcher. Return only valid JSON.",
        input: prompt,
        image: pageContext?.viewportScreenshot || pageContext?.screenshot
      });
      const parsed = extractJSON(result.text);
      const rawFindings = Array.isArray(parsed) ? parsed : parsed?.findings || [];
      return rawFindings.map((raw, i) => normalizeFinding(raw, lenses[0], i)).filter(Boolean);
    }));
    const allFindings = analyses.flat();
    emit("stage", { name: "analyze", status: "done", totalFindings: allFindings.length });
    if (allFindings.length === 0) throw new Error("No findings produced by any analysis pass");

    // Stage 3: merge / dedup
    const audit = mergeAudit(analyses, pageContext);
    emit("stage", { name: "merge", status: "done", uniqueFindings: audit.findings.length, score: audit.overallScore });

    // Outer loop
    let iterationFindings = audit.findings.slice(0, 15);
    let priorScore = -1;
    let bestResult = null;
    const iterationLog = [];
    // History of prior iterations' ops (compressed) — injected into the next
    // generate step so the model knows what didn't work and tries a different tack.
    const priorAttempts = [];

    for (let iter = 1; iter <= maxIterations; iter++) {
      emit("iteration", { n: iter, of: maxIterations, findingsToAddress: iterationFindings.length });

      // Generate operations — slim pageContext (drop base64 screenshots to stay under token cap)
      emit("stage", { name: "generate", status: "running", iteration: iter });
      const slimContext = {
        title: pageContext.title,
        url: pageContext.url,
        finalUrl: pageContext.finalUrl,
        headings: pageContext.headings?.slice(0, 20),
        buttons: pageContext.buttons?.slice(0, 20),
        textInventory: pageContext.textInventory?.slice(0, 40)
      };
      const { system: genSystem, user: genUser } = buildRedesignPrompt(slimContext, iterationFindings,
        { id: sourceNodeId, name: "Source", textInventory: pageContext.textInventory?.slice(0, 40) });
      // Append prior-attempts summary so the model doesn't repeat failed approaches.
      const historyBlock = priorAttempts.length ? `\n\n## PRIOR ATTEMPT HISTORY (avoid repeating what already failed)\n${priorAttempts.map((a, i) => `Iteration ${i + 1} scored ${a.score}/10 (${a.verdict}). Applied ${a.ops} ops (${a.actionSummary}). Verifier's remaining gaps: ${a.gaps.slice(0, 4).join("; ")}.`).join("\n")}\n\nThis is iteration ${iter}. Try a DIFFERENT approach for gaps that persist. Do not resend ops that were already tried.` : "";

      // Governance inner loop — worker generates, reviewer critiques, retry up to 3 times
      let spec = null;
      let critique = "";
      let govApproved = false;
      const govLog = [];
      const MAX_GOV_ATTEMPTS = 3;
      for (let govAttempt = 1; govAttempt <= MAX_GOV_ATTEMPTS; govAttempt++) {
        emit("governance", { iteration: iter, attempt: govAttempt, of: MAX_GOV_ATTEMPTS, status: "generating" });
        const revisionNote = critique ? `\n\n## GOVERNANCE CRITIQUE FROM PRIOR ATTEMPT (address these BEFORE producing new JSON):\n${critique}\n\nRegenerate the operations addressing every point above. Do NOT repeat the same mistakes.` : "";
        const genResult = await fn({ model, temperature: 0.2, systemPrompt: genSystem, input: genUser + historyBlock + revisionNote });
        spec = extractJSON(genResult.text);
        if (!spec || !spec.operations) {
          govLog.push({ attempt: govAttempt, error: "invalid JSON" });
          critique = "Prior response was not valid JSON. Return ONLY the JSON object — no prose, no markdown fences.";
          emit("governance", { iteration: iter, attempt: govAttempt, status: "rejected", reason: "invalid JSON" });
          continue;
        }
        // Review
        emit("governance", { iteration: iter, attempt: govAttempt, status: "reviewing", ops: spec.operations.length });
        const gov = await governRedesignSpec({ spec, findings: iterationFindings, providerFn: fn, model, minScore: 6 });
        govLog.push({ attempt: govAttempt, ops: spec.operations.length, score: gov.score, verdict: gov.verdict, approved: gov.approved, violations: gov.violations.length });
        emit("governance", { iteration: iter, attempt: govAttempt, status: gov.approved ? "approved" : "rejected", score: gov.score, verdict: gov.verdict, violations: gov.violations.length });
        console.log(`[loop-audit iter ${iter}] gov attempt ${govAttempt}: ${spec.operations.length} ops, score ${gov.score}/10, verdict ${gov.verdict}`);
        if (gov.approved) { govApproved = true; break; }
        critique = gov.critique;
      }
      if (!spec || !spec.operations) throw new Error(`Iteration ${iter}: all ${MAX_GOV_ATTEMPTS} governance attempts failed to produce valid ops`);
      spec.sourceNodeId = sourceNodeId;
      spec.screenName = `Loop iter ${iter} — AI Redesign`;
      emit("stage", { name: "generate", status: "done", iteration: iter, ops: spec.operations.length, governanceApproved: govApproved, governanceAttempts: govLog.length });

      // Push to Figma
      emit("stage", { name: "push", status: "running", iteration: iter });
      const push = await enqueueBridge(
        { mode: "redesign", sourceNodeId: spec.sourceNodeId, operations: spec.operations, screenName: spec.screenName },
        "Loop iteration applied"
      );
      const redesignNodeId = push.frameId;
      emit("stage", { name: "push", status: "done", iteration: iter, redesignNodeId });

      // Verify
      emit("stage", { name: "verify", status: "running", iteration: iter });
      const findingsList = iterationFindings.slice(0, 15).map((f, i) =>
        `${i + 1}. [${f.severity}] ${f.title}: ${f.recommendation || f.description}`
      ).join("\n");
      const token = process.env.FIGMA_TOKEN;
      const imgRes = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(redesignNodeId)}&format=png&scale=1`, {
        headers: { "X-Figma-Token": token }
      });
      const imgData = await imgRes.json();
      const shotUrl = imgData.images?.[redesignNodeId];
      if (!shotUrl) throw new Error(`Iteration ${iter}: could not fetch screenshot`);
      const buf = Buffer.from(await (await fetch(shotUrl)).arrayBuffer());
      const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

      const verifyResult = await fn({
        model, temperature: 0.1,
        systemPrompt: `You are a UX verifier. Return ONLY valid JSON: {"score": <0-10>, "verdict": "pass"|"fail"|"partial", "resolvedCount": N, "gaps": ["specific finding still visible"], "recommendations": ["fix for next iteration"]}. Score >= ${targetScore} = pass.`,
        input: `Original findings:\n${findingsList}\n\nJudge redesign visually. Return JSON verdict.`,
        image: dataUrl
      });
      const verdict = extractJSON(verifyResult.text);
      if (!verdict) throw new Error(`Iteration ${iter}: verifier returned invalid JSON`);
      const score = verdict.score || 0;
      const passed = score >= targetScore;

      iterationLog.push({ iteration: iter, score, verdict: verdict.verdict, resolved: verdict.resolvedCount, gaps: verdict.gaps || [], redesignNodeId });
      // Track ops summary for prior-attempts injection into next iter's prompt.
      const actionCounts = {};
      for (const op of spec.operations) { actionCounts[op.action] = (actionCounts[op.action] || 0) + 1; }
      const actionSummary = Object.entries(actionCounts).map(([a, c]) => `${a}×${c}`).join(", ");
      priorAttempts.push({ score, verdict: verdict.verdict, ops: spec.operations.length, actionSummary, gaps: verdict.gaps || [] });
      bestResult = !bestResult || score > bestResult.score ? { score, redesignNodeId, iteration: iter, verdict } : bestResult;
      emit("verify", { iteration: iter, score, verdict: verdict.verdict, gaps: verdict.gaps || [], passed, redesignNodeId });

      // Termination checks
      if (passed) {
        emit("done", { reason: "target_met", iterations: iter, best: bestResult, log: iterationLog });
        res.end();
        return;
      }
      if (score === priorScore && iter >= 2) {
        emit("done", { reason: "converged", iterations: iter, best: bestResult, log: iterationLog });
        res.end();
        return;
      }
      priorScore = score;

      // Feed gaps back for next iteration — augment findings with verifier gaps
      if (iter < maxIterations && verdict.gaps?.length) {
        const gapFindings = verdict.gaps.map((gap, i) => ({
          id: `V${String(i + 1).padStart(3, "0")}`,
          title: `Verifier gap: ${gap}`,
          severity: "high",
          recommendation: verdict.recommendations?.[i] || gap,
          lens: "verifier",
          confidence: 0.9
        }));
        iterationFindings = [...gapFindings, ...iterationFindings.slice(0, 10)];
      }
    }

    emit("done", { reason: "max_iterations", iterations: maxIterations, best: bestResult, log: iterationLog });
    res.end();
  } catch (err) {
    console.error("[loop-audit] error:", err.message);
    emit("error", { error: err.message || "Loop failed" });
    res.end();
  }
});

// Summarizes a user message into a 2-5 word conversation title.
// Used for auto-renaming new chats after the first user message.
app.post("/api/summarize-title", async (req, res) => {
  const { text, provider = "anthropic", model = "claude-opus-4-7" } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  const fn = PROVIDERS[provider];
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });
  try {
    // Fast path: if input is a URL, pull hostname + user's own words (skip URL path fragments)
    const urlPattern = /https?:\/\/\S+/gi;
    const hostMatch = String(text).match(/https?:\/\/([^\/\s?#]+)/i);
    let title;
    if (hostMatch) {
      const host = hostMatch[1].replace(/^www\./, "").split(".")[0];
      // Strip ALL URLs from the text before pulling context words
      const stripped = String(text).replace(urlPattern, "").trim();
      const contextWords = stripped.split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
      // Capitalize host
      const hostCap = host.charAt(0).toUpperCase() + host.slice(1);
      title = contextWords ? `${hostCap} — ${contextWords}`.slice(0, 44) : `${hostCap} audit`;
    } else {
      const result = await fn({
        model,
        systemPrompt: "You are a concise labeler. Given a user's task, return ONLY a 2-5 word title. No quotes. No punctuation. Capitalize like a headline. Return the label only.",
        input: String(text).slice(0, 400)
      });
      title = String(result.text || "").trim().replace(/^["']|["']$/g, "").replace(/[.!?]+$/, "").slice(0, 40) || "New workflow";
    }
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: err.message || "Title generation failed" });
  }
});

// Verifies a pushed redesign against the original findings by comparing
// screenshots via a vision-capable model. Returns a score + verdict + gap list.
// Input: { fileKey, sourceNodeId, redesignNodeId, findings, provider?, model?, targetScore? }
// Output: { score, verdict: "pass"|"fail"|"partial", gaps: [...], recommendations: [...] }
app.post("/api/verify-redesign", async (req, res) => {
  const { fileKey, sourceNodeId, redesignNodeId, findings,
    provider = "anthropic", model = "claude-opus-4-7", targetScore = 7 } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });
  if (!fileKey || !sourceNodeId || !redesignNodeId) {
    return res.status(400).json({ error: "fileKey, sourceNodeId, redesignNodeId required" });
  }
  const token = process.env.FIGMA_TOKEN;
  if (!token) return res.status(500).json({ error: "FIGMA_TOKEN not configured" });
  try {
    // Fetch both screenshots via Figma REST
    const ids = `${sourceNodeId},${redesignNodeId}`;
    const imgRes = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=1`, {
      headers: { "X-Figma-Token": token }
    });
    const imgData = await imgRes.json();
    const redesignUrl = imgData.images?.[redesignNodeId];
    if (!redesignUrl) throw new Error("Could not fetch redesign screenshot");
    const buf = Buffer.from(await (await fetch(redesignUrl)).arrayBuffer());
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

    const findingsList = (findings || []).slice(0, 15).map((f, i) =>
      `${i + 1}. [${f.severity}] ${f.title}: ${f.recommendation || f.description}`
    ).join("\n");

    const systemPrompt = `You are a UX verifier. Score a redesign against original findings.
Return ONLY valid JSON: {"score": <0-10>, "verdict": "pass"|"fail"|"partial", "resolvedCount": N, "gaps": ["finding still visible", ...], "recommendations": ["specific fix for next iteration", ...]}
Score >= ${targetScore} = pass. Below = fail if <5 findings resolved, partial otherwise.`;

    const input = `Original UX findings to verify against:
${findingsList}

The image shows the redesigned screen. For each finding, judge whether the redesign addresses it visually.
Return your JSON verdict.`;

    const result = await fn({
      model,
      temperature: 0.1,
      systemPrompt,
      input,
      image: dataUrl
    });
    const parsed = extractJSON(result.text);
    if (!parsed) throw new Error("Verifier did not return valid JSON");
    console.log(`[verify-redesign] score=${parsed.score}/10 verdict=${parsed.verdict} gaps=${parsed.gaps?.length || 0}`);
    res.json({ ...parsed, targetScore, passed: (parsed.score || 0) >= targetScore });
  } catch (err) {
    res.status(500).json({ error: err.message || "Verification failed" });
  }
});

// Produces EDITABLE Figma output from a redesign spec. Preference order:
// 1) the live bridge plugin (writes into the open file), 2) a Figma MCP server,
// 3) a plugin-ready spec for a supplied file link, else asks for a destination.
app.post("/api/figma-write", async (req, res) => {
  const { serverUrl, figmaFileUrl, spec } = req.body || {};
  try {
    console.log(`[figma-write] bridgeConnected=${bridgeConnected()} specLen=${(spec || "").length}`);
    if (bridgeConnected()) {
      const parsed = extractJSON(spec);
      console.log(`[figma-write] parsed.mode=${parsed && parsed.mode} sourceNodeId=${parsed && parsed.sourceNodeId}`);
      // Full AI redesign — structured operations (layout, fills, spacing, text, annotations)
      if (parsed && parsed.mode === "redesign" && parsed.sourceNodeId) {
        return res.json(await enqueueBridge(
          { mode: "redesign", sourceNodeId: parsed.sourceNodeId, operations: parsed.operations || [], screenName: parsed.screenName },
          "AI redesign applied to a copy of your design"
        ));
      }
      // Text/style patch only
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
    model = hasAnthropic ? "claude-opus-4-7" : "hermes3:latest"
  } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!task?.trim()) return res.status(400).json({ error: "Describe the workflow you want to build" });
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });

  const reasoningProvider = hasAnthropic ? "anthropic" : "ollama";
  const reasoningModel = hasAnthropic ? "claude-opus-4-7" : "hermes3:latest";

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
- Give the llm redesign node this EXACT systemPrompt (copy verbatim):
  "You are a senior UX designer generating Figma redesign OPERATIONS (not text patches). Input: UX audit findings + Figma layer tree. Output: ONLY valid JSON in this schema — { \\"mode\\": \\"redesign\\", \\"sourceNodeId\\": \\"<source frame id from the audit>\\", \\"screenName\\": \\"<name> — AI Redesign\\", \\"operations\\": [ { \\"selector\\": {\\"text\\":\\"...\\"|\\"name\\":\\"...\\"|\\"type\\":\\"FRAME\\",\\"exact\\":bool,\\"index\\":n,\\"parent\\":n}, \\"action\\": \\"setFill|setStroke|setCornerRadius|setSpacing|setOpacity|setText|addAnnotation\\", \\"value\\": ..., \\"opts\\": {...}, \\"weight\\": n } ] }. CRITICAL RULES: (1) NEVER use action \\"setSize\\" — it breaks auto-layout. (2) NEVER add padding via setSpacing where none existed — only ADJUST existing padding, adjust itemSpacing freely. (3) NEVER change fills on generic wrappers (\\"Container\\", \\"Margin\\", \\"Group\\", \\"Frame\\") — only leaf nodes or explicitly-named elements (\\"Button\\", \\"Card\\", \\"Background\\", \\"Nav\\"). (4) Prioritize DESIGN CHANGES over TEXT CHANGES: setFill on CTAs for contrast, setStroke on form fields for affordance, setCornerRadius on cards, setOpacity on de-emphasized elements. Only use setText when a finding explicitly names wrong/misleading text. (5) Use conservative professional colors from the existing palette — no garish or high-saturation hues. (6) NEVER use mode:\\"patch\\" — always use mode:\\"redesign\\" with operations array. (7) Max 30 operations. (8) One targeted change per operation. (9) Each addAnnotation goes to a separate panel and explains WHY a design change was made. Do NOT put annotation text into setText replacement values. Return the JSON directly with no markdown fences."
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

// Use dedicated env var so PORT leaking from Vite/concurrently doesn't hijack us.
const port = process.env.NODE_STUDIO_PORT || 8787;
app.listen(port, () => console.log(`AI Node Studio server on http://localhost:${port}`));
