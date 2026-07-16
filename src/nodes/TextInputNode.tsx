import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { TextInputData } from "../lib/types";

export function TextInputNode({ id, data }: { id: string; data: TextInputData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const type = data.inputType || "text";
  const attach = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateNodeData(id, { attachmentName: file.name, attachmentData: reader.result as string, text: `[${type} attachment: ${file.name}]` });
    reader.readAsDataURL(file);
  };
  return (
    <NodeChrome title="Input" data={data}>
      <select value={type} onChange={(e) => updateNodeData(id, { inputType: e.target.value, text: "", attachmentData: undefined, attachmentName: undefined })}>
        <option value="text">Text</option><option value="link">Link / URL</option><option value="image">Image</option><option value="audio">Voice / audio</option>
      </select>
      {(type === "text" || type === "link") ? <textarea value={data.text} placeholder={type === "link" ? "Paste a URL…" : "Type or paste text here…"} onChange={(e) => updateNodeData(id, { text: e.target.value })} /> : <>
        <input type="file" accept={type === "image" ? "image/*" : "audio/*"} onChange={(e) => attach(e.target.files?.[0])} />
        <span className="attachment-name">{data.attachmentName || `Choose a ${type} file`}</span>
      </>}
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
