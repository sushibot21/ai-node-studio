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
import { SettingsModal } from "./components/SettingsModal";
import { TextInputNode } from "./nodes/TextInputNode";
import { LLMNode } from "./nodes/LLMNode";
import { TemplateNode } from "./nodes/TemplateNode";
import { ImageGenNode } from "./nodes/ImageGenNode";
import { OutputNode } from "./nodes/OutputNode";
import { IterativeRefinerNode } from "./nodes/IterativeRefinerNode";
import { MCPToolNode } from "./nodes/MCPToolNode";
import { WorkflowAssistant } from "./components/WorkflowAssistant";
import { GuidedFlow } from "./components/GuidedFlow";
import { executeGraph } from "./lib/executeGraph";
import type { AnyNodeData } from "./lib/types";

const nodeTypes = {
  textInput: TextInputNode,
  llm: LLMNode,
  template: TemplateNode,
  imageGen: ImageGenNode,
  output: OutputNode,
  iterativeRefiner: IterativeRefinerNode,
  mcpTool: MCPToolNode
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

  const runWorkflow = async (workflowNodes: Node<AnyNodeData>[], workflowEdges: any[]) => {
    setRunning(true);
    runStartedAt.current = Date.now();
    setRunProgress({ completed: 0, current: "Preparing graph", elapsed: 0 });
    await executeGraph(workflowNodes, workflowEdges, {
      onNodeStart: (id) => {
        const node = workflowNodes.find((item) => item.id === id);
        setRunProgress((progress) => ({ ...progress, current: node?.data.label || node?.data.kind || "Processing node" }));
        if (node) node.data = { ...node.data, status: "running", error: undefined } as AnyNodeData;
        updateNodeData(id, { status: "running", error: undefined });
      },
      onNodeDone: (id, output) => {
        const node = workflowNodes.find((item) => item.id === id);
        const refined = node?.data;
        if (node) node.data = { ...node.data, status: "done", output, ...(refined?.kind === "iterativeRefiner" ? { history: refined.history } : {}) } as AnyNodeData;
        updateNodeData(id, { status: "done", output, ...(refined?.kind === "iterativeRefiner" ? { history: refined.history } : {}) });
        setRunProgress((progress) => ({ ...progress, completed: progress.completed + 1 }));
      },
      onNodeError: (id, error) => {
        const node = workflowNodes.find((item) => item.id === id);
        if (node) node.data = { ...node.data, status: "error", error } as AnyNodeData;
        updateNodeData(id, { status: "error", error });
        setRunProgress((progress) => ({ ...progress, completed: progress.completed + 1 }));
      }
    });
    setGraph(workflowNodes, workflowEdges);
    setRunning(false);
    const outputNode = [...workflowNodes].reverse().find((node) => node.data.kind === "output");
    return outputNode?.data.output || [...workflowNodes].reverse().find((node) => node.data.output)?.data.output || "The workflow finished, but did not return text output.";
  };
  const runGraph = async () => { await runWorkflow(nodes, edges); };

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setRunProgress((progress) => ({ ...progress, elapsed: Math.round((Date.now() - runStartedAt.current) / 1000) })), 500);
    return () => window.clearInterval(timer);
  }, [running]);

  const totalNodes = Math.max(nodes.length, 1);
  const progressPercent = Math.round((runProgress.completed / totalNodes) * 100);
  const etaSeconds = runProgress.completed > 0 ? Math.max(0, Math.round((runProgress.elapsed / runProgress.completed) * (totalNodes - runProgress.completed))) : null;

  const loadSundaraDemo = () => {
    const brief = `You are a brand strategist. I am building a fictional D2C skincare brand called Sundara targeting urban Indian women aged 25–35. Build the identity step by step. Start with Step 1: Brand Positioning Statement. Ask for feedback before proceeding to the next step.`;
    const result = `Sundara is a sophisticated yet accessible D2C skincare brand tailored for urban Indian women aged 25–35. We bridge the gap between traditional beauty practices and cutting-edge science, using high-quality, natural ingredients to deliver premium, results-driven products that nurture your skin's natural glow while empowering you to embrace your unique beauty.\n\nFeedback: Please review this Brand Positioning Statement. I will proceed to the next step once approved.`;
    setGraph([
      { id: "sundara-brief", type: "textInput", position: { x: 60, y: 220 }, data: { kind: "textInput", label: "Sundara brand brief", text: brief, status: "done", output: brief } },
      { id: "sundara-refiner", type: "iterativeRefiner", position: { x: 410, y: 130 }, data: { kind: "iterativeRefiner", label: "Step 1: Positioning loop", provider: "ollama", model: "hermes3:latest", goal: brief, rubric: "Create only Step 1. Be concise, premium but accessible, relevant to urban Indian women aged 25–35, avoid unsupported claims, and ask for feedback at the end.", maxIterations: 3, targetScore: 9, temperature: 0.6, status: "done", output: result, history: [{ iteration: 1, score: 0, critique: "Initial draft created.", draft: result, selected: false, selectionReason: "Not selected: the later candidate scored 10/10." }, { iteration: 2, score: 10, critique: "Clear, relevant, concise, and asks for feedback.", draft: result, selected: true, selectionReason: "Selected: highest evaluation score (10/10)." }] } },
      { id: "sundara-output", type: "output", position: { x: 820, y: 220 }, data: { kind: "output", label: "Step 1 output", format: "markdown", status: "done", output: result } }
    ], [
      { id: "sundara-brief-refiner", source: "sundara-brief", target: "sundara-refiner" },
      { id: "sundara-refiner-output", source: "sundara-refiner", target: "sundara-output" }
    ]);
  };

  const createAssistantGraph = (graph: { nodes: any[]; edges: [number, number][]; task?: string }) => {
    const nodes = graph.nodes.slice(0, 12).map((spec, index) => {
      const kind = ["textInput", "llm", "template", "iterativeRefiner", "output"].includes(spec.kind) ? spec.kind : "textInput";
      const base = defaultDataFor(kind);
      const data = { ...base, ...spec, kind } as AnyNodeData;
      if (kind === "textInput" && !(data as any).text) (data as any).text = index === 0 ? graph.task || "" : "";
      if (kind === "template" && !(data as any).template) (data as any).template = spec.text || "{{in1}}";
      if (kind === "llm" && !(data as any).systemPrompt) (data as any).systemPrompt = spec.goal || "Help complete the connected task.";
      return { id: `assistant_${index}_${nextId()}`, type: kind, position: { x: 80 + index * 300, y: 180 }, data };
    });
    const edges = (graph.edges || []).filter(([from, to]) => nodes[from] && nodes[to]).map(([from, to], index) => ({ id: `assistant_edge_${index}`, source: nodes[from].id, target: nodes[to].id }));
    return { nodes, edges };
  };
  const applyAssistantGraph = (graph: { nodes: any[]; edges: [number, number][]; task?: string }) => {
    const workflow = createAssistantGraph(graph); setGraph(workflow.nodes, workflow.edges);
  };
  const runAssistantGraph = async (graph: { nodes: any[]; edges: [number, number][]; task?: string }) => {
    const workflow = createAssistantGraph(graph); setGraph(workflow.nodes, workflow.edges);
    return runWorkflow(workflow.nodes, workflow.edges);
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

  if (!showCanvas) return <GuidedFlow onApply={applyAssistantGraph} onRun={runAssistantGraph} onCanvas={() => setShowCanvas(true)} />;
  return (
    <div className="app-shell">
      <Sidebar />
      <div style={{ position: "relative", flex: 1 }} ref={wrapperRef}>
        <div className="topbar">
          <button className="btn primary" onClick={runGraph} disabled={running}>
            {running ? "Running…" : "▶ Run graph"}
          </button>
          <button className="btn" onClick={saveGraph}>
            Save
          </button>
          <button className="btn" onClick={loadSundaraDemo}>
            Load Sundara loop
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
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      <div className="view-toggle fixed-view-toggle"><button onClick={() => setShowCanvas(false)} title="Agent view"><i className="chat-mark" /></button><button className="active" title="Workflow view">&lt;&gt;</button></div>
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
