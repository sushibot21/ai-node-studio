import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Node,
  type ReactFlowInstance
} from "@xyflow/react";
import { useGraphStore, nextId } from "./store";
import { Sidebar } from "./components/Sidebar";
import { ViewSwitch } from "./components/ViewSwitch";
import { SettingsModal } from "./components/SettingsModal";
import { TextInputNode } from "./nodes/TextInputNode";
import { LLMNode } from "./nodes/LLMNode";
import { TemplateNode } from "./nodes/TemplateNode";
import { ImageGenNode } from "./nodes/ImageGenNode";
import { OutputNode } from "./nodes/OutputNode";
import { IterativeRefinerNode } from "./nodes/IterativeRefinerNode";
import { MCPToolNode } from "./nodes/MCPToolNode";
import { WebCaptureNode } from "./nodes/WebCaptureNode";
import { UXAnalysisNode } from "./nodes/UXAnalysisNode";
import { MergeFindingsNode } from "./nodes/MergeFindingsNode";
import { ReportGeneratorNode, openReport } from "./nodes/ReportGeneratorNode";
import { FigmaWriteNode } from "./nodes/FigmaWriteNode";
import { VerifyRedesignNode } from "./nodes/VerifyRedesignNode";
import { buildUXReviewGraph, summarizeUXReview } from "./lib/uxReviewGraph";
import { buildFlipkartDemo } from "./lib/flipkartDemo";
import { layoutGraph } from "./lib/layoutGraph";
import { WorkflowAssistant } from "./components/WorkflowAssistant";
import { GuidedFlow } from "./components/GuidedFlow";
import { executeGraph } from "./lib/executeGraph";
import type { AnyNodeData, UXAudit } from "./lib/types";

// Progress updates streamed to the chat while a workflow runs.
export type ProgressFn = (p: { stage: string; completed: number; total: number }) => void;

const nodeTypes = {
  textInput: TextInputNode,
  llm: LLMNode,
  template: TemplateNode,
  imageGen: ImageGenNode,
  output: OutputNode,
  iterativeRefiner: IterativeRefinerNode,
  mcpTool: MCPToolNode,
  webCapture: WebCaptureNode,
  uxAnalysis: UXAnalysisNode,
  mergeFindings: MergeFindingsNode,
  reportGenerator: ReportGeneratorNode,
  figmaWrite: FigmaWriteNode,
  verifyRedesign: VerifyRedesignNode
};

function defaultDataFor(kind: string): AnyNodeData {
  switch (kind) {
    case "textInput":
      return { kind: "textInput", text: "" };
    case "llm":
      return {
        kind: "llm",
        provider: "ollama",
        model: "hermes3:latest",
        systemPrompt: "",
        temperature: 1
      };
    case "template":
      return { kind: "template", template: "{{in1}}" };
    case "imageGen":
      return { kind: "imageGen", provider: "openai-image", model: "dall-e-3" };
    case "output":
      return { kind: "output", format: "auto" };
    case "iterativeRefiner":
      return { kind: "iterativeRefiner", provider: "ollama", model: "hermes3:latest", goal: "", rubric: "Correct, clear, complete, and concise.", maxIterations: 4, targetScore: 9, temperature: 0.7 };
    case "mcpTool":
      return { kind: "mcpTool", serverUrl: "", toolName: "", argumentsTemplate: '{"input":"{{input}}"}' };
    case "webCapture":
      return { kind: "webCapture", url: "", viewport: "desktop", captureScreenshot: false };
    case "uxAnalysis":
      return { kind: "uxAnalysis", provider: "ollama", model: "hermes3:latest", lenses: ["nielsen"], temperature: 0.4 };
    case "mergeFindings":
      return { kind: "mergeFindings", provider: "ollama", model: "hermes3:latest" };
    case "reportGenerator":
      return { kind: "reportGenerator", title: "", reportUrl: "" };
    case "figmaWrite":
      return { kind: "figmaWrite", serverUrl: "", toolName: "", figmaFileUrl: "" };
    case "verifyRedesign":
      return { kind: "verifyRedesign", provider: "anthropic", model: "claude-opus-4-7", targetScore: 7 };
    default:
      return { kind: "textInput", text: "" };
  }
}

