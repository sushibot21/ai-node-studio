import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import { MODELS, PROVIDER_LABEL } from "../lib/models";
import type { MergeFindingsData, TextProvider } from "../lib/types";

// Consolidates every upstream analysis pass: concatenates findings, removes
// duplicates, computes severity breakdown + per-lens scorecard + overall UX
// score, and emits a single UXAudit JSON. Wire this into an Iterative Refiner
// to critique/strengthen the consolidated findings before reporting.
export function MergeFindingsNode({ id, data }: { id: string; data: MergeFindingsData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  return (
    <NodeChrome title="Merge Findings" data={data}>
      <Handle type="target" position={Position.Left} />
      <label>Provider (used to de-duplicate near-identical issues)</label>
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
      <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
        Merges all connected analysis passes, dedupes, and ranks by severity into one verified audit.
      </span>
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
