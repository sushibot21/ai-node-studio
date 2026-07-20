import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { VerifyRedesignData } from "../lib/types";
import { MODELS, PROVIDER_LABEL } from "../lib/models";

// Verifies a pushed redesign against the original findings via a vision model.
// Screenshots the redesign frame through Figma REST and asks the model whether
// each finding is now addressed. Emits {score, verdict, gaps, recommendations}.
export function VerifyRedesignNode({ id, data }: { id: string; data: VerifyRedesignData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const out = (data.output && (() => { try { return JSON.parse(data.output); } catch { return null; } })()) as
    | { score?: number; verdict?: string; resolvedCount?: number; gaps?: string[]; recommendations?: string[]; passed?: boolean }
    | null;

  return (
    <NodeChrome title="Verify Redesign" data={{ ...data, output: undefined }}>
      <Handle type="target" position={Position.Left} />
      <label>Provider</label>
      <select
        value={data.provider}
        onChange={(e) => updateNodeData(id, { provider: e.target.value as any })}
      >
        {Object.keys(MODELS).map((p) => (
          <option key={p} value={p}>{PROVIDER_LABEL[p as keyof typeof PROVIDER_LABEL]}</option>
        ))}
      </select>
      <label>Model</label>
      <select
        value={data.model}
        onChange={(e) => updateNodeData(id, { model: e.target.value })}
      >
        {(MODELS[data.provider] || []).map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <label>Target score (0-10)</label>
      <input
        type="number"
        min={0}
        max={10}
        step={0.5}
        value={data.targetScore ?? 7}
        onChange={(e) => updateNodeData(id, { targetScore: Number(e.target.value) })}
      />
      <span style={{ color: "var(--text-medium)", fontSize: 11 }}>
        Screenshots the pushed redesign, judges it against original findings, and returns a score.
        Pipe result into an Iterative Refiner or a second Generate Redesign to close the loop.
      </span>
      {out && (
        <div className="final-choice" style={{ borderColor: out.passed ? "var(--positive-default)" : "var(--negative-default)", background: out.passed ? "var(--positive-softest)" : "var(--negative-softest)" }}>
          <div><b>{out.passed ? "✓ Pass" : out.verdict === "partial" ? "◐ Partial" : "✗ Fail"}</b> — {out.score ?? "?"}/10</div>
          {out.resolvedCount != null && <span>Resolved {out.resolvedCount} findings.</span>}
          {out.gaps && out.gaps.length > 0 && (
            <details>
              <summary>{out.gaps.length} gap{out.gaps.length !== 1 ? "s" : ""}</summary>
              <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 11 }}>
                {out.gaps.slice(0, 5).map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
