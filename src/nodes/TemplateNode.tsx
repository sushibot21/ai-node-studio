import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { TemplateData } from "../lib/types";

export function TemplateNode({ id, data }: { id: string; data: TemplateData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  return (
    <NodeChrome title="Prompt Template" data={data}>
      <Handle type="target" position={Position.Left} />
      <label>Template (use {"{{in1}}"}, {"{{in2}}"}... for each incoming wire, in connection order)</label>
      <textarea
        value={data.template}
        placeholder="Critique this draft: {{in1}}"
        onChange={(e) => updateNodeData(id, { template: e.target.value })}
      />
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
