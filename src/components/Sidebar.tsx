import React from "react";
import { useGraphStore } from "../store";

const PALETTE = [
  { kind: "textInput", label: "Text Input", icon: "T" },
  { kind: "llm", label: "LLM Chat", icon: "✦" },
  { kind: "template", label: "Prompt Template", icon: "⌘" },
  { kind: "imageGen", label: "Image Generation", icon: "◒" },
  { kind: "iterativeRefiner", label: "Iterative Refiner", icon: "↻" },
  { kind: "mcpTool", label: "MCP Tool", icon: "⌁" },
  { kind: "output", label: "Output", icon: "↗" }
];

export function Sidebar() {
  const { chats, activeChatId, newChat, selectChat, renameChat } = useGraphStore();
  const onDragStart = (e: React.DragEvent, kind: string) => {
    e.dataTransfer.setData("application/reactflow", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark">N</div><div><b>Node Studio</b><span>LOCAL AI WORKFLOWS</span></div></div>
      <div className="sidebar-copy">Build, compare, and refine AI workflows.</div>
      <div className="chat-heading"><h2>Conversations</h2><button onClick={newChat} title="New conversation">+</button></div>
      <div className="chat-list">{chats.map((chat) => <div key={chat.id} className={`chat-item ${chat.id === activeChatId ? "active" : ""}`} onClick={() => selectChat(chat.id)}>
        <span>◌</span><input value={chat.title} onClick={(e) => e.stopPropagation()} onChange={(e) => renameChat(chat.id, e.target.value)} aria-label="Conversation title" />
      </div>)}</div>
      <h2>Build blocks</h2>
      {PALETTE.map((p) => (
        <div
          key={p.kind}
          className="palette-item"
          draggable
          onDragStart={(e) => onDragStart(e, p.kind)}
        >
          <span className="palette-icon">{p.icon}</span>{p.label}
        </div>
      ))}
      <div className="sidebar-foot"><span className="local-dot" />Ollama connected</div>
    </aside>
  );
}
