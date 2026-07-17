// Builds the presentation-grade UX Audit Report as a single self-contained HTML
// document. It is print-optimised: opening it and choosing "Save as PDF" yields
// the client-ready PDF deliverable (no PDF binary library is bundled — see
// UX_REVIEW.md for that trade-off). All dynamic text is HTML-escaped.

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SEV_COLOR = { critical: "#ff5c5c", high: "#ff9f43", medium: "#ffd43b", low: "#5fd68f" };
const SEV_ORDER = ["critical", "high", "medium", "low"];

const scoreColor = (score) => (score >= 80 ? "#5fd68f" : score >= 55 ? "#ffd43b" : "#ff5c5c");

function severityBar(breakdown) {
  const total = SEV_ORDER.reduce((sum, s) => sum + (breakdown[s] || 0), 0) || 1;
  const segments = SEV_ORDER.map((s) => {
    const pct = ((breakdown[s] || 0) / total) * 100;
    return pct ? `<span style="width:${pct}%;background:${SEV_COLOR[s]}" title="${s}: ${breakdown[s]}"></span>` : "";
  }).join("");
  const legend = SEV_ORDER.map(
    (s) => `<li><i style="background:${SEV_COLOR[s]}"></i>${s[0].toUpperCase() + s.slice(1)} — <b>${breakdown[s] || 0}</b></li>`
  ).join("");
  return `<div class="sevbar">${segments}</div><ul class="legend">${legend}</ul>`;
}

function findingCard(f, index) {
  return `<article class="finding sev-${esc(f.severity)}">
    <header>
      <span class="fid">${esc(f.id || `F${index + 1}`)}</span>
      <h3>${esc(f.title)}</h3>
      <span class="pill" style="background:${SEV_COLOR[f.severity] || "#888"}">${esc(f.severity)}</span>
    </header>
    <p class="desc">${esc(f.description)}</p>
    <dl>
      <dt>Violated principle</dt><dd>${esc(f.principle)}</dd>
      <dt>Evidence</dt><dd>${esc(f.evidence)}</dd>
      <dt>User impact</dt><dd>${esc(f.userImpact)}</dd>
      <dt>Recommendation</dt><dd>${esc(f.recommendation)}</dd>
      <dt>Confidence</dt><dd>${Math.round((f.confidence || 0) * 100)}%${f.dedupeNote ? ` · ${esc(f.dedupeNote)}` : ""}</dd>
    </dl>
  </article>`;
}

// Priority matrix: severity (impact) × confidence (certainty) quadrants.
function priorityMatrix(findings) {
  const cell = (label, list) =>
    `<div class="cell"><h4>${label} <span>(${list.length})</span></h4><ul>${
      list.slice(0, 8).map((f) => `<li>${esc(f.title)}</li>`).join("") || "<li class=empty>—</li>"
    }</ul></div>`;
  const highImpact = (f) => ["critical", "high"].includes(f.severity);
  const highConf = (f) => (f.confidence || 0) >= 0.7;
  return `<div class="matrix">
    ${cell("Do now — high impact, high confidence", findings.filter((f) => highImpact(f) && highConf(f)))}
    ${cell("Validate — high impact, lower confidence", findings.filter((f) => highImpact(f) && !highConf(f)))}
    ${cell("Quick wins — lower impact, high confidence", findings.filter((f) => !highImpact(f) && highConf(f)))}
    ${cell("Backlog — lower impact, lower confidence", findings.filter((f) => !highImpact(f) && !highConf(f)))}
  </div>`;
}

