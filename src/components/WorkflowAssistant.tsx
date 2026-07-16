import React, { useState } from "react";

export function WorkflowAssistant({ onApply, onClose }: { onApply: (graph: any) => void; onClose: () => void }) {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const build = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/build-workflow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task }) });
      const graph = await res.json();
      if (!res.ok) throw new Error(graph.error || "Workflow creation failed");
      onApply({ ...graph, task }); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Workflow creation failed"); }
    finally { setLoading(false); }
  };
  return <div className="settings-overlay" onClick={onClose}><div className="settings-modal" onClick={(e) => e.stopPropagation()}>
    <h3>Workflow Assistant</h3>
    <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Describe what you want to accomplish. I’ll create a runnable graph using your local Ollama model.</p>
    <textarea className="assistant-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Example: Research three positioning angles for a D2C skincare brand, compare them, and return the strongest one." />
    {error && <div style={{ color: "var(--err)", fontSize: 12 }}>{error}</div>}
    <div className="node-row"><button className="btn primary" disabled={loading || !task.trim()} onClick={build}>{loading ? "Designing…" : "Create workflow"}</button><button className="btn" onClick={onClose}>Cancel</button></div>
  </div></div>;
}
