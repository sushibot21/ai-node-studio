import React, { useEffect, useRef, useState } from "react";
import { useGraphStore } from "../store";
import { openReport, exportReportPdf } from "../nodes/ReportGeneratorNode";

// Rotating status lines shown while the model works, so the wait reads as
// active "thinking" rather than a frozen spinner. The concrete pipeline stage
// (from runProgress) is shown above these when available.
const THINKING_PHRASES = [
  "Reading through the details",
  "Mapping out the approach",
  "Looking at the layout and content",
  "Weighing the options",
  "Connecting the pieces",
  "Refining the response",
  "Putting it all together"
];
const fmtDuration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

const clean = (u: string) => u.replace(/[).,]+$/, "");
// A Figma file/document link — the redesign destination.
const findFigmaUrl = (text: string): string | null => {
  const m = text.match(/https?:\/\/(www\.)?figma\.com\/[^\s]+/i);
  return m ? clean(m[0]) : null;
};
// First non-Figma http(s) URL — the product page to audit (triggers a UX Review).
const findUrl = (text: string): string | null => {
  const urls = text.match(/https?:\/\/[^\s]+/gi) || [];
  const product = urls.map(clean).find((u) => !/figma\.com/i.test(u));
  return product || null;
};

type Progress = { stage: string; completed: number; total: number };
type RunProgress = { completed: number; current: string; elapsed: number };

