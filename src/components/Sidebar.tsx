import React from "react";
import { useGraphStore } from "../store";
import { IconText, IconSparkle, IconTemplate, IconImage, IconRefresh, IconPlug, IconArrowOut, IconGlobe, IconSearch, IconMerge, IconReport, IconStar, IconCheck } from "./Icons";

const PALETTE = [
  { kind: "textInput", label: "Text Input", desc: "Raw text or link source", Icon: IconText },
  { kind: "llm", label: "LLM Chat", desc: "Prompt any provider", Icon: IconSparkle },
  { kind: "template", label: "Prompt Template", desc: "Compose multi-input prompts", Icon: IconTemplate },
  { kind: "imageGen", label: "Image Gen", desc: "Text → image", Icon: IconImage },
  { kind: "iterativeRefiner", label: "Iterative Refiner", desc: "Best-of-N with rubric", Icon: IconRefresh },
  { kind: "mcpTool", label: "MCP Tool", desc: "Call an MCP server", Icon: IconPlug },
  { kind: "output", label: "Output", desc: "Render + download", Icon: IconArrowOut }
];

// UX Review pipeline blocks (autonomous product audit → redesign → report).
const UX_PALETTE = [
  { kind: "webCapture", label: "Web Capture", desc: "Snapshot a URL", Icon: IconGlobe },
  { kind: "uxAnalysis", label: "UX Analysis", desc: "Score against lenses", Icon: IconSearch },
  { kind: "mergeFindings", label: "Merge Findings", desc: "Dedupe + rank", Icon: IconMerge },
  { kind: "reportGenerator", label: "Report", desc: "3-section deliverable", Icon: IconReport },
  { kind: "figmaWrite", label: "Figma Redesign", desc: "Push ops to Figma", Icon: IconStar },
  { kind: "verifyRedesign", label: "Verify", desc: "Re-audit the redesign", Icon: IconCheck }
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
      <div className="palette-grid">
        {PALETTE.map((p) => (
          <div
            key={p.kind}
            className="palette-item"
            draggable
            title={`${p.label} — ${p.desc}`}
            onDragStart={(e) => onDragStart(e, p.kind)}
          >
            <span className="palette-icon"><p.Icon /></span>
            <span className="palette-body">
              <span className="palette-label">{p.label}</span>
              <span className="palette-desc">{p.desc}</span>
            </span>
            <span className="palette-grip" aria-hidden="true">⋮⋮</span>
          </div>
        ))}
      </div>
      <h2>UX Review</h2>
      <div className="palette-grid">
        {UX_PALETTE.map((p) => (
          <div
            key={p.kind}
            className="palette-item"
            draggable
            title={`${p.label} — ${p.desc}`}
            onDragStart={(e) => onDragStart(e, p.kind)}
          >
            <span className="palette-icon"><p.Icon /></span>
            <span className="palette-body">
              <span className="palette-label">{p.label}</span>
              <span className="palette-desc">{p.desc}</span>
            </span>
            <span className="palette-grip" aria-hidden="true">⋮⋮</span>
          </div>
        ))}
      </div>
      <div className="sidebar-foot"><span className="local-dot" />Ollama connected</div>
    </aside>
  );
}
