import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { ReportGeneratorData } from "../lib/types";
import { IconPdf, IconDocx, IconPptx } from "../components/Icons";

// Pull structured audit + redesign context from the live graph so DOCX/PPTX
// exports have the same data the HTML report was built from.
function collectReportPayload() {
  const nodes = useGraphStore.getState().nodes;
  const parse = (raw: unknown) => { try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } };
  const audit = nodes.map((n) => parse(n.data.output)).find((v: any) => v && Array.isArray(v.findings));
  const spec = nodes.map((n) => parse(n.data.output)).find((v: any) => v && Array.isArray(v.operations));
  const push = nodes.map((n) => parse(n.data.output)).find((v: any) => v && (v.frameId || v.mode === "bridge"));
  const verify = nodes.map((n) => parse(n.data.output)).find((v: any) => v && Array.isArray(v.gaps));
  const pageContext = nodes.map((n) => parse(n.data.output)).find((v: any) => v && v.finalUrl && !Array.isArray(v.findings));
  const reportNode = nodes.find((n) => n.data.kind === "reportGenerator");
  const title = (reportNode?.data as any)?.title || "";
  return { audit, spec, push, verify, pageContext, title };
}

async function downloadStructured(kind: "docx" | "pptx") {
  const payload = collectReportPayload();
  if (!payload.audit) { alert("Run the graph first — no audit data found."); return; }
  try {
    const res = await fetch(`/api/report-${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).error || `${kind.toUpperCase()} export failed`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ux-audit-report.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert((err as Error).message);
  }
}
export const exportReportDocx = () => downloadStructured("docx");
export const exportReportPptx = () => downloadStructured("pptx");

// Opens generated report HTML in a new tab. Print-to-PDF (Cmd/Ctrl+P →
// "Save as PDF") produces the presentation-grade PDF deliverable — the report
// CSS is print-optimised. A native binary export would need a PDF lib; see
// UX_REVIEW.md for that trade-off.
export function openReport(html: string, print = false) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Allow pop-ups to open the UX report.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  if (print) win.addEventListener("load", () => win.print());
}

// One-click PDF: renders the report server-side (Puppeteer) and downloads it.
// Falls back to browser print-to-PDF if the server renderer is unavailable.
export async function exportReportPdf(html: string) {
  try {
    const res = await fetch("/api/report-pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ html }) });
    if (!res.ok) throw new Error((await res.json()).error || "PDF export failed");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ux-audit-report.pdf";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    openReport(html, true); // fallback: open + browser print dialog
  }
}

// Turns the verified UXAudit into a presentation-grade HTML report (cover,
// executive summary, scorecard, severity matrix, recommendations, appendix).
// The node's output is the full HTML document string.
export function ReportGeneratorNode({ id, data }: { id: string; data: ReportGeneratorData }) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const html = data.output;
  return (
    <NodeChrome title="Report Generator" data={{ ...data, output: undefined }}>
      <Handle type="target" position={Position.Left} />
      <label>Report title (optional)</label>
      <input
        value={data.title || ""}
        placeholder="Auto-derived from the page title"
        onChange={(e) => updateNodeData(id, { title: e.target.value })}
      />
      <div className="node-row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        <button className="btn primary" disabled={!html} onClick={() => html && openReport(html, false)}>Open</button>
        <button className="btn format-btn" disabled={!html} onClick={() => html && exportReportPdf(html)}><IconPdf /> PDF</button>
        <button className="btn format-btn" disabled={!html} onClick={() => html && exportReportDocx()}><IconDocx /> DOCX</button>
        <button className="btn format-btn" disabled={!html} onClick={() => html && exportReportPptx()}><IconPptx /> PPTX</button>
      </div>
      {!html && (
        <span style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 6, display: "block" }}>
          Run the graph — the report can then be opened in-app or exported as PDF, DOCX, or PPTX.
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
