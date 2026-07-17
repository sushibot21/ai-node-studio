import type { Edge, Node } from "@xyflow/react";
import type { AnyNodeData } from "./types";

// Signal for the currently-running graph, so provider fetches can be cancelled
// when the user hits Stop. Set at the start of executeGraph, cleared when done.
let activeSignal: AbortSignal | undefined;

async function runProviderNode(body: Record<string, unknown>, endpoint = "/api/run-node") {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: activeSignal
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

/** Tolerant JSON parse: unwraps ```json fences and returns null on failure. */
function tryParseJSON<T = any>(value: string): T | null {
  if (!value) return null;
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export interface ExecuteCallbacks {
  onNodeStart: (id: string) => void;
  onNodeDone: (id: string, output: string) => void;
  onNodeError: (id: string, error: string) => void;
}

/** Runs a single node's logic and returns its string output. */
async function executeNode(data: AnyNodeData, inputs: string[]): Promise<string> {
  if (data.kind === "textInput") {
    return data.text;
  }
  if (data.kind === "template") {
    const result = data.template.replace(/{{\s*in(\d+)\s*}}/g, (_m, idx) => inputs[Number(idx) - 1] ?? "");
    if (!/{{\s*in\d+\s*}}/.test(data.template) && inputs.length) return inputs.join("\n\n");
    return result;
  }
  if (data.kind === "llm") {
    const res = await runProviderNode({
      provider: data.provider, model: data.model, systemPrompt: data.systemPrompt,
      temperature: data.temperature, input: inputs.join("\n\n") || "(no input connected)"
    });
    return res.text || "";
  }
  if (data.kind === "imageGen") {
    const res = await runProviderNode({ provider: data.provider, model: data.model, input: inputs.join("\n\n") || "(no prompt connected)" });
    return res.imageBase64 ? `data:image/png;base64,${res.imageBase64}` : "";
  }
  if (data.kind === "iterativeRefiner") {
    const res = await runProviderNode({
      provider: data.provider, model: data.model, goal: data.goal, rubric: data.rubric,
      input: inputs.join("\n\n"), temperature: data.temperature, maxIterations: data.maxIterations, targetScore: data.targetScore
    }, "/api/refine");
    (data as any).history = res.history || [];
    return res.text || "";
  }
  if (data.kind === "mcpTool") {
    const input = inputs.join("\n\n");
    const source = data.argumentsTemplate || '{"input":"{{input}}"}';
    const args = JSON.parse(source.replace(/{{input}}/g, input.replace(/"/g, '\\"')));
    const res = await runProviderNode({ serverUrl: data.serverUrl, toolName: data.toolName, arguments: args }, "/api/mcp/call");
    return res.text || "";
  }
  if (data.kind === "webCapture") {
    const url = (inputs.find((value) => /^https?:\/\//i.test(value.trim())) || data.url || "").trim();
    const context = await runProviderNode({ url }, "/api/capture");
    return JSON.stringify(context);
  }
  if (data.kind === "uxAnalysis") {
    const pageContext = inputs.map((i) => tryParseJSON(i)).find((v) => v && v.finalUrl) || tryParseJSON(inputs[0]);
    const res = await runProviderNode(
      { provider: data.provider, model: data.model, temperature: data.temperature, lenses: data.lenses, pageContext },
      "/api/ux-analyze"
    );
    return JSON.stringify(res.findings || []);
  }
  if (data.kind === "mergeFindings") {
    const parsed = inputs.map((i) => tryParseJSON(i));
    const groups = parsed.filter((v) => Array.isArray(v)) as any[][];
    const pageContext = parsed.find((v) => v && !Array.isArray(v) && v.finalUrl);
    const res = await runProviderNode({ provider: data.provider, model: data.model, groups, pageContext }, "/api/merge-findings");
    return JSON.stringify(res.audit);
  }
  if (data.kind === "reportGenerator") {
    const parsed = inputs.map((i) => tryParseJSON(i));
    const audit = parsed.find((v) => v && Array.isArray(v.findings));
    // The capture node feeds the full page context (screenshot + regions) here
    // directly, so the report can render the annotated screenshot even though
    // the audit JSON is slimmed.
    const pageContext = parsed.find((v) => v && v.finalUrl && !Array.isArray(v.findings));
    const narrative = inputs.find((i) => !tryParseJSON(i));
    const res = await runProviderNode({ audit, narrative, title: data.title, pageContext }, "/api/report");
    return res.html || "";
  }
  if (data.kind === "figmaWrite") {
    // Two inputs: the LLM redesign (a sectioned spec OR a clone-and-fix patch)
    // and the merged audit (for its pageContext.textInventory + figmaNodeId).
    const parsed = inputs.map((i) => ({ raw: i, val: tryParseJSON<any>(i) }));
    const audit = parsed.find((p) => p.val && Array.isArray(p.val.findings))?.val;
    const llm = parsed.find((p) => p.val && (p.val.mode === "patch" || Array.isArray(p.val.sections)))?.val;
    let spec: string;
    if (llm?.mode === "patch") {
      // Resolve findIndex → the real design string (robust: no quoted text from the model).
      const inv: string[] = audit?.pageContext?.textInventory || [];
      const textEdits = (llm.textEdits || [])
        .map((e: any) => ({ find: typeof e.findIndex === "number" ? inv[e.findIndex] : e.find, replace: e.replace }))
        .filter((e: any) => e.find && e.replace);
      const styleEdits = (llm.styleEdits || [])
        .map((e: any) => ({ find: typeof e.findIndex === "number" ? inv[e.findIndex] : e.find, color: e.color }))
        .filter((e: any) => e.find && e.color);
      spec = JSON.stringify({ mode: "patch", sourceNodeId: llm.sourceNodeId || audit?.pageContext?.figmaNodeId, screenName: llm.screenName, textEdits, styleEdits });
    } else {
      spec = parsed.find((p) => p.val && Array.isArray(p.val.sections))?.raw || inputs.join("\n\n");
    }
    const res = await runProviderNode(
      { serverUrl: data.serverUrl, toolName: data.toolName, figmaFileUrl: data.figmaFileUrl, spec },
      "/api/figma-write"
    );
    return res.text || "";
  }
  if (data.kind === "output") {
    return inputs.join("\n\n");
  }
  return "";
}

export async function executeGraph(
  nodes: Node<AnyNodeData>[],
  edges: Edge[],
  cb: ExecuteCallbacks,
  signal?: AbortSignal
) {
  activeSignal = signal;
  const outputs = new Map<string, string>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const remaining = new Set(nodes.map((n) => n.id));

  const runOne = async (id: string) => {
    const node = nodeById.get(id);
    if (!node) { remaining.delete(id); return; }
    if (signal?.aborted) { remaining.delete(id); return; }
    const incomingEdges = edges.filter((e) => e.target === id);
    const inputs = incomingEdges.map((e) => outputs.get(e.source) || "");
    cb.onNodeStart(id);
    try {
      const result = await executeNode(node.data, inputs);
      outputs.set(id, result);
      cb.onNodeDone(id, result);
    } catch (err: any) {
      outputs.set(id, "");
      cb.onNodeError(id, err?.message || "Node failed");
    }
    remaining.delete(id);
  };

  // Dependency-wave execution: each wave runs every node whose inputs are ready
  // IN PARALLEL, so independent branches (e.g. the UX analysis passes) execute
  // concurrently instead of one-at-a-time. Preserves ordering across edges.
  try {
    while (remaining.size) {
      if (signal?.aborted) break; // user hit Stop — don't launch further waves
      const ready = [...remaining].filter((id) => !edges.some((e) => e.target === id && remaining.has(e.source)));
      const wave = ready.length ? ready : [...remaining]; // cycle fallback: force the rest
      await Promise.all(wave.map(runOne));
      if (!ready.length) break; // forced remaining (cycle) — stop to avoid looping
    }
  } finally {
    activeSignal = undefined;
  }
}
