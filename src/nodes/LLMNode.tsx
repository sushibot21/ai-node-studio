import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { LLMData } from "../lib/types";

const MODELS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash"],
  ollama: ["hermes3:latest", "gemma4:e4b", "gemma3:4b", "qwen3:14b"]
};

export function LLMNode({ id, data }: { id: string; data: LLMData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  return (
    <NodeChrome title="LLM Chat" data={data}>
      <Handle type="target" position={Position.Left} />
      <label>Provider</label>
      <select
        value={data.provider}
        onChange={(e) => {
          const provider = e.target.value as LLMData["provider"];
          updateNodeData(id, { provider, model: MODELS[provider][0] });
        }}
      >
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI</option>
        <option value="gemini">Google Gemini</option>
        <option value="ollama">Ollama (local)</option>
      </select>
      <label>Model</label>
      <select value={data.model} onChange={(e) => updateNodeData(id, { model: e.target.value })}>
        {MODELS[data.provider].map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <label>System prompt</label>
      <textarea
        value={data.systemPrompt}
        placeholder="You are a..."
        onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
      />
      <label>Temperature: {data.temperature}</label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={data.temperature}
        onChange={(e) => updateNodeData(id, { temperature: Number(e.target.value) })}
      />
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
