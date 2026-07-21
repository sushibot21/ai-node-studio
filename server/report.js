// Concise UX Audit Report — 3 sections:
//   1. Issues Found
//   2. Changes Applied (with before/after images)
//   3. Human Intervention Remaining
//
// buildReportModel() derives the structured data once; HTML/DOCX/PPTX builders
// consume it.

import {
  Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ImageRun, BorderStyle, ShadingType
} from "docx";
import PptxGenJS from "pptxgenjs";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SEV_COLOR = { critical: "#ff5c5c", high: "#ff9f43", medium: "#ffd43b", low: "#5fd68f" };
const SEV_HEX = { critical: "FF5C5C", high: "FF9F43", medium: "FFD43B", low: "5FD68F" };

const STOP = new Set([
  "the", "and", "for", "with", "not", "but", "are", "was", "were", "this", "that", "these", "those",
  "from", "has", "have", "had", "will", "can", "could", "should", "would", "into", "onto", "than",
  "then", "too", "very", "user", "users", "page", "site", "app", "text", "issue", "issues", "content",
  "context", "flow", "poor", "low", "high", "insufficient", "lack", "lacks", "missing", "unclear"
]);

async function fetchFigmaImage(fileKey, nodeId) {
  const token = process.env.FIGMA_TOKEN;
  if (!token || !fileKey || !nodeId) return null;
  try {
    const url = `https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`;
    const r = await fetch(url, { headers: { "X-Figma-Token": token } });
    if (!r.ok) return null;
    const j = await r.json();
    return j.images?.[nodeId] || null;
  } catch {
    return null;
  }
}

// Fetch a remote/data image and return { buffer, mime }. Returns null on failure.
async function fetchImageBytes(url) {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const [meta, b64] = url.split(",");
      const mime = /data:([^;]+)/.exec(meta)?.[1] || "image/png";
      return { buffer: Buffer.from(b64, "base64"), mime };
    }
    const r = await fetch(url);
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/png";
    return { buffer, mime };
  } catch {
    return null;
  }
}

function opsMatchingFinding(finding, ops) {
  if (!Array.isArray(ops) || !ops.length) return [];
  const haystack = (op) => {
    const sel = op.selector ? Object.values(op.selector).join(" ") : "";
    const val = typeof op.value === "object" ? JSON.stringify(op.value) : String(op.value ?? "");
    return `${op.action} ${sel} ${val}`.toLowerCase();
  };
  const tokens = String(`${finding.title} ${finding.evidence || ""} ${finding.description || ""}`).toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
  if (!tokens.length) return [];
  return ops.filter((op) => {
    const text = haystack(op);
    return tokens.some((t) => text.includes(t));
  });
}

// Common shape consumed by every builder.
export async function buildReportModel(audit, titleOverride, pageContext, extra = {}) {
  const a = audit || {};
  const findings = a.findings || [];
  const title = titleOverride?.trim() || a.title || "UX Audit Report";
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const ctx = pageContext || a.pageContext || {};
  const spec = extra.spec || {};
  const push = extra.push || {};
  const verify = extra.verify || null;
  const ops = Array.isArray(spec.operations) ? spec.operations : [];

  let afterUrl = extra.afterImageUrl || null;
  if (!afterUrl && push.frameId) {
    const fileKey = push.fileKey || ctx.figmaFileKey || extra.figmaFileKey;
    afterUrl = await fetchFigmaImage(fileKey, push.frameId);
  }
  const beforeUrl = ctx.screenshot || ctx.viewportScreenshot || null;

  const uncovered = findings.filter((finding) => opsMatchingFinding(finding, ops).length === 0);
  const humanTodo = [
    ...uncovered.map((finding) => ({ title: finding.title, why: "No automated fix emitted for this finding.", severity: finding.severity })),
    ...((verify?.gaps || []).map((gap) => ({ title: gap, why: "Verifier flagged as still present after the redesign attempt.", severity: "high" })))
  ];

  return { title, date, url: ctx.finalUrl || a.url || "", findings, ops, humanTodo, push, beforeUrl, afterUrl };
}