export function GuidedFlow({ onApply, onRun, onUXReview, onFigmaLink, onCanvas, onStop, running, runProgress, etaSeconds, totalNodes }: { onApply: (graph: any) => void; onRun: (graph: any, onProgress?: (p: Progress) => void) => Promise<string>; onUXReview: (url: string, figmaFileUrl?: string, onProgress?: (p: Progress) => void) => Promise<string>; onFigmaLink: (figmaUrl: string) => Promise<string>; onCanvas: () => void; onStop: () => void; running: boolean; runProgress: RunProgress; etaSeconds: number | null; totalNodes: number }) {
  const { chats, activeChatId, newChat, selectChat, setChatMessages, renameChat, deleteChat, nodes } = useGraphStore();
  // Inline rename state for the conversation rail.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  // Rotating "thinking" phrase index, advanced on a timer while processing.
  const [phraseIdx, setPhraseIdx] = useState(0);
  // The current graph's report (in memory after a run) drives the chat CTAs.
  const reportHtml = nodes?.find((n) => n.data.kind === "reportGenerator" && typeof n.data.output === "string" && n.data.output.length > 200)?.data.output as string | undefined;
  const activeChat = chats.find((chat) => chat.id === activeChatId);
  // Messages come straight from the store (single source of truth). This is why
  // the processing preview KEEPS showing and updating even when you switch to
  // the Workflow view mid-run and back — the running graph keeps writing here,
  // and whichever view is mounted re-renders from the store.
  const messages = activeChat?.messages?.length ? activeChat.messages : [{ role: "assistant" as const, text: "What are you trying to accomplish?" }];
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  // `running` (from the workflow engine, in App) survives view switches; `busy`
  // covers the brief window before the engine starts. Either means "in flight".
  const processing = busy || running;

  // Advance the rotating thinking phrase every ~2.4s while processing; reset
  // to the first phrase whenever a new run begins.
  useEffect(() => {
    if (!processing) { setPhraseIdx(0); return; }
    const timer = window.setInterval(() => setPhraseIdx((i) => (i + 1) % THINKING_PHRASES.length), 2400);
    return () => window.clearInterval(timer);
  }, [processing]);

  const UPFRONT_ASK = "Running the full UX audit now and preparing an editable redesign. If the Node Studio Bridge plugin is connected, I'll write the redesign straight into your open Figma file; otherwise paste a Figma file link and I'll target that.\n\nThe audit runs several independent passes, so it can take a few minutes.";

  // Tail helpers read the freshest store messages so a Figma link sent mid-run
  // doesn't clobber the live progress bubble (and vice-versa).
  const currentMsgs = () => {
    const s = useGraphStore.getState();
    return [...(s.chats.find((c) => c.id === s.activeChatId)?.messages || [])];
  };
  const isProgress = (m: any) => m && m.role === "assistant" && typeof m.text === "string" && m.text.startsWith("⏳");
  // Replace a trailing progress bubble (or append) with the given text.
  const setTail = (text: string) => {
    const msgs = currentMsgs();
    if (isProgress(msgs[msgs.length - 1])) msgs[msgs.length - 1] = { role: "assistant", text };
    else msgs.push({ role: "assistant", text });
    setChatMessages(msgs as any);
  };
  // Insert messages just before a trailing progress bubble, if one exists.
  const insertBeforeProgress = (extra: any[]) => {
    const msgs = currentMsgs();
    if (isProgress(msgs[msgs.length - 1])) msgs.splice(msgs.length - 1, 0, ...extra);
    else msgs.push(...extra);
    setChatMessages(msgs as any);
  };

  const send = async () => {
    const brief = task.trim();
    if (!brief) return;
    const webUrl = findUrl(brief);                       // first non-figma http URL
    const figmaUrl = findFigmaUrl(brief);                // any figma.com link
    const figmaIsDesign = !!figmaUrl && /node-id=/i.test(figmaUrl); // points to a specific frame → auditable design
    const auditTarget = webUrl || (figmaIsDesign ? figmaUrl : null); // audit a web page OR a specific Figma design
    const destOnly = !auditTarget && figmaUrl;           // a file-level Figma link → treat as a write destination
    // Block starting a NEW audit while one runs, but always allow a destination link.
    if (processing && !destOnly) return;
    setTask("");

    // File-level Figma link only → capture/write without disturbing a running audit.
    if (destOnly) {
      insertBeforeProgress([{ role: "user", text: brief }]);
      const ans = await onFigmaLink(figmaUrl);
      insertBeforeProgress([{ role: "assistant", text: ans }]);
      return;
    }

    setBusy(true);
    const preface = auditTarget ? [{ role: "assistant", text: UPFRONT_ASK }] : [];
    setChatMessages([...currentMsgs(), { role: "user", text: brief }, ...preface] as any);
    setTail("⏳ Working…");
    const onProgress = (p: Progress) => setTail(`⏳ ${p.stage}… (${p.completed}/${p.total})`);
    try {
      let answer: string;
      if (auditTarget) {
        answer = await onUXReview(auditTarget, "", onProgress);
      } else {
        const res = await fetch("/api/build-workflow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: brief }) });
        const graph = await res.json(); if (!res.ok) throw new Error(graph.error);
        answer = await onRun({ ...graph, task: brief }, onProgress);
      }
      setTail(answer);
    }
    catch (err) {
      // A user-initiated Stop shows up as an aborted fetch — treat it as a clean stop.
      if (err instanceof DOMException && err.name === "AbortError") setTail("⏹ Stopped.");
      else setTail(err instanceof Error ? err.message : "I couldn’t create that workflow.");
    }
    finally { setBusy(false); }
  };

  // Commit an inline conversation rename (empty falls back to a placeholder).
  const commitRename = (id: string) => { renameChat(id, draftTitle.trim() || "Untitled workflow"); setEditingId(null); };
  const startRename = (id: string, title: string) => { setEditingId(id); setDraftTitle(title); };
  const confirmDelete = (id: string) => {
    const chat = chats.find((c) => c.id === id);
    const hasWork = (chat?.messages || []).some((m) => m.role === "user") || (chat?.nodes || []).length > 0;
    if (!hasWork || window.confirm(`Delete "${chat?.title || "this conversation"}"? This can't be undone.`)) deleteChat(id);
  };

  const lastIdx = messages.length - 1;
  const stage = runProgress.current && runProgress.current !== "Preparing graph" ? runProgress.current : null;
  // Rich processing bubble: concrete pipeline stage + rotating thinking line,
  // elapsed time, step count, and an estimated time-left.
  const renderThinking = (index: number) => {
    const parts = [THINKING_PHRASES[phraseIdx]];
    if (running && totalNodes > 1) parts.push(`step ${Math.min(runProgress.completed + 1, totalNodes)} of ${totalNodes}`);
    parts.push(`${fmtDuration(runProgress.elapsed)} elapsed`);
    if (etaSeconds != null && etaSeconds > 0) parts.push(`~${fmtDuration(etaSeconds)} left`);
    return <div key={index} className="chat-bubble assistant thinking">
      <div className="thinking-head"><span className="thinking-dots"><i /><i /><i /></span>{stage || "Thinking…"}</div>
      <div className="thinking-sub">{parts.join(" · ")}</div>
    </div>;
  };

  return <main className="guided-shell"><aside className="guided-rail"><div className="brand-lockup"><div className="brand-mark">N</div><div><b>Node Studio</b><span>GUIDED AI WORKFLOWS</span></div></div><div className="view-toggle fixed-view-toggle"><button className="active" title="Agent view"><i className="chat-mark" /></button><button onClick={onCanvas} title="Workflow view">&lt;&gt;</button></div><div className="guided-history"><div><span>CONVERSATIONS</span><button onClick={newChat} title="New conversation">+</button></div>{chats.map((chat) => <div key={chat.id} className={`history-item ${chat.id === activeChatId ? "active" : ""}`}>{editingId === chat.id ? <input autoFocus className="history-rename" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} onBlur={() => commitRename(chat.id)} onKeyDown={(e) => { if (e.key === "Enter") commitRename(chat.id); if (e.key === "Escape") setEditingId(null); }} /> : <><button className="history-open" onClick={() => selectChat(chat.id)} onDoubleClick={() => startRename(chat.id, chat.title)}><i className="chat-mark" />{chat.title}</button><span className="history-actions"><button title="Rename" onClick={() => startRename(chat.id, chat.title)}>✎</button><button title="Delete" onClick={() => confirmDelete(chat.id)}>🗑</button></span></>}</div>)}</div><div className="guided-hint">Your node graph is generated in the background and stays available whenever you need it.</div></aside><section className="guided-chat"><div className="guided-title"><span>LOCAL AGENT</span><h1>Tell me what you want to solve.</h1><p>Start with the problem. The workflow comes second.</p></div><div className="chat-thread">{messages.map((message, index) => (index === lastIdx && processing && isProgress(message)) ? renderThinking(index) : <div key={index} className={`chat-bubble ${message.role}`}>{message.text}</div>)}{reportHtml && <div className="report-cta"><span>◆ UX Audit Report ready</span><button className="btn primary" onClick={() => exportReportPdf(reportHtml)}>⬇ Download PDF</button><button className="btn" onClick={() => openReport(reportHtml, false)}>Open HTML</button></div>}</div><div className="chat-composer"><textarea value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Paste a product URL or a Figma design link (with a node-id) to run an autonomous UX audit + redesign — or describe any task to build a workflow." /><div className="composer-actions">{processing && <button className="btn stop" onClick={onStop} title="Stop processing">■ Stop</button>}<button className="btn primary" onClick={send} disabled={!task.trim() || (processing && !findFigmaUrl(task))}>Send ↗</button></div></div></section></main>;
}
