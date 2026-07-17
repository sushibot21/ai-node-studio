// Higher-level UX Review pipeline logic: consolidating findings into a scored,
// de-duplicated audit. Deterministic on purpose — scoring/dedupe must be
// reproducible and explainable (and work offline), so no model call is needed
// here even when a provider is configured on the node.

import { SEVERITY_WEIGHT, normalizeSeverity } from "./uxUtil.js";
import { LENS_LABEL } from "./uxLenses.js";

const STOP = new Set(["the", "a", "an", "of", "to", "and", "or", "for", "is", "are", "in", "on", "with", "no", "not", "missing", "lack", "issue"]);

const titleTokens = (title) =>
  new Set(
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((w) => b.has(w) && shared++);
  return shared / (a.size + b.size - shared);
};

// Overlap coefficient: shared / smaller set. Better than Jaccard for spotting
// duplicate findings where one title is a superset of another ("images have no
// alt text" ⊂ "images have no alt text, blocking screen readers").
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((w) => b.has(w) && shared++);
  return shared / Math.min(a.size, b.size);
};

/**
 * Merges finding groups from every analysis pass into one UXAudit:
 * de-duplicates near-identical issues, ranks by severity, and derives scores.
 */
export function mergeAudit(groups, pageContext) {
  const all = (groups || []).flat().filter(Boolean);

  // De-duplicate GLOBALLY (across all lenses): the same underlying issue is often
  // reported by several passes (e.g. "no alt text" under wcag AND nielsen). Two
  // findings are the same if their titles heavily overlap (overlap coefficient),
  // regardless of lens. Keep the strongest; record which lenses flagged it.
  const kept = [];
  for (const finding of all) {
    const tokens = titleTokens(finding.title);
    const twin = kept.find((k) => overlap(k._tokens, tokens) > 0.6);
    if (twin) {
      twin._merged += 1;
      twin._lenses.add(finding.lens);
      if (SEVERITY_WEIGHT[normalizeSeverity(finding.severity)] > SEVERITY_WEIGHT[normalizeSeverity(twin.severity)]) twin.severity = finding.severity;
      twin.confidence = Math.max(twin.confidence, finding.confidence);
      if (finding.evidence && !twin.evidence.includes(finding.evidence.slice(0, 40))) {
        twin.evidence = `${twin.evidence} • ${finding.evidence}`.slice(0, 800);
      }
    } else {
      kept.push({ ...finding, _tokens: tokens, _merged: 0, _lenses: new Set([finding.lens]) });
    }
  }

  // Rank by severity, then confidence, and keep the most important ~18 — a real
  // audit prioritises, it doesn't dump every nitpick.
  kept.sort((a, b) => {
    const s = SEVERITY_WEIGHT[normalizeSeverity(b.severity)] - SEVERITY_WEIGHT[normalizeSeverity(a.severity)];
    return s !== 0 ? s : b.confidence - a.confidence;
  });
  const MAX_FINDINGS = 18;
  const trimmed = kept.slice(0, MAX_FINDINGS);

  const findings = trimmed.map((f, i) => {
    const { _tokens, _merged, _lenses, ...clean } = f;
    return {
      ...clean,
      id: `F${String(i + 1).padStart(3, "0")}`,
      dedupeNote: _merged ? `Consolidated ${_merged + 1} overlapping findings across ${_lenses.size} lens(es).` : undefined
    };
  });

  const severityBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach((f) => (severityBreakdown[normalizeSeverity(f.severity)] += 1));

  // Overall score with diminishing returns so a page with several issues lands in
  // a credible band (not a flat 0). 0 issues → 100; it degrades gracefully.
  const penalty = { critical: 12, high: 6, medium: 2.5, low: 1 };
  const deductions = findings.reduce((sum, f) => sum + penalty[normalizeSeverity(f.severity)], 0);
  const overallScore = Math.max(5, Math.round(100 * (1 - deductions / (deductions + 55))));

  // Per-lens scorecard (0-10). Every lens reviewed appears, even with 0 issues.
  const lensKeys = [...new Set(findings.map((f) => f.lens))];
  const scorecard = lensKeys.map((lens) => {
    const lensFindings = findings.filter((f) => f.lens === lens);
    const lensDeduction = lensFindings.reduce((sum, f) => sum + penalty[normalizeSeverity(f.severity)], 0);
    return { lens: LENS_LABEL[lens] || lens, score: Math.max(0, Math.round((10 - lensDeduction / 3) * 10) / 10) };
  });

  // Accessibility score from WCAG findings, same diminishing-returns curve.
  // (Alt-text coverage is only meaningful for real HTML, not a design mockup,
  // so it's not folded in here — it produced false "0/100" scores on designs.)
  const a11yFindings = findings.filter((f) => f.lens === "wcag");
  const a11yDeduction = a11yFindings.reduce((sum, f) => sum + penalty[normalizeSeverity(f.severity)], 0);
  const accessibilityScore = Math.max(5, Math.round(100 * (1 - a11yDeduction / (a11yDeduction + 35))));

  const quickWins = findings
    .filter((f) => ["low", "medium"].includes(normalizeSeverity(f.severity)))
    .slice(0, 6)
    .map((f) => f.title);
  const longTerm = findings
    .filter((f) => ["critical", "high"].includes(normalizeSeverity(f.severity)))
    .slice(0, 6)
    .map((f) => f.title);

  const confidence = findings.length
    ? Math.round((findings.reduce((s, f) => s + f.confidence, 0) / findings.length) * 100) / 100
    : 0;

  return {
    url: pageContext?.finalUrl || "",
    title: pageContext?.title || "UX Audit",
    overallScore,
    accessibilityScore,
    scorecard,
    severityBreakdown,
    findings,
    quickWins,
    longTerm,
    confidence,
    // Slim page context for grounding the redesign (nav, headings, content) —
    // WITHOUT the heavy base64 screenshots/regions, which would bloat the audit
    // JSON that flows to the redesign LLM and gets persisted. The report gets
    // the full screenshot separately (wired straight from the capture node).
    pageContext: pageContext ? { ...pageContext, screenshot: undefined, viewportScreenshot: undefined, regions: undefined, pageDimensions: undefined } : null,
    methodology:
      "Five independent review passes covering 18 UX lenses (Nielsen heuristics, WCAG, visual hierarchy, Gestalt, IA, interaction, mobile, navigation, conversion, trust, forms, error prevention, content, consistency, cognitive load, progressive disclosure, recognition-vs-recall, feedback). Findings were consolidated, de-duplicated by lens + title similarity, severity-ranked, then improved by an iterative refinement pass. Scores are deductive from severity-weighted findings."
  };
}
