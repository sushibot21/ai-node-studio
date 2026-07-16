import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { MCPToolData } from "../lib/types";

export function MCPToolNode({ id, data }: { id: string; data: MCPToolData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const [tools, setTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const discover = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp/tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverUrl: data.serverUrl }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setTools(body.tools.map((tool: { name: string }) => tool.name));
    } catch (err) { updateNodeData(id, { error: err instanceof Error ? err.message : "Could not connect to MCP server" }); }
    finally { setLoading(false); }
  };
  return (
    <NodeChrome title="MCP Tool" data={data}>
      <Handle type="target" position={Position.Left} />
      <label>Streamable HTTP server URL</label>
      <input value={data.serverUrl} placeholder="https://mcp.example.com/mcp" onChange={(e) => updateNodeData(id, { serverUrl: e.target.value })} />
      <button className="btn" onClick={discover} disabled={!data.serverUrl || loading}>{loading ? "Discovering…" : "Discover tools"}</button>
      <label>Tool name</label>
      {tools.length ? <select value={data.toolName} onChange={(e) => updateNodeData(id, { toolName: e.target.value })}><option value="">Choose a tool</option>{tools.map((tool) => <option key={tool}>{tool}</option>)}</select> : <input value={data.toolName} placeholder="search, query, …" onChange={(e) => updateNodeData(id, { toolName: e.target.value })} />}
      <label>{'Arguments JSON — use {{input}}'}</label>
      <textarea value={data.argumentsTemplate} onChange={(e) => updateNodeData(id, { argumentsTemplate: e.target.value })} />
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
