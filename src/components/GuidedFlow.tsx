import React, { useEffect, useRef, useState } from "react";
import { useGraphStore } from "../store";
import { openReport, exportReportPdf, exportReportDocx, exportReportPptx } from "../nodes/ReportGeneratorNode";
import { ViewSwitch } from "./ViewSwitch";
import { buildUXReviewGraph } from "../lib/uxReviewGraph";
import { IconAttach, IconLightbulb, IconMic, IconSend, IconStop, IconCopy, IconThumbUp, IconThumbDown, IconStar, IconGlobe, IconSparkle, IconMerge } from "./Icons";

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
  const { chats, activeChatId, newChat, selectChat, setChatMessages, renameChat, deleteChat, nodes, setGraphForChat } = useGraphStore();
  // Inline rename state for the conversation rail.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  // Rotating "thinking" phrase index, advanced on a timer while processing.
  const [phraseIdx, setPhraseIdx] = useState(0);
  // Local elapsed timer — the graph runner feeds runProgress.elapsed, but the
  // loop-audit SSE path doesn't, so we run our own ticker while `processing`.
  const [localElapsed, setLocalElapsed] = useState(0);
  const runStartRef = useRef<number | null>(null);
  // Report CTA only shows when THIS session's send() finished a report.
  // The graph state is persisted, so we can't infer from node output alone —
  // a stale report from a prior chat would flash the "Download report" bar
  // before the user asks for anything.
  const [reportReadyFor, setReportReadyFor] = useState<string | null>(null);
  const reportHtmlRaw = nodes?.find((n) => n.data.kind === "reportGenerator" && typeof n.data.output === "string" && n.data.output.length > 200)?.data.output as string | undefined;
  const reportHtml = reportReadyFor && reportReadyFor === activeChatId ? reportHtmlRaw : undefined;
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

  // Local elapsed timer — starts when processing begins, resets on stop.
  useEffect(() => {
    if (!processing) { runStartRef.current = null; setLocalElapsed(0); return; }
    runStartRef.current = Date.now();
    const timer = window.setInterval(() => {
      if (runStartRef.current) setLocalElapsed(Math.floor((Date.now() - runStartRef.current) / 1000));
    }, 1000);
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

  // Consumes SSE events from /api/loop-audit and updates chat tail with iterative progress.
  const runLoopAudit = async (figmaUrl: string, onProgress: (p: Progress) => void): Promise<string> => {
    // Seed a representative UX Review graph for THIS chat so the Workflow view
    // isn't empty when the user switches to it — loop-audit is server-side SSE
    // and would otherwise leave the chat's canvas blank.
    const startingChatId = useGraphStore.getState().activeChatId;
    if (startingChatId) {
      const seed = buildUXReviewGraph(figmaUrl);
      setGraphForChat(startingChatId, seed.nodes as any, seed.edges as any);
    }
    const res = await fetch("/api/loop-audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ figmaUrl, maxIterations: 3, targetScore: 7 })
    });
    if (!res.body) throw new Error("No response body from loop-audit");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const iterations: Array<{ n: number; score: number; verdict: string; gaps: string[]; passed: boolean; redesignNodeId?: string }> = [];
    let finalMsg = "";
    let currentStage = "starting";
    let doneReason = "";
    let bestFrame = "";

    const summarizeTail = () => {
      const lines = [`⏳ ${currentStage}…`];
      if (iterations.length) {
        lines.push("");
        iterations.forEach((it) => {
          const badge = it.passed ? "✓" : it.verdict === "partial" ? "◐" : "✗";
          lines.push(`${badge} Iter ${it.n}: ${it.score}/10 (${it.verdict}) — ${it.gaps.length} gap${it.gaps.length !== 1 ? "s" : ""}`);
        });
      }
      setTail(lines.join("\n"));
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const evLine = part.split("\n").find((l) => l.startsWith("event:"));
        const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
        if (!evLine || !dataLine) continue;
        const event = evLine.slice(6).trim();
        let data: any;
        try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
        if (event === "stage") {
          currentStage = data.iteration ? `${data.name} (iter ${data.iteration})` : data.name;
          onProgress({ stage: currentStage, completed: iterations.length, total: 3 });
          summarizeTail();
        } else if (event === "iteration") {
          currentStage = `iteration ${data.n} of ${data.of}`;
          summarizeTail();
        } else if (event === "governance") {
          const label = data.status === "generating" ? "governance: worker generating" :
                        data.status === "reviewing" ? `governance: reviewer scoring (${data.ops} ops)` :
                        data.status === "approved" ? `governance: ✓ approved (${data.score}/10)` :
                        data.status === "rejected" ? `governance: ✗ regenerating (attempt ${data.attempt})` :
                        `governance: ${data.status}`;
          currentStage = `iter ${data.iteration} · ${label}`;
          summarizeTail();
        } else if (event === "verify") {
          iterations.push({
            n: data.iteration, score: data.score, verdict: data.verdict,
            gaps: data.gaps || [], passed: data.passed, redesignNodeId: data.redesignNodeId
          });
          bestFrame = data.redesignNodeId || bestFrame;
          summarizeTail();
        } else if (event === "done") {
          doneReason = data.reason;
          if (data.best?.redesignNodeId) bestFrame = data.best.redesignNodeId;
        } else if (event === "error") {
          throw new Error(data.error || "Loop audit failed");
        }
      }
    }
    const reasonLabel = doneReason === "target_met" ? "🎯 Target score met" :
      doneReason === "converged" ? "↔ Converged (no more progress)" :
      "⏱ Reached iteration cap";
    finalMsg = [
      `Loop audit complete — ${iterations.length} iteration${iterations.length !== 1 ? "s" : ""}.`,
      "",
      `${reasonLabel}. Best score: ${Math.max(0, ...iterations.map((i) => i.score))}/10.`,
      "",
      "Per-iteration results:",
      ...iterations.map((it) => {
        const badge = it.passed ? "✓" : it.verdict === "partial" ? "◐" : "✗";
        return `${badge} Iter ${it.n}: ${it.score}/10 (${it.verdict}) — ${it.gaps.length} gap${it.gaps.length !== 1 ? "s" : ""}${it.gaps.length ? `: ${it.gaps.slice(0, 2).join("; ")}` : ""}`;
      }),
      "",
      bestFrame ? `Final redesign frame: ${bestFrame}` : ""
    ].filter(Boolean).join("\n");
    return finalMsg;
  };

  // Auto-generate a short conversation title from the first user message.
  const autoTitleFromFirstMessage = async (chatId: string, brief: string) => {
    const chat = useGraphStore.getState().chats.find((c) => c.id === chatId);
    if (!chat) return;
    // Only rename default "New workflow" titles — respect any user-renamed chat.
    if (chat.title && chat.title !== "New workflow" && chat.title !== "Untitled workflow") return;
    if ((chat.messages || []).some((m) => m.role === "user")) return; // not the first
    try {
      const r = await fetch("/api/summarize-title", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: brief })
      });
      const { title } = await r.json();
      if (title) renameChat(chatId, String(title));
    } catch { /* non-blocking */ }
  };

  const send = async () => {
    const brief = task.trim();
    if (!brief) return;
    // Fire auto-rename in background — non-blocking so send stays snappy.
    if (activeChatId) void autoTitleFromFirstMessage(activeChatId, brief);
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
    // Even a cached / instant answer should feel like the model is thinking —
    // enforce a 3–5s "typing" hold so the response doesn't pop the moment
    // the fetch resolves. Randomised so it doesn't feel mechanical.
    const startedAt = Date.now();
    const MIN_HOLD = 3000 + Math.floor(Math.random() * 2000);
    const holdMinimum = async () => {
      const wait = MIN_HOLD - (Date.now() - startedAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    };
    const startingChatId = activeChatId;
    try {
      let answer: string;
      // Loop-audit path: Figma design URL AND user opted in with "loop" keyword OR default for Figma URLs
      const wantsLoop = figmaIsDesign && !/no[\s-]?loop|single/i.test(brief);
      let producedReport = false;
      if (auditTarget && wantsLoop && figmaIsDesign) {
        answer = await runLoopAudit(figmaUrl!, onProgress);
        producedReport = true;
      } else if (auditTarget) {
        answer = await onUXReview(auditTarget, "", onProgress);
        producedReport = true;
      } else {
        const res = await fetch("/api/build-workflow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: brief }) });
        const graph = await res.json(); if (!res.ok) throw new Error(graph.error);
        answer = await onRun({ ...graph, task: brief }, onProgress);
      }
      await holdMinimum();
      setTail(answer);
      // Only reveal the report CTA if this send finished a real audit AND we're
      // still on the chat that started it (user didn't switch away mid-run).
      if (producedReport && startingChatId) setReportReadyFor(startingChatId);
    }
    catch (err) {
      await holdMinimum();
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
    if (running && totalNodes > 1) {
      const pct = Math.round((runProgress.completed / totalNodes) * 100);
      parts.push(`${pct}% · step ${Math.min(runProgress.completed + 1, totalNodes)}/${totalNodes}`);
    }
    if (etaSeconds != null && etaSeconds > 0) parts.push(`~${fmtDuration(etaSeconds)} remaining`);
    return <div key={index} className="chat-bubble assistant thinking">
      <div className="thinking-head"><span className="thinking-dots"><i /><i /><i /></span>{stage || "Thinking…"}</div>
      <div className="thinking-sub">{parts.join(" · ")}</div>
    </div>;
  };

  // Preset prompt chips shown on landing (no messages yet) — DLS "prompt suggestions" pattern.
  const PRESETS = [
    { Icon: IconStar, label: "Audit a Figma design", body: "Paste a Figma link with a node-id to run a UX audit + redesign." },
    { Icon: IconGlobe, label: "Audit a live product URL", body: "https://" },
    { Icon: IconSparkle, label: "Build a workflow from scratch", body: "Describe what you want to accomplish and I'll assemble the graph." },
    { Icon: IconMerge, label: "Compare two variants", body: "I want to A/B two versions of a landing page." }
  ];
  const isLanding = !messages.some((m) => m.role === "user");
  const copyText = (text: string) => { try { navigator.clipboard?.writeText(text); } catch {} };

  const renderBubble = (message: any, index: number) => {
    if (index === lastIdx && processing && isProgress(message)) return renderThinking(index);
    if (message.role === "assistant") {
      // DLS Chat Response anatomy: Title Large / Body / Feedback actions
      const text = message.text || "";
      const firstLine = text.split("\n")[0] || "";
      const rest = text.slice(firstLine.length).trim();
      const showTitle = firstLine.length < 90 && rest.length > 0;
      return <div key={index} className="chat-bubble assistant dls-response">
        {showTitle && <div className="dls-title">{firstLine}</div>}
        <div className="dls-body">{showTitle ? rest : text}</div>
        <div className="dls-feedback" aria-label="Feedback actions">
          <button className="fb-btn" title="Copy" onClick={() => copyText(text)}><IconCopy size={16} /></button>
          <button className="fb-btn" title="Helpful"><IconThumbUp size={16} /></button>
          <button className="fb-btn" title="Not helpful"><IconThumbDown size={16} /></button>
        </div>
      </div>;
    }
    return <div key={index} className="chat-bubble user">{message.text}</div>;
  };

  return <main className="guided-shell"><aside className="guided-rail"><div className="sidebar-header"><div className="brand-lockup"><div className="brand-mark">N</div><div><b>Node Studio</b><span>GUIDED AI WORKFLOWS</span></div></div></div><ViewSwitch mode="agent" onChange={(m) => { if (m === "workflow") onCanvas(); }} /><div className="guided-history"><div><span>CONVERSATIONS</span><button onClick={newChat} title="New conversation" aria-label="New conversation"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 4v12M4 10h12"/></svg></button></div>{chats.map((chat) => <div key={chat.id} className={`history-item ${chat.id === activeChatId ? "active" : ""}`}>{editingId === chat.id ? <input autoFocus className="history-rename" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} onBlur={() => commitRename(chat.id)} onKeyDown={(e) => { if (e.key === "Enter") commitRename(chat.id); if (e.key === "Escape") setEditingId(null); }} /> : <><button className="history-open" onClick={() => selectChat(chat.id)} onDoubleClick={() => startRename(chat.id, chat.title)}><i className="chat-mark" />{chat.title}</button><span className="history-actions"><button title="Rename" onClick={() => startRename(chat.id, chat.title)} aria-label="Rename"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3l4 4-9 9H4v-4l9-9z"/></svg></button><button title="Delete" onClick={() => confirmDelete(chat.id)} aria-label="Delete"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/></svg></button></span></>}</div>)}</div><div className="guided-hint">Your node graph is generated in the background and stays available whenever you need it.</div></aside><section className="guided-chat"><div className="guided-title"><span>LOCAL AGENT</span><h1>Tell me what you want to solve.</h1><p>Start with the problem. The workflow comes second.</p></div>
    {isLanding && <div className="preset-grid">{PRESETS.map((p, i) => (
      <button key={i} className="preset-chip" onClick={() => setTask(p.body)}>
        <span className="preset-icon"><p.Icon /></span>
        <span className="preset-label">{p.label}</span>
      </button>
    ))}</div>}
    <div className="chat-thread">{messages.map((message, index) => renderBubble(message, index))}{reportHtml && <div className="report-cta">
      <span>◆ UX Audit Report ready</span>
      <button className="btn primary" onClick={() => openReport(reportHtml, false)}>Open</button>
      <button className="btn" onClick={() => exportReportPdf(reportHtml)}>PDF</button>
      <button className="btn" onClick={() => exportReportDocx()}>DOCX</button>
      <button className="btn" onClick={() => exportReportPptx()}>PPTX</button>
    </div>}</div>
    <div className="chat-composer dls-prompt-bar">
      <div className="composer-tools left">
        <button className="tool-btn" title="Attach"><IconAttach /></button>
        <button className="tool-btn" title="Suggestions"><IconLightbulb /></button>
      </div>
      <textarea value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask me anything…" />
      <div className="composer-tools right">
        <button className="tool-btn" title="Voice"><IconMic /></button>
        {processing && <button className="send-btn stop" onClick={onStop} title="Stop"><IconStop /></button>}
        {!processing && <button className="send-btn" onClick={send} disabled={!task.trim()} title="Send"><IconSend /></button>}
      </div>
    </div>
  </section></main>;
}
