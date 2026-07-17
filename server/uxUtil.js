// Shared helpers for the UX Review pipeline: tolerant JSON extraction from
// model output and normalisation of findings so downstream stages can trust
// the shape regardless of which (sometimes messy) local model produced it.

const SEVERITIES = ["critical", "high", "medium", "low"];
export const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

/** Pulls the first JSON array/object out of model text, tolerating fences/prose. */
export function extractJSON(text) {
  if (!text) return null;
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  // Try whole-string first, then the widest [...] or {...} span.
  const attempts = [stripped];
  const arr = stripped.match(/\[[\s\S]*\]/);
  const obj = stripped.match(/\{[\s\S]*\}/);
  if (arr) attempts.push(arr[0]);
  if (obj) attempts.push(obj[0]);
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try next */
    }
  }
  // Salvage a truncated JSON array (e.g. the model hit its token cap mid-object):
  // keep everything up to the last complete top-level object and close the array.
  if (arr || stripped.startsWith("[")) {
    const body = arr ? arr[0] : stripped;
    const lastClose = body.lastIndexOf("}");
    if (lastClose > 0) {
      try {
        return JSON.parse(body.slice(0, lastClose + 1) + "]");
      } catch {
        /* give up */
      }
    }
  }
  return null;
}

export function normalizeSeverity(value) {
  const v = String(value || "").toLowerCase();
  return SEVERITIES.includes(v) ? v : "medium";
}

export function clampConfidence(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0.6;
  if (n > 1) return Math.min(1, n / 100); // tolerate 0-100 scales
  return Math.max(0, Math.min(1, n));
}

/** Coerces a raw model object into a complete Finding; drops empty entries. */
export function normalizeFinding(raw, lensFallback, index) {
  if (!raw || (!raw.title && !raw.description)) return null;
  return {
    id: `F${String(index + 1).padStart(3, "0")}`,
    title: String(raw.title || "Untitled issue").slice(0, 160),
    description: String(raw.description || "").slice(0, 800),
    principle: String(raw.principle || raw.heuristic || "General UX best practice").slice(0, 200),
    lens: String(raw.lens || lensFallback || "nielsen"),
    evidence: String(raw.evidence || "Inferred from captured page structure.").slice(0, 600),
    severity: normalizeSeverity(raw.severity),
    userImpact: String(raw.userImpact || raw.impact || "Affects task success and satisfaction.").slice(0, 400),
    recommendation: String(raw.recommendation || raw.fix || "").slice(0, 800),
    confidence: clampConfidence(raw.confidence)
  };
}
