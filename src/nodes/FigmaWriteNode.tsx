import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { FigmaWriteData } from "../lib/types";

// Capability flags returned by /api/figma-capabilities.
interface FigmaCaps {
  hasWrite: boolean;
  execute: boolean;
  frameCreation: boolean;
  autoLayout: boolean;
  componentCreation: boolean;
  componentInstance: boolean;
  textCreation: boolean;
  layerEditing: boolean;
  variableSupport: boolean;
  styleSupport: boolean;
  read: boolean;
  executeTool: string | null;
  writeTools: string[];
}

const CAP_ROWS: [keyof FigmaCaps, string][] = [
  ["read", "Read"],
  ["hasWrite", "Write"],
  ["frameCreation", "Frames"],
  ["autoLayout", "Auto Layout"],
  ["componentCreation", "Components"],
  ["componentInstance", "Instances"],
  ["textCreation", "Text"],
  ["layerEditing", "Layer editing"],
  ["variableSupport", "Variables"],
  ["styleSupport", "Styles"]
];

// Takes a redesign spec (from the upstream Claude node) and produces EDITABLE
// Figma output — never a raster. At run time: if a Figma MCP server URL is set,
// its capabilities are discovered and the redesign is written natively via the
// app's MCP layer; otherwise (or on failure) it falls back to the bundled plugin.
export function FigmaWriteNode({ id, data }: { id: string; data: FigmaWriteData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const [caps, setCaps] = useState<FigmaCaps | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState("");
  const specReady = !!data.output && !data.output.startsWith("data:");

  const detect = async () => {
    setProbing(true); setProbeError(""); setCaps(null);
    try {
      const res = await fetch("/api/figma-capabilities", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverUrl: data.serverUrl })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setCaps(body.capabilities);
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : "Could not reach the Figma MCP server");
    } finally { setProbing(false); }
  };

  return (
    <NodeChrome title="Figma Redesign" data={{ ...data, output: undefined }}>
      <Handle type="target" position={Position.Left} />
      <label>Figma MCP write server URL (Streamable HTTP, optional)</label>
      <input
        value={data.serverUrl || ""}
        placeholder="https://figma-mcp.example.com/mcp"
        onChange={(e) => updateNodeData(id, { serverUrl: e.target.value })}
      />
      <button className="btn" onClick={detect} disabled={!data.serverUrl || probing}>
        {probing ? "Detecting…" : "Detect capabilities"}
      </button>
      {probeError && <span style={{ color: "var(--err)", fontSize: 11 }}>{probeError}</span>}
      {caps && (
        <div className="figma-caps">
          {CAP_ROWS.map(([key, label]) => (
            <span key={key} className={caps[key] ? "cap ok" : "cap no"}>
              {caps[key] ? "✓" : "✗"} {label}
            </span>
          ))}
          {caps.executeTool && <span className="cap-note">Write via <code>{caps.executeTool}</code></span>}
        </div>
      )}
      <label>Write tool name (optional — auto-selects an execute tool)</label>
      <input
        value={data.toolName || ""}
        placeholder="e.g. figma_execute"
        onChange={(e) => updateNodeData(id, { toolName: e.target.value })}
      />
      <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
        No server → emits an editable spec for the bundled plugin. Native + editable — never flattened.
      </span>
      {specReady && (
        <button className="btn" onClick={() => navigator.clipboard?.writeText(data.output || "")}>
          Copy result
        </button>
      )}
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