// The iterative review loop (rounds + scores + what changed), when provided.
function reviewLoop(loop) {
  if (!Array.isArray(loop) || !loop.length) return "";
  const rows = loop
    .map(
      (r) => `<tr><td class="num">Round ${esc(r.round ?? r.iteration ?? "")}</td>
        <td class="num" style="color:${scoreColor((r.score || 0) * 10)}">${esc(r.score ?? "—")}/10</td>
        <td>${esc(r.change || r.critique || "")}${r.selected ? " <b>(selected)</b>" : ""}</td></tr>`
    )
    .join("");
  return `<table><thead><tr><th>Iteration</th><th class="num">Score</th><th>What changed / why</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Per-finding decision log: why it was flagged, at what severity, how confident,
// and whether it consolidated overlapping findings from independent passes.
function decisionLog(findings) {
  return findings
    .map(
      (f) => `<div class="decision">
      <span class="pill" style="background:${SEV_COLOR[f.severity] || "#888"}">${esc(f.severity)}</span>
      <div>
        <b>${esc(f.id)} — ${esc(f.title)}</b>
        <div class="why">Flagged under <b>${esc(f.principle)}</b> (lens: ${esc(f.lens)}). Triggered by: ${esc(f.evidence)}. Rated <b>${esc(f.severity)}</b> because ${esc(f.userImpact)} Confidence ${Math.round((f.confidence || 0) * 100)}%${f.dedupeNote ? ` · ${esc(f.dedupeNote)}` : ""}.</div>
      </div>
    </div>`
    )
    .join("");
}

// One annotated full-page screenshot with numbered pins that reference the
// findings. Each pin is placed on the element the finding most likely concerns
// (matched by lens hints + keyword overlap against captured element regions).
function annotatedScreenshot(ctx, findings) {
  if (!ctx || !ctx.screenshot) return "";
  const pw = ctx.pageDimensions?.width || 1440;
  const ph = ctx.pageDimensions?.height || 1024;
  const regions = ctx.regions || [];
  const lensHint = {
    mobileUX: ["button", "input", "form"], conversion: ["button"], forms: ["input", "form"],
    wcag: ["image-no-alt", "input", "form"], visualHierarchy: ["heading", "button"],
    navigation: ["nav"], feedbackStatus: ["button"], trust: ["button"], informationArchitecture: ["nav", "heading"]
  };
  const tok = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const pins = findings.slice(0, 10).map((f, i) => {
    const ft = tok(`${f.title} ${f.evidence} ${f.principle}`);
    const hints = lensHint[f.lens] || [];
    let best = null, score = 0;
    regions.forEach((r) => {
      const rt = tok(`${r.label} ${r.tag} ${r.kind}`);
      let s = 0;
      ft.forEach((w) => rt.has(w) && (s += 1));
      if (hints.includes(r.kind)) s += 2;
      if (s > score) { score = s; best = r; }
    });
    return best && score > 0
      ? { n: i + 1, title: f.title, severity: f.severity, left: ((best.x + best.w / 2) / pw) * 100, top: ((best.y + best.h / 2) / ph) * 100, matched: true }
      : { n: i + 1, title: f.title, severity: f.severity, matched: false };
  });
  const markers = pins.filter((p) => p.matched)
    .map((p) => `<span class="pin sev-${esc(p.severity)}" style="left:${p.left.toFixed(2)}%;top:${p.top.toFixed(2)}%">${p.n}</span>`)
    .join("");
  const legend = pins
    .map((p) => `<li><span class="pin-n sev-${esc(p.severity)}">${p.n}</span> ${esc(p.title)}${p.matched ? "" : " <em class=\"muted\">(region not located — see finding)</em>"}</li>`)
    .join("");
  return `<div class="shot"><img src="${ctx.screenshot}" alt="Annotated full-page screenshot of the audited page"/>${markers}</div><ol class="shot-legend">${legend}</ol>`;
}

export function buildReportHTML(audit, narrative, titleOverride, pageContext) {
  const a = audit || {};
  const findings = a.findings || [];
  const title = titleOverride?.trim() || a.title || "UX Audit Report";
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // Prefer the full page context (with screenshot/regions) passed directly from
  // the capture node; fall back to the slim copy carried in the audit.
  const ctx = pageContext || a.pageContext || {};

  const scorecardRows = (a.scorecard || [])
    .map(
      (s) => `<tr><td>${esc(s.lens)}</td><td class="num" style="color:${scoreColor(s.score * 10)}">${s.score}/10</td>
        <td><div class="minibar"><span style="width:${s.score * 10}%;background:${scoreColor(s.score * 10)}"></span></div></td></tr>`
    )
    .join("");

  // Only use the refined narrative if it's actually prose — the Iterative
  // Refiner can echo the findings back as JSON, which must never render as the
  // summary. Fall back to a deterministic executive summary otherwise.
  const narrativeIsProse = narrative && narrative.trim() && !/^```|^\s*[[{]|"(id|title|severity)"\s*:/.test(narrative.trim());
  const executiveSummary =
    (narrativeIsProse && narrative.trim()) ||
    `This audit reviewed ${esc(a.url || "the product")} across 18 UX lenses and surfaced ${findings.length} verified issues (` +
      `${a.severityBreakdown?.critical || 0} critical, ${a.severityBreakdown?.high || 0} high). ` +
      `The interface scores ${a.overallScore ?? "—"}/100 overall and ${a.accessibilityScore ?? "—"}/100 on accessibility. ` +
      `Prioritising the critical and high-severity items below will yield the largest gains in task success, accessibility, and conversion.`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — UX Audit</title>
<style>
  :root{--ink:#14110e;--muted:#5b5750;--line:#e6e1d8;--accent:#ff8a4c;--bg:#fbfaf7;}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:var(--ink);background:var(--bg)}
  .page{max-width:900px;margin:0 auto;padding:56px 64px}
  h1,h2,h3,h4{line-height:1.2;margin:0 0 .4em}
  h2{font-size:24px;margin-top:0;padding-bottom:8px;border-bottom:2px solid var(--line)}
  section{margin:0 0 40px}
  .muted{color:var(--muted)}
  .cover{min-height:88vh;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid var(--line)}
  .cover .eyebrow{letter-spacing:.28em;font-size:12px;color:var(--accent);font-weight:700;text-transform:uppercase}
  .cover h1{font-size:52px;letter-spacing:-.02em;margin:16px 0 8px}
  .cover .url{font-size:16px;color:var(--muted);word-break:break-all}
  .cover .meta{margin-top:auto;padding-top:28px;color:var(--muted);font-size:13px}
  .scores{display:flex;gap:24px;flex-wrap:wrap;margin:24px 0}
  .gauge{flex:1;min-width:200px;border:1px solid var(--line);border-radius:16px;padding:22px;background:#fff}
  .gauge .n{font-size:44px;font-weight:800}
  .gauge .l{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.08em}
  table{width:100%;border-collapse:collapse}
  td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}
  td.num{font-weight:700;text-align:right;white-space:nowrap;width:70px}
  .minibar{height:8px;border-radius:6px;background:var(--line);overflow:hidden;min-width:120px}
  .minibar span{display:block;height:100%}
  .sevbar{display:flex;height:26px;border-radius:8px;overflow:hidden;margin:8px 0}
  .sevbar span{display:block}
  ul.legend{list-style:none;padding:0;display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
  ul.legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
  .finding{border:1px solid var(--line);border-left-width:5px;border-radius:12px;padding:16px 18px;margin:14px 0;background:#fff;break-inside:avoid}
  .finding.sev-critical{border-left-color:${SEV_COLOR.critical}}
  .finding.sev-high{border-left-color:${SEV_COLOR.high}}
  .finding.sev-medium{border-left-color:${SEV_COLOR.medium}}
  .finding.sev-low{border-left-color:${SEV_COLOR.low}}
  .finding header{display:flex;align-items:center;gap:10px}
  .finding header h3{flex:1;margin:0;font-size:17px}
  .fid{font:700 12px ui-monospace,monospace;color:var(--muted)}
  .pill{color:#20120b;font-weight:700;font-size:11px;padding:3px 9px;border-radius:20px;text-transform:uppercase}
  .finding .desc{margin:10px 0}
  .finding dl{display:grid;grid-template-columns:150px 1fr;gap:4px 14px;margin:0;font-size:13.5px}
  .finding dt{color:var(--muted);font-weight:600}
  .finding dd{margin:0}
  .matrix{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .matrix .cell{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff}
  .matrix h4{font-size:14px}.matrix h4 span{color:var(--muted);font-weight:400}
  .matrix ul{margin:6px 0 0;padding-left:18px;font-size:13px}.matrix .empty{list-style:none;margin-left:-18px;color:var(--muted)}
  .shot{position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:10px 0;line-height:0}
  .shot img{width:100%;display:block}
  .pin{position:absolute;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.55)}
  .pin.sev-critical,.pin-n.sev-critical{background:${SEV_COLOR.critical}}
  .pin.sev-high,.pin-n.sev-high{background:${SEV_COLOR.high}}
  .pin.sev-medium,.pin-n.sev-medium{background:${SEV_COLOR.medium};color:#20120b}
  .pin.sev-low,.pin-n.sev-low{background:${SEV_COLOR.low};color:#12351f}
  .shot-legend{list-style:none;padding:0;margin:10px 0 0;display:grid;gap:6px;font-size:13px}
  .shot-legend li{display:flex;align-items:center;gap:8px}
  .pin-n{display:inline-flex;width:20px;height:20px;border-radius:50%;color:#fff;font:700 11px sans-serif;align-items:center;justify-content:center;flex:none}
  .decisions{display:flex;flex-direction:column;gap:10px}
  .decision{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#fff;break-inside:avoid}
  .decision .pill{margin-top:2px}
  .decision .why{color:var(--muted);font-size:13.5px;margin-top:3px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .card{border:1px solid var(--line);border-radius:12px;padding:16px 18px;background:#fff}
  .card ul{margin:6px 0 0;padding-left:18px}
  .appendix{font-size:13px;color:var(--muted)}
  .appendix code{background:#f0ece4;padding:1px 5px;border-radius:4px}
  @media print{body{background:#fff}.page{padding:0 12mm}section{break-inside:avoid}.cover{min-height:96vh}.no-print{display:none}}
</style></head>
<body><div class="page">

  <section class="cover">
    <div class="eyebrow">UX Audit Report</div>
    <h1>${esc(title)}</h1>
    <div class="url">${esc(a.url || "")}</div>
    <div class="scores">
      <div class="gauge"><div class="n" style="color:${scoreColor(a.overallScore)}">${a.overallScore ?? "—"}<span style="font-size:20px">/100</span></div><div class="l">Overall UX Score</div></div>
      <div class="gauge"><div class="n" style="color:${scoreColor(a.accessibilityScore)}">${a.accessibilityScore ?? "—"}<span style="font-size:20px">/100</span></div><div class="l">Accessibility</div></div>
      <div class="gauge"><div class="n">${findings.length}</div><div class="l">Issues Found</div></div>
      <div class="gauge"><div class="n">${Math.round((a.confidence || 0) * 100)}<span style="font-size:20px">%</span></div><div class="l">AI Confidence</div></div>
    </div>
    <div class="meta">Prepared by AI Node Studio · ${esc(date)}</div>
  </section>

  <section><h2>Executive Summary</h2><p>${esc(executiveSummary)}</p></section>

  <section><h2>Severity Breakdown</h2>${severityBar(a.severityBreakdown || {})}</section>

  <section><h2>Heuristic Scorecard</h2>
    <table><thead><tr><th>Lens</th><th class="num">Score</th><th></th></tr></thead>
    <tbody>${scorecardRows || '<tr><td class="muted" colspan="3">No lens scores available.</td></tr>'}</tbody></table>
  </section>

  <section><h2>Screens Analysed</h2>
    <div class="card">
      <p><b>${esc(ctx.title || a.url || "Captured page")}</b><br><span class="muted">${esc(ctx.finalUrl || a.url || "")}</span></p>
      <p class="muted">${esc(ctx.screenshotNote || "Analysis based on captured DOM structure and interface metadata.")}</p>
    </div>
    ${annotatedScreenshot(ctx, findings)}
  </section>

  <section><h2>Key Findings</h2>${
    findings.length ? findings.map(findingCard).join("") : '<p class="muted">No issues were surfaced.</p>'
  }</section>

  <section><h2>Priority Matrix</h2>${priorityMatrix(findings)}</section>

  <section><h2>Recommendations</h2>
    <div class="cols">
      <div class="card"><h4>Quick Wins</h4><ul>${
        (a.quickWins || []).map((q) => `<li>${esc(q)}</li>`).join("") || "<li>—</li>"
      }</ul></div>
      <div class="card"><h4>Long-term Improvements</h4><ul>${
        (a.longTerm || []).map((q) => `<li>${esc(q)}</li>`).join("") || "<li>—</li>"
      }</ul></div>
    </div>
  </section>

  <section class="appendix"><h2>Appendix — Methodology &amp; Confidence</h2>
    <p>${esc(a.methodology || "")}</p>
    <p><b>AI confidence score:</b> ${Math.round((a.confidence || 0) * 100)}% (mean confidence across all findings). Confidence is reduced when the captured data only partially supports a claim — for example on client-rendered pages where static DOM signals are limited.</p>
    <p><b>Capture:</b> ${esc(ctx.screenshotNote || "DOM + metadata capture.")} ${(ctx.notes || []).map(esc).join(" ")}</p>
  </section>

</div></body></html>`;
}
