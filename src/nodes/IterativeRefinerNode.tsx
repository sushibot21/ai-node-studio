import React from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { IterativeRefinerData, LLMData } from "../lib/types";

const MODELS: Record<LLMData["provider"], string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash"],
  ollama: ["hermes3:latest", "gemma4:e4b", "gemma3:4b", "qwen3:14b"]
};

export function IterativeRefinerNode({ id, data }: { id: string; data: IterativeRefinerData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const updateNodeInternals = useUpdateNodeInternals();
  const finalCandidate = data.history?.find((item) => item.selected) || data.history?.reduce((best, item) => item.score > best.score ? item : best, data.history[0]);
  const measureAfterToggle = () => window.requestAnimationFrame(() => updateNodeInternals(id));
  return (
    <NodeChrome title="Iterative Refiner" data={data}>
      <Handle type="target" position={Position.Left} />
      <label>Goal</label>
      <textarea value={data.goal} placeholder="Create the best…" onChange={(e) => updateNodeData(id, { goal: e.target.value })} />
      <label>Provider</label>
      <select value={data.provider} onChange={(e) => {
        const provider = e.target.value as LLMData["provider"];
        updateNodeData(id, { provider, model: MODELS[provider][0] });
      }}>
        <option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="ollama">Ollama (local)</option>
      </select>
      <label>Model</label>
      <select value={data.model} onChange={(e) => updateNodeData(id, { model: e.target.value })}>
        {MODELS[data.provider].map((model) => <option key={model}>{model}</option>)}
      </select>
      <label>Rubric</label>
      <textarea value={data.rubric} onChange={(e) => updateNodeData(id, { rubric: e.target.value })} />
      <label>Quality target {data.targetScore}/10 · compare all {data.maxIterations} rounds</label>
      <div className="node-row">
        <input type="number" min={1} max={10} value={data.targetScore} onChange={(e) => updateNodeData(id, { targetScore: Number(e.target.value) })} />
        <input type="number" min={1} max={25} value={data.maxIterations} onChange={(e) => updateNodeData(id, { maxIterations: Number(e.target.value) })} />
      </div>
      {!!finalCandidate && <div className="final-choice">
        <strong>✓ Final choice — {finalCandidate.score}/10</strong>
        <span>{finalCandidate.selectionReason || `Selected because it received the highest score among ${data.history?.length} candidates.`}</span>
      </div>}
      {!!data.history?.length && <div className="iteration-history">
        <strong>Candidate history</strong>
        {data.history.map((item) => {
          const selected = item === finalCandidate;
          return <details key={item.iteration} className={selected ? "iteration-selected" : ""} onToggle={measureAfterToggle}>
          <summary>Round {item.iteration}: {item.score}/10 {selected ? "— final" : "— not selected"}</summary>
          <div><b>Reason:</b> {item.selectionReason || (selected ? "Highest-scoring candidate in this run." : `Not selected: a stronger candidate scored ${finalCandidate.score}/10.`)}</div>
          <div><b>Evaluator:</b> {item.critique}</div>
          <pre>{item.draft}</pre>
        </details>})}
      </div>}
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
