import React from "react";
import { useGraphStore } from "../store";
import { IconText, IconSparkle, IconTemplate, IconImage, IconRefresh, IconPlug, IconArrowOut, IconGlobe, IconSearch, IconMerge, IconReport, IconStar, IconCheck } from "./Icons";

const PALETTE = [
  { kind: "textInput", label: "Text Input", Icon: IconText },
  { kind: "llm", label: "LLM Chat", Icon: IconSparkle },
  { kind: "template", label: "Prompt Template", Icon: IconTemplate },
  { kind: "imageGen", label: "Image Generation", Icon: IconImage },
  { kind: "iterativeRefiner", label: "Iterative Refiner", Icon: IconRefresh },
  { kind: "mcpTool", label: "MCP Tool", Icon: IconPlug },
  { kind: "output", label: "Output", Icon: IconArrowOut }
];

// UX Review pipeline blocks (autonomous product audit → redesign → report).
const UX_PALETTE = [
  { kind: "webCapture", label: "Web Capture", Icon: IconGlobe },
  { kind: "uxAnalysis", label: "UX Analysis", Icon: IconSearch },
  { kind: "mergeFindings", label: "Merge Findings", Icon: IconMerge },
  { kind: "reportGenerator", label: "Report Generator", Icon: IconReport },
  { kind: "figmaWrite", label: "Figma Redesign", Icon: IconStar },
  { kind: "verifyRedesign", label: "Verify Redesign", Icon: IconCheck }
];

export function Sidebar({ viewToggle }: { viewToggle?: React.ReactNode } = {}) {
  const { chats, activeChatId, newChat, selectChat, renameChat } = useGraphStore();
  const onDragStart = (e: React.DragEvent, kind: string) => {
    e.dataTransfer.setData("application/reactflow", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-lockup"><div className="brand-mark">N</div><div><b>Node Studio</b><span>LOCAL AI WORKFLOWS</span></div></div>
      </div>
      {viewToggle}
      <div className="sidebar-copy">Build, compare, and refine AI workflows.</div>
      <div className="chat-heading"><h2>Conversations</h2><button onClick={newChat} title="New conversation" aria-label="New conversation"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 4v12M4 10h12"/></svg></button></div>
      <div className="chat-list">{chats.map((chat) => <div key={chat.id} className={`chat-item ${chat.id === activeChatId ? "active" : ""}`} onClick={() => selectChat(chat.id)}>
        <span className="chat-dot" aria-hidden="true" /><input value={chat.title} onClick={(e) => e.stopPropagation()} onChange={(e) => renameChat(chat.id, e.target.value)} aria-label="Conversation title" />
      </div>)}</div>
      <h2>Build blocks</h2>
      {PALETTE.map((p) => (
        <div
          key={p.kind}
          className="palette-item"
          draggable
          onDragStart={(e) => onDragStart(e, p.kind)}
        >
          <span className="palette-icon"><p.Icon /></span>{p.label}
        </div>
      ))}
      <h2>UX Review</h2>
      {UX_PALETTE.map((p) => (
        <div
          key={p.kind}
          className="palette-item"
          draggable
          onDragStart={(e) => onDragStart(e, p.kind)}
        >
          <span className="palette-icon"><p.Icon /></span>{p.label}
        </div>
      ))}
      <div className="sidebar-foot"><span className="local-dot" />Ollama connected</div>
    </aside>
  );
}