function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, updateNodeData, setGraph } =
    useGraphStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState({ completed: 0, current: "", elapsed: 0 });
  const runStartedAt = useRef(0);
  // Aborts the in-flight workflow run when the user hits Stop in the chat.
  const abortRef = useRef<AbortController | null>(null);
  // A Figma link supplied mid-run is queued here and written once the audit ends.
  const pendingFigmaRef = useRef("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/reactflow");
      if (!kind || !rfInstance.current || !wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = rfInstance.current.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      });
      const id = nextId();
      const newNode: Node<AnyNodeData> = {
        id,
        type: kind,
        position,
        data: defaultDataFor(kind)
      };
      addNode(newNode);
    },
    [addNode]
  );

  const runWorkflow = async (workflowNodes: Node<AnyNodeData>[], workflowEdges: any[], onProgress?: ProgressFn) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    runStartedAt.current = Date.now();
    setRunProgress({ completed: 0, current: "Preparing graph", elapsed: 0 });
    const total = Math.max(workflowNodes.length, 1);
    let done = 0;
    await executeGraph(workflowNodes, workflowEdges, {
      onNodeStart: (id) => {
        const node = workflowNodes.find((item) => item.id === id);
        const stage = node?.data.label || node?.data.kind || "Processing node";
        setRunProgress((progress) => ({ ...progress, current: stage }));
        onProgress?.({ stage, completed: done, total });
        if (node) node.data = { ...node.data, status: "running", error: undefined } as AnyNodeData;
        updateNodeData(id, { status: "running", error: undefined });
      },
      onNodeDone: (id, output) => {
        const node = workflowNodes.find((item) => item.id === id);
        const refined = node?.data;
        if (node) node.data = { ...node.data, status: "done", output, ...(refined?.kind === "iterativeRefiner" ? { history: refined.history } : {}) } as AnyNodeData;
        updateNodeData(id, { status: "done", output, ...(refined?.kind === "iterativeRefiner" ? { history: refined.history } : {}) });
        done += 1;
        setRunProgress((progress) => ({ ...progress, completed: progress.completed + 1 }));
      },
      onNodeError: (id, error) => {
        const node = workflowNodes.find((item) => item.id === id);
        if (node) node.data = { ...node.data, status: "error", error } as AnyNodeData;
        updateNodeData(id, { status: "error", error });
        done += 1;
        setRunProgress((progress) => ({ ...progress, completed: progress.completed + 1 }));
      }
    }, controller.signal);
    setGraph(workflowNodes, workflowEdges);
    setRunning(false);
    const stopped = controller.signal.aborted;
    abortRef.current = null;
    if (stopped) return "⏹ Stopped. The run was cancelled — any completed steps are kept, and you can send a new message anytime.";
    const outputNode = [...workflowNodes].reverse().find((node) => node.data.kind === "output");
    const raw = outputNode?.data.output || [...workflowNodes].reverse().find((node) => node.data.output)?.data.output || "";
    if (!raw) return "The workflow finished, but did not return text output.";
    // Return the model's full response — the chat needs the actual answer, not a
    // pointer to another view. Long JSON blobs are handled by the bubble's own
    // scroll container in styles.css so they don't blow up the conversation.
    return raw.trim();
  };
  const runGraph = async () => { await runWorkflow(nodes, edges); };
  // Cancel the in-flight run (from the chat Stop button).
  const stopRun = () => { abortRef.current?.abort(); };

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setRunProgress((progress) => ({ ...progress, elapsed: Math.round((Date.now() - runStartedAt.current) / 1000) })), 500);
    return () => window.clearInterval(timer);
  }, [running]);

  const totalNodes = Math.max(nodes.length, 1);
  const progressPercent = Math.round((runProgress.completed / totalNodes) * 100);
  const etaSeconds = runProgress.completed > 0 ? Math.max(0, Math.round((runProgress.elapsed / runProgress.completed) * (totalNodes - runProgress.completed))) : null;

  // One-click demo: loads a fully-completed autonomous UX Review of a Flipkart
  // product page (pre-computed, since Flipkart blocks live capture). Every node
  // is "done" with real outputs; the Report node opens a client-ready report.
  const loadFlipkartDemo = () => {
    const { nodes: demoNodes, edges: demoEdges } = buildFlipkartDemo();
    setGraph(demoNodes, demoEdges);
  };

  // Kinds the Workflow Assistant is allowed to place (now includes the UX
  // Review blocks so it can assemble a full audit pipeline on its own).
  const ASSISTANT_KINDS = ["textInput", "llm", "template", "iterativeRefiner", "output", "webCapture", "uxAnalysis", "mergeFindings", "reportGenerator", "figmaWrite", "mcpTool"];
  const firstUrl = (text?: string) => text?.match(/https?:\/\/[^\s"]+/i)?.[0] || "";

  const createAssistantGraph = (graph: { nodes: any[]; edges: [number, number][]; task?: string }) => {
    const url = firstUrl(graph.task);
    const nodes = graph.nodes.slice(0, 16).map((spec, index) => {
      const kind = ASSISTANT_KINDS.includes(spec.kind) ? spec.kind : "textInput";
      const base = defaultDataFor(kind);
      const data = { ...base, ...spec, kind } as AnyNodeData;
      if (kind === "textInput" && !(data as any).text) (data as any).text = index === 0 ? graph.task || "" : "";
      if (kind === "template" && !(data as any).template) (data as any).template = spec.text || "{{in1}}";
      if (kind === "llm" && !(data as any).systemPrompt) (data as any).systemPrompt = spec.goal || "Help complete the connected task.";
      // Seed the URL into the capture node (and a URL text input) if the assistant left it blank.
      if (kind === "webCapture" && !(data as any).url) (data as any).url = url;
      if (kind === "textInput" && url && index === 0) (data as any).text = url;
      // Guard: uxAnalysis must have a lens array.
      if (kind === "uxAnalysis" && !Array.isArray((data as any).lenses)) (data as any).lenses = ["nielsen"];
      // Position is assigned by layoutGraph below (layered, non-overlapping).
      return { id: `assistant_${index}_${nextId()}`, type: kind, position: { x: 0, y: 0 }, data };
    });
    const edges = (graph.edges || []).filter(([from, to]) => nodes[from] && nodes[to]).map(([from, to], index) => ({ id: `assistant_edge_${index}`, source: nodes[from].id, target: nodes[to].id }));
    return { nodes: layoutGraph(nodes, edges), edges };
  };
  const applyAssistantGraph = (graph: { nodes: any[]; edges: [number, number][]; task?: string }) => {
    const workflow = createAssistantGraph(graph); setGraph(workflow.nodes, workflow.edges);
  };
  const runAssistantGraph = async (graph: { nodes: any[]; edges: [number, number][]; task?: string }, onProgress?: ProgressFn) => {
    const workflow = createAssistantGraph(graph); setGraph(workflow.nodes, workflow.edges);
    return runWorkflow(workflow.nodes, workflow.edges, onProgress);
  };

  // Autonomous UX Review: build the full graph from a URL, run it, open the
  // report, and return a chat-facing summary. Reuses runWorkflow end to end.
  const runUXReview = async (url: string, figmaFileUrl = "", onProgress?: ProgressFn): Promise<string> => {
    const { nodes: reviewNodes, edges: reviewEdges } = buildUXReviewGraph(url, figmaFileUrl);
    setGraph(reviewNodes, reviewEdges);
    const runResult = await runWorkflow(reviewNodes, reviewEdges, onProgress);
    if (runResult.startsWith("⏹")) return runResult; // user stopped the audit
    const auditOutput = reviewNodes.find((node) => node.data.kind === "mergeFindings")?.data.output;
    const reportHtml = reviewNodes.find((node) => node.data.kind === "reportGenerator")?.data.output;
    let audit: UXAudit | null = null;
    try { audit = auditOutput ? (JSON.parse(auditOutput) as UXAudit) : null; } catch { audit = null; }
    // The report is not auto-opened; the chat shows Download PDF / Open HTML
    // buttons (it reads the report from the graph's Report node on click).
    let summary = summarizeUXReview(url, audit, !!reportHtml);
    // If a Figma link was queued while the audit ran, write the redesign now.
    if (pendingFigmaRef.current) {
      const pending = pendingFigmaRef.current;
      pendingFigmaRef.current = "";
      summary += `\n\n${await writeRedesignToFigma(pending, reviewNodes, reviewEdges)}`;
    } else {
      // Otherwise, if the write paused for a destination, surface the ask.
      const figmaOut = reviewNodes.find((node) => node.data.kind === "figmaWrite")?.data.output;
      if (figmaOut && figmaOut.startsWith("⏸")) summary += `\n\n${figmaOut}`;
    }
    return summary;
  };
  const applyUXReview = () => { const graph = buildUXReviewGraph(""); setGraph(graph.nodes, graph.edges); };

  const FIGMA_LINK_RE = /^https?:\/\/(www\.)?figma\.com\/(file|design|proto|board)\//i;

  // Writes the already-prepared redesign spec (from a graph's figmaWrite input)
  // to a Figma destination. Reused by the follow-up link and the auto-write.
  const writeRedesignToFigma = async (figmaFileUrl: string, gNodes: Node<AnyNodeData>[], gEdges: any[]): Promise<string> => {
    const figmaNode = gNodes.find((node) => node.data.kind === "figmaWrite");
    if (!figmaNode) return "There's no prepared redesign yet. Paste a product URL first and I'll run the audit.";
    const inEdge = gEdges.find((edge) => edge.target === figmaNode.id);
    const spec = gNodes.find((node) => node.id === inEdge?.source)?.data.output || "";
    if (!spec.trim()) return "The redesign spec isn't ready yet. Let the audit finish, then share your Figma link again.";
    updateNodeData(figmaNode.id, { figmaFileUrl, status: "running", error: undefined });
    try {
      const res = await fetch("/api/figma-write", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverUrl: (figmaNode.data as any).serverUrl, toolName: (figmaNode.data as any).toolName, figmaFileUrl, spec })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Figma write failed");
      updateNodeData(figmaNode.id, { status: "done", output: body.text });
      if (body.mode === "invalid-destination") return body.text;
      return `Validated ${figmaFileUrl} and generated the editable redesign for that file.\n\n${body.text}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Figma write failed";
      updateNodeData(figmaNode.id, { status: "error", error: message });
      return message;
    }
  };

  // Chat handler for a Figma link. If an audit is still running, queue the link
  // (written automatically on completion); otherwise write immediately.
  const provideFigmaLink = async (figmaFileUrl: string): Promise<string> => {
    if (!FIGMA_LINK_RE.test(figmaFileUrl)) return "That doesn't look like a Figma file link. Please paste one like https://www.figma.com/design/…";
    if (running) {
      pendingFigmaRef.current = figmaFileUrl;
      return "Got it — I'll write the redesign into that Figma file automatically as soon as the audit finishes.";
    }
    return writeRedesignToFigma(figmaFileUrl, nodes, edges);
  };

  const saveGraph = () => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "workflow.json";
    a.click();
  };

  const loadGraph = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        setGraph(parsed.nodes || [], parsed.edges || []);
      } catch {
        alert("Invalid workflow file");
      }
    };
    reader.readAsText(file);
  };

  if (!showCanvas) return <GuidedFlow onApply={applyAssistantGraph} onRun={runAssistantGraph} onUXReview={runUXReview} onFigmaLink={provideFigmaLink} onCanvas={() => setShowCanvas(true)} onStop={stopRun} running={running} runProgress={runProgress} etaSeconds={etaSeconds} totalNodes={totalNodes} />;
  return (
    <div className="app-shell">
      <Sidebar viewToggle={<ViewSwitch mode="workflow" onChange={(m) => { if (m === "agent") setShowCanvas(false); }} />} />
      <div style={{ position: "relative", flex: 1 }} ref={wrapperRef}>
        <div className="topbar">
          <button className="btn primary" onClick={runGraph} disabled={running}>
            {running ? "Running…" : "▶ Run graph"}
          </button>
          <button className="btn" onClick={saveGraph}>
            Save
          </button>
          <button className="btn" onClick={loadFlipkartDemo}>
            Load Flipkart demo
          </button>
          <button className="btn" onClick={applyUXReview} title="Build the autonomous UX Review graph — set a URL on the Capture node, then Run graph">
            ◎ UX Review
          </button>
          <button className="btn" onClick={() => setShowAssistant(true)}>✦ Workflow Assistant</button>
          {running && <div className="run-status">
            <div className="run-status-copy"><span className="run-pulse" />{runProgress.current} · {runProgress.completed}/{totalNodes}</div>
            <div className="run-track"><div style={{ width: `${progressPercent}%` }} /></div>
            <small>{runProgress.elapsed}s elapsed{etaSeconds !== null ? ` · ~${etaSeconds}s remaining` : " · estimating…"}</small>
          </div>}
          <label className="btn" style={{ marginBottom: 0 }}>
            Load
            <input type="file" accept="application/json" hidden onChange={loadGraph} />
          </label>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => setShowSettings(true)}>
            ⚙ Providers
          </button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(inst) => (rfInstance.current = inst)}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          minZoom={0.05}
          maxZoom={2.5}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        >
          <Background />
          <Controls showFitView showZoom />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAssistant && <WorkflowAssistant onClose={() => setShowAssistant(false)} onApply={applyAssistantGraph} />}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
