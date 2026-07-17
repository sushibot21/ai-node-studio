import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import { MODELS, PROVIDER_LABEL } from "../lib/models";
import { UX_LENSES, LENS_LABEL } from "../lib/uxLenses";
import type { UXAnalysisData, TextProvider } from "../lib/types";

// One independent UX review pass. Runs each selected lens against the captured
// PageContext and emits a JSON array of structured Findings. Several of these
// (with different lens sets) run in parallel branches in the auto-built graph.
export function UXAnalysisNode({ id, data }: { id: string; data: UXAnalysisData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const selected = new Set(data.lenses || []);
  const toggle = (key: string) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    updateNodeData(id, { lenses: [...next] });
  };
  return (
    <NodeChrome title={`UX Analysis${data.label ? ` — ${data.label}` : ""}`} data={data}>
      <Handle type="target" position={Position.Left} />
      <label>Provider</label>
      <select
        value={data.provider}
        onChange={(e) => {
          const provider = e.target.value as TextProvider;
          updateNodeData(id, { provider, model: MODELS[provider][0] });
        }}
      >
        {(Object.keys(MODELS) as TextProvider[]).map((p) => (
          <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
        ))}
      </select>
      <label>Model</label>
      <select value={data.model} onChange={(e) => updateNodeData(id, { model: e.target.value })}>
        {MODELS[data.provider].map((m) => <option key={m}>{m}</option>)}
      </select>
      <label>Review lenses ({selected.size} selected)</label>
      <div className="lens-grid">
        {UX_LENSES.map((lens) => (
          <label key={lens.key} className="lens-item">
            <input type="checkbox" checked={selected.has(lens.key)} onChange={() => toggle(lens.key)} />
            {LENS_LABEL[lens.key]}
          </label>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
