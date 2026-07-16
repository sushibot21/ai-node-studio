import "dotenv/config";
import express from "express";
import cors from "cors";
import { PROVIDERS } from "./providers.js";
import { callMCPTool, listMCPTools } from "./mcp.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

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

app.post("/api/mcp/tools", async (req, res) => {
  try { res.json({ tools: await listMCPTools(req.body?.serverUrl) }); }
  catch (err) { res.status(400).json({ error: err.message || "Could not discover MCP tools" }); }
});

app.post("/api/mcp/call", async (req, res) => {
  try { res.json(await callMCPTool(req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message || "MCP tool call failed" }); }
});

app.post("/api/build-workflow", async (req, res) => {
  const { task, provider = "ollama", model = "hermes3:latest" } = req.body || {};
  const fn = PROVIDERS[provider];
  if (!task?.trim()) return res.status(400).json({ error: "Describe the workflow you want to build" });
  if (!fn) return res.status(400).json({ error: `Unknown provider "${provider}"` });
  try {
    const prompt = `Design a node workflow for this task: ${task}\n\nReturn ONLY valid JSON with this exact shape:\n{"nodes":[{"kind":"textInput|llm|template|iterativeRefiner|output","label":"short label","text":"optional initial text","goal":"optional","rubric":"optional"}],"edges":[[0,1],[1,2]]}\n\nRules: use only listed kinds; include one textInput first and one output last; use iterativeRefiner when quality comparison helps; make edges refer to node indexes; keep it small and executable.`;
    const result = await fn({ model, temperature: 0.2, systemPrompt: "You are a workflow architect. Follow the requested JSON schema exactly.", input: prompt });
    const raw = result.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const graph = JSON.parse(raw);
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("The model returned an invalid workflow shape");
    res.json(graph);
  } catch (err) { res.status(500).json({ error: err.message || "Could not build workflow" }); }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`AI Node Studio server on http://localhost:${port}`));
