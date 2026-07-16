import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { ImageGenData } from "../lib/types";

export function ImageGenNode({ id, data }: { id: string; data: ImageGenData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  return (
    <NodeChrome title="Image Generation" data={data}>
      <Handle type="target" position={Position.Left} />
      <label>Model</label>
      <select value={data.model} onChange={(e) => updateNodeData(id, { model: e.target.value })}>
        <option value="dall-e-3">dall-e-3</option>
      </select>
      <span style={{ color: "var(--text-dim)" }}>Prompt comes from connected input(s).</span>
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
