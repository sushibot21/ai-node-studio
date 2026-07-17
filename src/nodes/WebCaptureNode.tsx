import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { WebCaptureData } from "../lib/types";

// Entry point of the UX Review pipeline: takes a product URL, and at run time
// resolves redirects, loads the page, and extracts DOM/interface metadata into
// a PageContext (see executeGraph). Connect its output into UX Analysis passes.
export function WebCaptureNode({ id, data }: { id: string; data: WebCaptureData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  return (
    <NodeChrome title="Web Capture" data={data}>
      <label>Product URL</label>
      <input
        value={data.url}
        placeholder="https://example.com/product"
        onChange={(e) => updateNodeData(id, { url: e.target.value })}
      />
      <label>Viewport</label>
      <select
        value={data.viewport || "desktop"}
        onChange={(e) => updateNodeData(id, { viewport: e.target.value as WebCaptureData["viewport"] })}
      >
        <option value="desktop">Desktop</option>
        <option value="mobile">Mobile</option>
      </select>
      <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
        Resolves redirects, loads the page, and extracts DOM + interface metadata. Screenshots are
        best-effort and degrade cleanly when no browser backend is present.
      </span>
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
