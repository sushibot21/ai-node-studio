import React, { useEffect, useState } from "react";
import { useGraphStore } from "../store";

export function GuidedFlow({ onApply, onRun, onCanvas }: { onApply: (graph: any) => void; onRun: (graph: any) => Promise<string>; onCanvas: () => void }) {
  const { chats, activeChatId, newChat, selectChat, setChatMessages } = useGraphStore();
  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const [task, setTask] = useState(""); const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(activeChat?.messages || [{ role: "assistant" as const, text: "What are you trying to accomplish?" }]);
  useEffect(() => setMessages(activeChat?.messages || [{ role: "assistant", text: "What are you trying to accomplish?" }]), [activeChatId]);
  const updateMessages = (next: any) => { setMessages(next); setChatMessages(next); };
  const send = async () => {
    if (!task.trim() || busy) return; const brief = task; setTask(""); const userMessages = [...messages, { role: "user", text: brief }]; updateMessages(userMessages); setBusy(true);
    try { const res = await fetch("/api/build-workflow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: brief }) }); const graph = await res.json(); if (!res.ok) throw new Error(graph.error); const answer = await onRun({ ...graph, task: brief }); updateMessages([...userMessages, { role: "assistant", text: answer }]); }
    catch (err) { updateMessages([...userMessages, { role: "assistant", text: err instanceof Error ? err.message : "I couldn’t create that workflow." }]); }
    finally { setBusy(false); }
  };
  return <main className="guided-shell"><aside className="guided-rail"><div className="brand-lockup"><div className="brand-mark">N</div><div><b>Node Studio</b><span>GUIDED AI WORKFLOWS</span></div></div><div className="view-toggle fixed-view-toggle"><button className="active" title="Agent view"><i className="chat-mark" /></button><button onClick={onCanvas} title="Workflow view">&lt;&gt;</button></div><div className="guided-history"><div><span>CONVERSATIONS</span><button onClick={newChat}>+</button></div>{chats.map((chat) => <button key={chat.id} className={chat.id === activeChatId ? "active" : ""} onClick={() => selectChat(chat.id)}><i className="chat-mark" />{chat.title}</button>)}</div><div className="guided-hint">Your node graph is generated in the background and stays available whenever you need it.</div></aside><section className="guided-chat"><div className="guided-title"><span>LOCAL AGENT</span><h1>Tell me what you want to solve.</h1><p>Start with the problem. The workflow comes second.</p></div><div className="chat-thread">{messages.map((message, index) => <div key={index} className={`chat-bubble ${message.role}`}>{message.text}</div>)}{busy && <div className="chat-bubble assistant">Designing your workflow…</div>}</div><div className="chat-composer"><textarea value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Example: I need a brand strategy for a skincare launch, with multiple ideas compared before we choose one." /><button className="btn primary" onClick={send} disabled={busy || !task.trim()}>Send ↗</button></div></section></main>;
}