// ================= HTML ==========================
function issueRowHTML(finding, index) {
  const sev = finding.severity || "medium";
  return `<tr class="sev-${esc(sev)}">
    <td class="num">${index + 1}</td>
    <td><span class="pill" style="background:${SEV_COLOR[sev] || "#888"}">${esc(sev)}</span></td>
    <td><b>${esc(finding.title)}</b><div class="sub">${esc(finding.evidence || finding.description || "")}</div></td>
  </tr>`;
}
function opRowHTML(op, index) {
  const sel = op.selector
    ? Object.entries(op.selector).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")
    : "—";
  const val = op.value == null ? "" : typeof op.value === "object" ? JSON.stringify(op.value) : String(op.value);
  return `<tr>
    <td class="num">${index + 1}</td>
    <td><code>${esc(op.action)}</code></td>
    <td class="sel">${esc(sel)}</td>
    <td class="val">${esc(val.slice(0, 120))}</td>
  </tr>`;
}
function beforeAfterHTML(beforeUrl, afterUrl) {
  if (!beforeUrl && !afterUrl) return "";
  const cell = (label, src) => src
    ? `<figure><figcaption>${esc(label)}</figcaption><img src="${esc(src)}" alt="${esc(label)}"/></figure>`
    : `<figure class="empty"><figcaption>${esc(label)}</figcaption><div class="ph">Image not available</div></figure>`;
  return `<div class="ba">${cell("Before", beforeUrl)}${cell("After", afterUrl)}</div>`;
}

