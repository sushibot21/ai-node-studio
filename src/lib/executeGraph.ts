import type { Edge, Node } from "@xyflow/react";
import type { AnyNodeData } from "./types";

async function runProviderNode(body: Record<string, unknown>, endpoint = "/api/run-node") {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

function topoOrder(nodes: Node[], edges: Edge[]): string[] {
  const incoming = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => {
    incoming.set(n.id, 0);
    adj.set(n.id, []);
  });
  edges.forEach((e) => {
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
    adj.get(e.source)?.push(e.target);
  });
  const queue = nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) || []) {
      incoming.set(next, (incoming.get(next) || 1) - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  // If a cycle exists, fall back to appending any leftover nodes so execution
  // doesn't silently drop them (their inputs may just be incomplete).
  if (order.length < nodes.length) {
    nodes.forEach((n) => {
      if (!order.includes(n.id)) order.push(n.id);
    });
  }
  return order;
}

export interface ExecuteCallbacks {
  onNodeStart: (id: string) => void;
  onNodeDone: (id: string, output: string) => void;
  onNodeError: (id: string, error: string) => void;
}

export async function executeGraph(
  nodes: Node<AnyNodeData>[],
  edges: Edge[],
  cb: ExecuteCallbacks
) {
  const order = topoOrder(nodes, edges);
  const outputs = new Map<string, string>();

  for (const id of order) {
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    const data = node.data;

    const incomingEdges = edges.filter((e) => e.target === id);
    const inputs = incomingEdges.map((e) => outputs.get(e.source) || "");

    cb.onNodeStart(id);
    try {
      let result = "";
      if (data.kind === "textInput") {
        result = data.text;
      } else if (data.kind === "template") {
        result = data.template.replace(/{{\s*in(\d+)\s*}}/g, (_m, idx) => {
          return inputs[Number(idx) - 1] ?? "";
        });
        if (!/{{\s*in\d+\s*}}/.test(data.template) && inputs.length) {
          // No placeholders used: just join all inputs.
          result = inputs.join("\n\n");
        }
      } else if (data.kind === "llm") {
        const combinedInput = inputs.join("\n\n") || "(no input connected)";
        const res = await runProviderNode({
          provider: data.provider,
          model: data.model,
          systemPrompt: data.systemPrompt,
          temperature: data.temperature,
          input: combinedInput
        });
        result = res.text || "";
      } else if (data.kind === "imageGen") {
        const combinedInput = inputs.join("\n\n") || "(no prompt connected)";
        const res = await runProviderNode({
          provider: data.provider,
          model: data.model,
          input: combinedInput
        });
        result = res.imageBase64 ? `data:image/png;base64,${res.imageBase64}` : "";
      } else if (data.kind === "iterativeRefiner") {
        const res = await runProviderNode({
          provider: data.provider,
          model: data.model,
          goal: data.goal,
          rubric: data.rubric,
          input: inputs.join("\n\n"),
          temperature: data.temperature,
          maxIterations: data.maxIterations,
          targetScore: data.targetScore
        }, "/api/refine");
        result = res.text || "";
        (data as any).history = res.history || [];
      } else if (data.kind === "mcpTool") {
        const input = inputs.join("\n\n");
        const source = data.argumentsTemplate || '{"input":"{{input}}"}';
        const args = JSON.parse(source.replace(/{{input}}/g, input.replace(/"/g, '\\"')));
        const res = await runProviderNode({ serverUrl: data.serverUrl, toolName: data.toolName, arguments: args }, "/api/mcp/call");
        result = res.text || "";
      } else if (data.kind === "output") {
        result = inputs.join("\n\n");
      }
      outputs.set(id, result);
      cb.onNodeDone(id, result);
    } catch (err: any) {
      cb.onNodeError(id, err?.message || "Node failed");
      outputs.set(id, "");
    }
  }
}
