export type NodeStatus = "idle" | "running" | "done" | "error";

export interface BaseNodeData extends Record<string, unknown> {
  label?: string;
  status?: NodeStatus;
  output?: string; // text output, or "data:image/..." for images
  error?: string;
}

export interface TextInputData extends BaseNodeData {
  kind: "textInput";
  text: string;
  inputType?: "text" | "link" | "image" | "audio";
  attachmentName?: string;
  attachmentData?: string;
}

export type TextProvider = "anthropic" | "openai" | "gemini" | "ollama";

export interface LLMData extends BaseNodeData {
  kind: "llm";
  provider: TextProvider;
  model: string;
  systemPrompt: string;
  temperature: number;
}

export interface TemplateData extends BaseNodeData {
  kind: "template";
  // Use {{in1}}, {{in2}}, ... to reference incoming edges in connection order
  template: string;
}

export interface ImageGenData extends BaseNodeData {
  kind: "imageGen";
  provider: "openai-image";
  model: string;
}

export interface OutputData extends BaseNodeData {
  kind: "output";
  format: "auto" | "text" | "markdown" | "image" | "json";
  feedback?: string;
  approval?: "approved" | "needs-revision";
}

export interface IterativeRefinerData extends BaseNodeData {
  kind: "iterativeRefiner";
  provider: TextProvider;
  model: string;
  goal: string;
  rubric: string;
  maxIterations: number;
  targetScore: number;
  temperature: number;
  history?: IterationRecord[];
}

export interface IterationRecord {
  iteration: number;
  score: number;
  critique: string;
  draft: string;
  selected?: boolean;
  selectionReason?: string;
}

export interface MCPToolData extends BaseNodeData {
  kind: "mcpTool";
  serverUrl: string;
  toolName: string;
  argumentsTemplate: string;
}

export type AnyNodeData =
  | TextInputData
  | LLMData
  | TemplateData
  | ImageGenData
  | OutputData
  | IterativeRefinerData
  | MCPToolData;