export async function buildReportHTML(audit, _narrative, titleOverride, pageContext, extra = {}) {
  const model = await buildReportModel(audit, titleOverride, pageContext, extra);
  const { title, date, url, findings, ops, humanTodo, push, beforeUrl, afterUrl } = model;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — UX Audit</title>
<style>
  :root{--ink:#14110e;--muted:#5b5750;--line:#e6e1d8;--accent:#ff8a4c;--bg:#fbfaf7;}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:var(--ink);background:var(--bg)}
  .page{max-width:960px;margin:0 auto;padding:48px 56px}
  header.rpt{padding-bottom:20px;border-bottom:2px solid var(--line);margin-bottom:32px}
  header.rpt .eyebrow{letter-spacing:.28em;font-size:11px;color:var(--accent);font-weight:700;text-transform:uppercase}
  header.rpt h1{font-size:32px;letter-spacing:-.01em;margin:8px 0 6px}
  header.rpt .meta{color:var(--muted);font-size:13px}
  section{margin:0 0 40px;break-inside:avoid}
  section h2{font-size:22px;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:10px}
  section h2 .count{color:var(--muted);font-size:13px;font-weight:500}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;font-size:14px;vertical-align:top}
  th{background:#f5f2ea;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  tr:last-child td{border-bottom:0}
  td.num{font-weight:700;text-align:right;width:44px;color:var(--muted)}
  td.sel,td.val{font:12px ui-monospace,"SF Mono",Menlo,monospace;color:var(--muted);word-break:break-word}
  td .sub{color:var(--muted);font-size:13px;margin-top:4px;line-height:1.5}
  .pill{color:#20120b;font-weight:700;font-size:11px;padding:3px 9px;border-radius:20px;text-transform:uppercase;white-space:nowrap}
  code{background:#f0ece4;padding:1px 6px;border-radius:4px;font:12px ui-monospace,monospace}
  .ba{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
  .ba figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .ba figcaption{padding:8px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);background:#f5f2ea;border-bottom:1px solid var(--line);font-weight:600}
  .ba img{display:block;width:100%;height:auto}
  .ba figure.empty .ph{padding:60px 20px;text-align:center;color:var(--muted);font-size:13px}
  .human{display:flex;flex-direction:column;gap:10px}
  .human .item{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:12px 14px;background:#fff}
  .human .item b{display:block;margin-bottom:4px}
  .human .item .why{color:var(--muted);font-size:13px}
  .empty-note{color:var(--muted);font-style:italic;padding:14px;background:#fff;border:1px dashed var(--line);border-radius:8px}
  .push-meta{color:var(--muted);font-size:13px;margin-bottom:12px}
  @media print{body{background:#fff}.page{padding:0 12mm}section{break-inside:avoid}.ba{grid-template-columns:1fr 1fr}}
</style></head>
<body><div class="page">

  <header class="rpt">
    <div class="eyebrow">UX Audit Report</div>
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(url)} · ${esc(date)}</div>
  </header>

  <section>
    <h2>1. Issues Found <span class="count">${findings.length} total</span></h2>
    ${findings.length
      ? `<table><thead><tr><th>#</th><th>Severity</th><th>Issue</th></tr></thead><tbody>${findings.map(issueRowHTML).join("")}</tbody></table>`
      : `<p class="empty-note">No issues surfaced.</p>`}
  </section>

  <section>
    <h2>2. Changes Applied <span class="count">${ops.length} operation${ops.length === 1 ? "" : "s"}</span></h2>
    ${push.frameName ? `<p class="push-meta">Redesign written to Figma frame: <b>${esc(push.frameName)}</b>${push.frameId ? ` (<code>${esc(push.frameId)}</code>)` : ""}.</p>` : ""}
    ${beforeAfterHTML(beforeUrl, afterUrl)}
    ${ops.length
      ? `<table style="margin-top:16px"><thead><tr><th>#</th><th>Action</th><th>Selector</th><th>Value</th></tr></thead><tbody>${ops.map(opRowHTML).join("")}</tbody></table>`
      : `<p class="empty-note">No redesign operations were emitted.</p>`}
  </section>

  <section>
    <h2>3. Human Intervention Remaining <span class="count">${humanTodo.length} item${humanTodo.length === 1 ? "" : "s"}</span></h2>
    ${humanTodo.length
      ? `<div class="human">${humanTodo.map((item) => `<div class="item">
          <b>${esc(item.title)}</b>
          <div class="why">${esc(item.why)}</div>
        </div>`).join("")}</div>`
      : `<p class="empty-note">Every finding has an automated fix and the verifier accepted the redesign.</p>`}
  </section>

</div></body></html>`;
}

// ================= DOCX ==========================
function cell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shading ? { type: ShadingType.CLEAR, color: "auto", fill: opts.shading } : undefined,
    children: [new Paragraph({
      children: [new TextRun({ text: String(text ?? ""), bold: !!opts.bold, color: opts.color, size: opts.size || 20 })]
    })]
  });
}
function headerRow(cells) {
  return new TableRow({
    tableHeader: true,
    children: cells.map((t) => cell(t, { bold: true, shading: "F5F2EA", size: 18 }))
  });
}

export async function buildReportDocx(audit, titleOverride, pageContext, extra = {}) {
  const model = await buildReportModel(audit, titleOverride, pageContext, extra);
  const { title, date, url, findings, ops, humanTodo, push, beforeUrl, afterUrl } = model;

  const children = [
    new Paragraph({
      children: [new TextRun({ text: "UX AUDIT REPORT", color: "FF8A4C", bold: true, size: 20 })]
    }),
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: `${url} · ${date}`, color: "5B5750", size: 20 })]
    }),
    new Paragraph({ text: "" }),

    // Section 1
    new Paragraph({ text: `1. Issues Found (${findings.length} total)`, heading: HeadingLevel.HEADING_2 }),
    findings.length
      ? new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            headerRow(["#", "Severity", "Issue"]),
            ...findings.map((f, i) => new TableRow({
              children: [
                cell(i + 1, { width: 6 }),
                cell((f.severity || "medium").toUpperCase(), { width: 14, bold: true, color: SEV_HEX[f.severity] || "888888" }),
                cell(`${f.title}\n${f.evidence || f.description || ""}`, { width: 80 })
              ]
            }))
          ]
        })
      : new Paragraph({ text: "No issues surfaced.", italics: true }),
    new Paragraph({ text: "" }),

    // Section 2
    new Paragraph({ text: `2. Changes Applied (${ops.length} operation${ops.length === 1 ? "" : "s"})`, heading: HeadingLevel.HEADING_2 })
  ];

  if (push.frameName) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: "Redesign written to Figma frame: ", color: "5B5750", size: 20 }),
        new TextRun({ text: push.frameName, bold: true, size: 20 }),
        push.frameId ? new TextRun({ text: ` (${push.frameId})`, color: "5B5750", size: 20 }) : new TextRun("")
      ]
    }));
  }

  // Before/after images
  const [before, after] = await Promise.all([fetchImageBytes(beforeUrl), fetchImageBytes(afterUrl)]);
  const imageParagraph = (label, img) => new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20 }),
      img ? new ImageRun({ data: img.buffer, transformation: { width: 260, height: 160 }, type: img.mime.includes("jpeg") ? "jpg" : "png" })
          : new TextRun({ text: "image not available", italics: true, color: "5B5750", size: 20 })
    ]
  });
  if (beforeUrl || afterUrl) {
    children.push(imageParagraph("Before", before));
    children.push(imageParagraph("After", after));
    children.push(new Paragraph({ text: "" }));
  }

  if (ops.length) {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        headerRow(["#", "Action", "Selector", "Value"]),
        ...ops.map((op, i) => {
          const sel = op.selector ? Object.entries(op.selector).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") : "—";
          const val = op.value == null ? "" : typeof op.value === "object" ? JSON.stringify(op.value) : String(op.value);
          return new TableRow({
            children: [cell(i + 1, { width: 6 }), cell(op.action, { width: 22, bold: true }), cell(sel, { width: 36 }), cell(val.slice(0, 120), { width: 36 })]
          });
        })
      ]
    }));
  } else {
    children.push(new Paragraph({ text: "No redesign operations were emitted.", italics: true }));
  }
  children.push(new Paragraph({ text: "" }));

  // Section 3
  children.push(new Paragraph({ text: `3. Human Intervention Remaining (${humanTodo.length} item${humanTodo.length === 1 ? "" : "s"})`, heading: HeadingLevel.HEADING_2 }));
  if (humanTodo.length) {
    for (const item of humanTodo) {
      children.push(new Paragraph({
        children: [new TextRun({ text: "• ", bold: true }), new TextRun({ text: item.title, bold: true })]
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: item.why, color: "5B5750", size: 20 })]
      }));
    }
  } else {
    children.push(new Paragraph({ text: "Every finding has an automated fix and the verifier accepted the redesign.", italics: true }));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
    styles: {
      default: {
        heading1: { run: { size: 40, bold: true, color: "14110E" } },
        heading2: { run: { size: 28, bold: true, color: "14110E" }, paragraph: { spacing: { before: 240, after: 120 } } }
      }
    }
  });
  return await Packer.toBuffer(doc);
}

// ================= PPTX ==========================
export async function buildReportPptx(audit, titleOverride, pageContext, extra = {}) {
  const model = await buildReportModel(audit, titleOverride, pageContext, extra);
  const { title, date, url, findings, ops, humanTodo, push, beforeUrl, afterUrl } = model;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in

  // Cover slide
  const cover = pptx.addSlide();
  cover.background = { color: "FBFAF7" };
  cover.addText("UX AUDIT REPORT", { x: 0.8, y: 2.4, w: 12, fontSize: 14, color: "FF8A4C", bold: true, charSpacing: 8 });
  cover.addText(title, { x: 0.8, y: 2.8, w: 12, h: 1.6, fontSize: 44, bold: true, color: "14110E" });
  cover.addText(`${url}    ·    ${date}`, { x: 0.8, y: 4.6, w: 12, fontSize: 16, color: "5B5750" });

  // Section 1: Issues
  const s1 = pptx.addSlide();
  s1.background = { color: "FFFFFF" };
  s1.addText(`1. Issues Found · ${findings.length}`, { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: "14110E" });
  if (findings.length) {
    const rows = [
      [
        { text: "#", options: { bold: true, fill: "F5F2EA" } },
        { text: "Sev", options: { bold: true, fill: "F5F2EA" } },
        { text: "Issue", options: { bold: true, fill: "F5F2EA" } }
      ],
      ...findings.slice(0, 12).map((f, i) => [
        String(i + 1),
        { text: (f.severity || "medium").toUpperCase(), options: { color: SEV_HEX[f.severity] || "888888", bold: true } },
        `${f.title}${f.evidence ? "\n" + f.evidence : ""}`
      ])
    ];
    s1.addTable(rows, { x: 0.5, y: 0.9, w: 12.3, colW: [0.5, 1.2, 10.6], fontSize: 11, border: { pt: 0.5, color: "E6E1D8" } });
  } else {
    s1.addText("No issues surfaced.", { x: 0.5, y: 1.0, italic: true, color: "5B5750", fontSize: 14 });
  }

  // Section 2: Changes
  const s2 = pptx.addSlide();
  s2.background = { color: "FFFFFF" };
  s2.addText(`2. Changes Applied · ${ops.length}`, { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: "14110E" });
  if (push.frameName) {
    s2.addText(`Figma frame: ${push.frameName}${push.frameId ? " (" + push.frameId + ")" : ""}`,
      { x: 0.5, y: 0.85, w: 12, fontSize: 12, color: "5B5750" });
  }

  const [before, after] = await Promise.all([fetchImageBytes(beforeUrl), fetchImageBytes(afterUrl)]);
  const dataUri = (img) => `data:${img.mime};base64,${img.buffer.toString("base64")}`;
  const IMG_Y = 1.2, IMG_H = 3.2;
  if (before) s2.addImage({ data: dataUri(before), x: 0.5, y: IMG_Y, w: 6.0, h: IMG_H });
  else s2.addText("Before — not available", { x: 0.5, y: IMG_Y, w: 6.0, h: IMG_H, fontSize: 12, color: "5B5750", italic: true, align: "center", valign: "middle", fill: "F5F2EA" });
  if (after) s2.addImage({ data: dataUri(after), x: 6.9, y: IMG_Y, w: 6.0, h: IMG_H });
  else s2.addText("After — not available", { x: 6.9, y: IMG_Y, w: 6.0, h: IMG_H, fontSize: 12, color: "5B5750", italic: true, align: "center", valign: "middle", fill: "F5F2EA" });
  s2.addText("Before", { x: 0.5, y: IMG_Y - 0.3, w: 6.0, fontSize: 10, bold: true, color: "5B5750", charSpacing: 6 });
  s2.addText("After", { x: 6.9, y: IMG_Y - 0.3, w: 6.0, fontSize: 10, bold: true, color: "5B5750", charSpacing: 6 });

  if (ops.length) {
    const opRows = [
      [
        { text: "#", options: { bold: true, fill: "F5F2EA" } },
        { text: "Action", options: { bold: true, fill: "F5F2EA" } },
        { text: "Selector", options: { bold: true, fill: "F5F2EA" } },
        { text: "Value", options: { bold: true, fill: "F5F2EA" } }
      ],
      ...ops.slice(0, 8).map((op, i) => {
        const sel = op.selector ? Object.entries(op.selector).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") : "—";
        const val = op.value == null ? "" : typeof op.value === "object" ? JSON.stringify(op.value) : String(op.value);
        return [String(i + 1), op.action, sel, val.slice(0, 60)];
      })
    ];
    s2.addTable(opRows, { x: 0.5, y: IMG_Y + IMG_H + 0.3, w: 12.3, colW: [0.5, 2.0, 5.0, 4.8], fontSize: 10, border: { pt: 0.5, color: "E6E1D8" } });
  }

  // Section 3: Human intervention
  const s3 = pptx.addSlide();
  s3.background = { color: "FFFFFF" };
  s3.addText(`3. Human Intervention Remaining · ${humanTodo.length}`, { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: "14110E" });
  if (humanTodo.length) {
    const bullets = humanTodo.slice(0, 10).map((item) => ({ text: `${item.title}\n${item.why}`, options: { bullet: true, fontSize: 14, color: "14110E" } }));
    s3.addText(bullets, { x: 0.5, y: 0.95, w: 12.3, h: 6.3, valign: "top", paraSpaceAfter: 8 });
  } else {
    s3.addText("Every finding has an automated fix and the verifier accepted the redesign.",
      { x: 0.5, y: 1.0, italic: true, color: "5B5750", fontSize: 14 });
  }

  // pptx.write() returns the file as a Node Buffer / Uint8Array depending on env.
  const out = await pptx.write({ outputType: "nodebuffer" });
  return out;
}
