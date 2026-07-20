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

// ---------------------------------------------------------------------------
// UX Review workflow
//
// These node kinds power the autonomous UX audit pipeline. They exchange data
// as JSON strings (the engine passes a single string between nodes), so each
// stage below documents the JSON shape it emits. The interfaces are exported
// so the report/merge stages can be type-checked rather than relying on `any`.
// ---------------------------------------------------------------------------

/** Captures a live page's DOM + metadata. Emits a JSON `PageContext` string. */
export interface WebCaptureData extends BaseNodeData {
  kind: "webCapture";
  url: string;
  viewport?: "desktop" | "mobile";
  /** Best-effort screenshot; degrades cleanly when no browser backend exists. */
  captureScreenshot?: boolean;
}

/** Runs one independent review pass over a set of UX lenses. Emits `Finding[]`. */
export interface UXAnalysisData extends BaseNodeData {
  kind: "uxAnalysis";
  provider: TextProvider;
  model: string;
  /** Lens keys from src/lib/uxLenses.ts, e.g. ["nielsen","wcag"]. */
  lenses: string[];
  temperature?: number;
}

/** Merges every analysis pass, de-duplicates, and severity-ranks. Emits `UXAudit`. */
export interface MergeFindingsData extends BaseNodeData {
  kind: "mergeFindings";
  provider: TextProvider;
  model: string;
}

/** Renders the verified audit into a presentation-grade HTML report. Emits HTML. */
export interface ReportGeneratorData extends BaseNodeData {
  kind: "reportGenerator";
  title?: string;
  reportUrl?: string;
}

/**
 * Sends a redesign spec to Figma. When a Figma MCP write server URL is set it
 * writes native layers via MCP; otherwise it emits a spec for the bundled
 * Figma plugin (see figma-screen-plugin/). Never rasterises.
 */
export interface FigmaWriteData extends BaseNodeData {
  kind: "figmaWrite";
  /** Optional Figma MCP Streamable-HTTP endpoint that exposes a write tool. */
  serverUrl?: string;
  /** The write tool name on that MCP server (e.g. "create_frame"). */
  toolName?: string;
  /** Destination Figma file/document link. Required before writing; the pipeline
   *  pauses here and asks the user if it's missing. */
  figmaFileUrl?: string;
}

/**
 * Verifies a pushed redesign against original UX findings using a vision model.
 * Screenshots the redesigned frame via Figma REST, feeds to Claude with findings,
 * returns {score, verdict, gaps, recommendations}. Enables the outer feedback loop.
 */
export interface VerifyRedesignData extends BaseNodeData {
  kind: "verifyRedesign";
  provider: TextProvider;
  model: string;
  targetScore: number;
  lastScore?: number;
  lastVerdict?: "pass" | "fail" | "partial";
  lastGaps?: string[];
}

export type Severity = "critical" | "high" | "medium" | "low";

/** A single audited issue. Every field is required so reports are never vague. */
export interface Finding {
  id: string;
  title: string;
  description: string;
  /** The violated heuristic or principle, e.g. "Nielsen #1: Visibility of status". */
  principle: string;
  /** The lens key that surfaced it. */
  lens: string;
  /** Concrete on-page evidence (element, copy, count) — not a generic claim. */
  evidence: string;
  severity: Severity;
  userImpact: string;
  recommendation: string;
  /** 0–1 model/heuristic confidence. */
  confidence: number;
}

/** Lightweight structural snapshot of the captured page. */
export interface PageContext {
  requestedUrl: string;
  finalUrl: string;
  redirected: boolean;
  status: number;
  title: string;
  description: string;
  lang: string;
  viewportMeta: string;
  headings: { level: number; text: string }[];
  counts: Record<string, number>;
  links: string[];
  buttons: string[];
  forms: { fields: number; labels: number }[];
  images: { total: number; withAlt: number };
  textSample: string;
  screenshot?: string | null;
  screenshotNote?: string;
  /** Notable element bounding boxes (from headless capture) for report markers. */
  regions?: { kind: string; label: string; tag: string; x: number; y: number; w: number; h: number }[];
  pageDimensions?: { width: number; height: number };
  notes?: string[];
}

/** The consolidated, verified audit that the report is built from. */
export interface UXAudit {
  url: string;
  title: string;
  overallScore: number;
  accessibilityScore: number;
  scorecard: { lens: string; score: number }[];
  severityBreakdown: Record<Severity, number>;
  findings: Finding[];
  quickWins: string[];
  longTerm: string[];
  confidence: number;
  methodology: string;
}

export type AnyNodeData =
  | TextInputData
  | LLMData
  | TemplateData
  | ImageGenData
  | OutputData
  | IterativeRefinerData
  | MCPToolData
  | WebCaptureData
  | UXAnalysisData
  | MergeFindingsData
  | ReportGeneratorData
  | FigmaWriteData
  | VerifyRedesignData;
