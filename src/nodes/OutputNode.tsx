import React from "react";
import { Handle, Position } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { OutputData } from "../lib/types";

function download(filename: string, content: string, isImage: boolean) {
  const a = document.createElement("a");
  a.href = isImage ? content : `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
  a.download = filename;
  a.click();
}

export function OutputNode({ id, data }: { id: string; data: OutputData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const isImage = (data.output || "").startsWith("data:image");
  const [refining, setRefining] = React.useState(false);

  const refineWithFeedback = async () => {
    const incoming = edges.find((edge) => edge.target === id);
    const refiner = nodes.find((node) => node.id === incoming?.source);
    if (!data.feedback?.trim()) return;
    if (refiner?.data.kind !== "iterativeRefiner") {
      updateNodeData(id, { error: "Connect an Iterative Refiner directly to this Output node to revise from feedback." });
      return;
    }
    setRefining(true);
    updateNodeData(id, { status: "running", error: undefined, approval: "needs-revision" });
    try {
      const res = await fetch("/api/refine", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: refiner.data.provider, model: refiner.data.model, goal: refiner.data.goal,
          rubric: `${refiner.data.rubric}\nUser feedback to address: ${data.feedback}`,
          input: data.output || "", temperature: refiner.data.temperature,
          maxIterations: refiner.data.maxIterations, targetScore: refiner.data.targetScore
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Refinement failed");
      updateNodeData(refiner.id, { status: "done", output: body.text, history: body.history, error: undefined });
      updateNodeData(id, { status: "done", output: body.text, feedback: "", approval: undefined, error: undefined });
    } catch (err) {
      updateNodeData(id, { status: "error", error: err instanceof Error ? err.message : "Refinement failed" });
    } finally { setRefining(false); }
  };

  return (
    <NodeChrome title="Output" data={{ ...data, output: undefined }}>
      <Handle type="target" position={Position.Left} />
      <label>Render as</label>
      <select value={data.format} onChange={(e) => updateNodeData(id, { format: e.target.value as OutputData["format"] })}>
        <option value="auto">Auto-detect</option>
        <option value="text">Plain text</option>
        <option value="markdown">Markdown</option>
        <option value="image">Image</option>
        <option value="json">JSON</option>
      </select>
      <div className="output-preview">
        {!data.output && "Run the graph to see output here."}
        {data.output && isImage && <img src={data.output} alt="output" />}
        {data.output &&
          !isImage &&
          (data.format === "markdown" || data.format === "auto" ? (
            <ReactMarkdown>{data.output}</ReactMarkdown>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{data.output}</pre>
          ))}
      </div>
      {!isImage && data.output && (
        <div className="feedback-panel">
          <label>Feedback on this output</label>
          <textarea value={data.feedback || ""} placeholder="e.g. Make it warmer, less premium, and mention sensitive skin."
            onChange={(e) => updateNodeData(id, { feedback: e.target.value, approval: undefined })} />
          <div className="node-row">
            <button className="btn primary" onClick={() => updateNodeData(id, { approval: "approved", feedback: "" })}>✓ Approve</button>
            <button className="btn" disabled={refining || !data.feedback?.trim()} onClick={refineWithFeedback}>{refining ? "Refining…" : "Refine with feedback"}</button>
          </div>
          {data.approval === "approved" && <span className="approval-note">Approved — ready for the next step.</span>}
        </div>
      )}
      {data.output && (
        <button
          className="btn"
          onClick={() => download(isImage ? "output.png" : "output.txt", data.output!, isImage)}
        >
          Download
        </button>
      )}
    </NodeChrome>
  );
}
