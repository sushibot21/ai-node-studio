import type { TextProvider } from "./types";

// Provider → selectable models. Shared by the UX Review nodes so the option
// lists live in one place. (The original LLM/Refiner nodes keep their own copy;
// this module is the reuse point for new nodes and future consolidation.)
export const MODELS: Record<TextProvider, string[]> = {
  anthropic: ["claude-opus-4-7", "claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash"],
  ollama: ["hermes3:latest", "gemma3:4b", "qwen3:14b"]
};

export const PROVIDER_LABEL: Record<TextProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
  ollama: "Ollama (local)"
};
