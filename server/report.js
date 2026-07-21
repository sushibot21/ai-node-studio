// Concise UX Audit Report — 3 sections only:
//   1. Issues Found
//   2. Changes Applied (with before/after images)
//   3. Human Intervention Remaining
//
// All dynamic text is HTML-escaped. Self-contained HTML: opening it and
// choosing "Save as PDF" produces the deliverable PDF.

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SEV_COLOR = { critical: "#ff5c5c", high: "#ff9f43", medium: "#ffd43b", low: "#5fd68f" };

// Fetch a PNG URL for a Figma node via REST (needs FIGMA_TOKEN + fileKey + nodeId).
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

// Given a finding, decide whether any op likely addresses it (keyword overlap).
// Threshold >=3 so short design terms ("nav", "cta", "hero", "beta") still match.
// Stop-word list keeps generic verbs from producing false positives.
const STOP = new Set([
  "the", "and", "for", "with", "not", "but", "are", "was", "were", "this", "that", "these", "those",
  "from", "has", "have", "had", "will", "can", "could", "should", "would", "into", "onto", "than",
  "then", "too", "very", "user", "users", "page", "site", "app", "text", "issue", "issues", "content",
  "context", "flow", "poor", "low", "high", "insufficient", "lack", "lacks", "missing", "unclear"
]);
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

function issueRow(finding, index) {
  const sev = finding.severity || "medium";
  return `<tr class="sev-${esc(sev)}">
    <td class="num">${index + 1}</td>
    <td><span class="pill" style="background:${SEV_COLOR[sev] || "#888"}">${esc(sev)}</span></td>
    <td><b>${esc(finding.title)}</b><div class="sub">${esc(finding.evidence || finding.description || "")}</div></td>
  </tr>`;
}

function opRow(op, index) {
  const sel = op.selector
    ? Object.entries(op.selector).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")
    : "—";
  const val = op.value == null
    ? ""
    : typeof op.value === "object"
      ? JSON.stringify(op.value)
      : String(op.value);
  return `<tr>
    <td class="num">${index + 1}</td>
    <td><code>${esc(op.action)}</code></td>
    <td class="sel">${esc(sel)}</td>
    <td class="val">${esc(val.slice(0, 120))}</td>
  </tr>`;
}

function beforeAfter(beforeUrl, afterUrl) {
  if (!beforeUrl && !afterUrl) return "";
  const cell = (label, src) => src
    ? `<figure><figcaption>${esc(label)}</figcaption><img src="${esc(src)}" alt="${esc(label)}"/></figure>`
    : `<figure class="empty"><figcaption>${esc(label)}</figcaption><div class="ph">Image not available</div></figure>`;
  return `<div class="ba">${cell("Before", beforeUrl)}${cell("After", afterUrl)}</div>`;
}

// Build the 3-section HTML.
// Params: { audit, spec, push, title, pageContext, verify, afterImageUrl }
//   audit         — merged findings + metadata
//   spec          — { operations: [...] } redesign spec, if any
//   push          — figma bridge result { frameId, frameName, fileKey }
//   pageContext   — { screenshot, finalUrl, title, figmaNodeId }
//   verify        — { passed, gaps: [...] } from verify-redesign, if present
//   afterImageUrl — optional external URL for the redesigned screenshot
export async function buildReportHTML(audit, narrative, titleOverride, pageContext, extra = {}) {
  const a = audit || {};
  const findings = a.findings || [];
  const title = titleOverride?.trim() || a.title || "UX Audit Report";
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const ctx = pageContext || a.pageContext || {};
  const spec = extra.spec || {};
  const push = extra.push || {};
  const verify = extra.verify || null;
  const ops = Array.isArray(spec.operations) ? spec.operations : [];

  // Resolve the "after" image: caller-provided URL, or fetch via Figma REST.
  let afterUrl = extra.afterImageUrl || null;
  if (!afterUrl && push.frameId) {
    const fileKey = push.fileKey || ctx.figmaFileKey || extra.figmaFileKey;
    afterUrl = await fetchFigmaImage(fileKey, push.frameId);
  }
  const beforeUrl = ctx.screenshot || ctx.viewportScreenshot || null;

  // Human intervention = findings with no matching op, plus verify gaps.
  const uncovered = findings.filter((finding) => opsMatchingFinding(finding, ops).length === 0);
  const humanTodo = [
    ...uncovered.map((finding) => ({ title: finding.title, why: "No automated fix emitted for this finding.", severity: finding.severity })),
    ...((verify?.gaps || []).map((gap) => ({ title: gap, why: "Verifier flagged as still present after the redesign attempt.", severity: "high" })))
  ];

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
    <div class="meta">${esc(ctx.finalUrl || a.url || "")} · ${esc(date)}</div>
  </header>

  <section>
    <h2>1. Issues Found <span class="count">${findings.length} total</span></h2>
    ${findings.length
      ? `<table><thead><tr><th>#</th><th>Severity</th><th>Issue</th></tr></thead><tbody>${findings.map(issueRow).join("")}</tbody></table>`
      : `<p class="empty-note">No issues surfaced.</p>`}
  </section>

  <section>
    <h2>2. Changes Applied <span class="count">${ops.length} operation${ops.length === 1 ? "" : "s"}</span></h2>
    ${push.frameName ? `<p class="push-meta">Redesign written to Figma frame: <b>${esc(push.frameName)}</b>${push.frameId ? ` (<code>${esc(push.frameId)}</code>)` : ""}.</p>` : ""}
    ${beforeAfter(beforeUrl, afterUrl)}
    ${ops.length
      ? `<table style="margin-top:16px"><thead><tr><th>#</th><th>Action</th><th>Selector</th><th>Value</th></tr></thead><tbody>${ops.map(opRow).join("")}</tbody></table>`
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
