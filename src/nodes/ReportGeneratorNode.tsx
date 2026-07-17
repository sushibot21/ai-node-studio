import React from "react";
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./NodeChrome";
import { useGraphStore } from "../store";
import type { ReportGeneratorData } from "../lib/types";

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
      {html ? (
        <div className="node-row">
          <button className="btn primary" onClick={() => openReport(html, false)}>Open report</button>
          <button className="btn" onClick={() => exportReportPdf(html)}>Export PDF</button>
        </div>
      ) : (
        <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
          Run the graph to generate a client-ready UX Audit Report. Export PDF uses your browser's
          print-to-PDF.
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  );
}
