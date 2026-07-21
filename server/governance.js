// Governance layer — a reviewer agent that sits between worker output and downstream stages.
// Worker generates → Reviewer scores + critiques → if bad, worker regenerates with critique.
// Inner loop until approved or max attempts, then pass to next stage.

import { extractJSON } from "./uxUtil.js";

// Rules-based deterministic checks — fast pre-screen before LLM review.
// Returns { pass, violations } — violations are strings, all appended to critique.
export function deterministicChecks(spec, findings) {
  const violations = [];
  const ops = spec?.operations || [];

  // 1. Operation count
  if (ops.length < 8) violations.push(`Too few operations (${ops.length}). Address more findings — aim for 15–25 ops.`);
  if (ops.length > 30) violations.push(`Too many operations (${ops.length}). Cap at 30, drop cosmetic tweaks.`);

  // 2. Banned actions
  const bannedActions = ops.filter((op) => op.action === "setSize");
  if (bannedActions.length) violations.push(`${bannedActions.length} setSize op(s) present — banned. Use setSpacing itemSpacing or setFill for visual weight instead.`);

  // 3. setSpacing with padding is discouraged
  const paddingOps = ops.filter((op) => op.action === "setSpacing" && op.value && (op.value.padding != null || op.value.paddingTop != null || op.value.paddingBottom != null));
  if (paddingOps.length > 2) violations.push(`${paddingOps.length} setSpacing ops set padding — this expands auto-layout frames. Use itemSpacing only, or drop these ops.`);

  // 4. Visual-to-text ratio (should be >= 60% visual)
  const visualActions = new Set(["setFill", "setStroke", "setCornerRadius", "setOpacity"]);
  const structuralActions = new Set(["insertSection", "cloneAndAppend"]);
  const visualCount = ops.filter((op) => visualActions.has(op.action)).length;
  const structuralCount = ops.filter((op) => structuralActions.has(op.action)).length;
  const textCount = ops.filter((op) => op.action === "setText").length;
  const annotationCount = ops.filter((op) => op.action === "addAnnotation").length;
  const nonAnnotation = ops.length - annotationCount;
  if (nonAnnotation > 0 && (visualCount + structuralCount) / nonAnnotation < 0.5) {
    violations.push(`Only ${visualCount + structuralCount}/${nonAnnotation} non-annotation ops are visual or structural. Should be ≥60%. User asked for substantial design changes, not text edits.`);
  }
  // 4b. Substantial redesigns MUST add new structure. Pure mutation is insufficient regardless of op count.
  if (structuralCount === 0) {
    violations.push(`BLOCKING: 0 insertSection/cloneAndAppend ops. A redesign MUST add NEW structure — quick-action rows, hero blocks, service grids, empty-state variants. Recolor/reflow-only is rejected. Emit at least 2 structural ops.`);
  } else if (structuralCount < 2 && ops.length > 10) {
    violations.push(`Only ${structuralCount} structural op(s). Aim for 2–5 insertSection/cloneAndAppend ops to make the redesign substantial, not cosmetic.`);
  }

  // 5. Container fills — check selectors don't target generic wrappers
  const genericNames = /^(container|margin|group|frame|wrapper|content)$/i;
  const containerFills = ops.filter((op) =>
    op.action === "setFill" && op.selector?.name && genericNames.test(op.selector.name)
  );
  if (containerFills.length) violations.push(`${containerFills.length} setFill op(s) target generic wrappers (${containerFills.map((o) => o.selector.name).join(", ")}). Target leaf nodes or explicitly named elements.`);

  // 6. setOpacity range
  const badOpacity = ops.filter((op) => op.action === "setOpacity" && (op.value < 0.15 || op.value > 1));
  if (badOpacity.length) violations.push(`${badOpacity.length} setOpacity op(s) outside 0.15–1.0 range. Use 0.35–0.6 for de-emphasis.`);

  // 7. Critical findings coverage — every "high" severity finding should be addressed
  const highFindings = (findings || []).filter((f) => f.severity === "high" || f.severity === "critical");
  const findingText = ops.map((op) => JSON.stringify(op)).join(" ").toLowerCase();
  const uncovered = highFindings.filter((f) => {
    const keywords = (f.title || "").toLowerCase().split(/\s+/).filter((w) => w.length > 4).slice(0, 3);
    return keywords.length > 0 && !keywords.some((k) => findingText.includes(k));
  });
  if (uncovered.length > 2) violations.push(`${uncovered.length} high-severity findings have no matching op: ${uncovered.slice(0, 3).map((f) => f.title).join("; ")}`);

  // 8. Annotations must be present
  if (annotationCount === 0) violations.push(`No addAnnotation ops. Each design change should have a rationale annotation so reviewers understand the WHY.`);
  if (annotationCount > ops.length * 0.6) violations.push(`Too many annotations (${annotationCount}) vs actual changes. Prioritize doing more, annotating less.`);

  return { pass: violations.length === 0, violations };
}

// LLM-based review — deeper semantic check.
// Returns { score, verdict, critique }.
export async function llmReview({ spec, findings, providerFn, model }) {
  const opsSummary = (spec.operations || []).slice(0, 20).map((op, i) => {
    const sel = op.selector?.text ? `text="${op.selector.text}"` :
                op.selector?.name ? `name="${op.selector.name}"` :
                op.selector?.type ? `type=${op.selector.type}` : "?";
    const val = typeof op.value === "object" ? JSON.stringify(op.value).slice(0, 40) : String(op.value).slice(0, 40);
    return `${i + 1}. ${op.action}(${sel}) = ${val}`;
  }).join("\n");

  const findingsList = (findings || []).slice(0, 10).map((f, i) =>
    `${i + 1}. [${f.severity}] ${f.title}`
  ).join("\n");

  const systemPrompt = `You are a balanced design-ops governance reviewer. Score a redesign operation set against the original findings.
Return ONLY valid JSON: {"score": <0-10>, "verdict": "approved"|"needs_revision"|"rejected", "critique": "specific instructions for what to fix"}.

Scoring rubric (start from 8/10 and deduct):
- ZERO insertSection or cloneAndAppend ops → -5 (redesign MUST add structure, not just recolor)
- Only 1 structural op with >10 total ops → -2 (still too cosmetic)
- No high-severity findings addressed at all → -4
- More than 3 high-severity findings uncovered → -2
- setSize present → -3 (banned)
- >2 setSpacing ops with padding → -1
- >30% ops target generic wrappers (Container/Group/Wrapper) → -2
- Neon/high-saturation colors (#FF0000, #00FF00, #FF00FF) → -2
- Text-only response (< 40% visual ops) → -2
- Excessive annotations (>60% of ops are addAnnotation) → -1

Verdicts:
- approved: score >= 6 (spec is usable — worker did the job)
- needs_revision: score 4-5 (fix critique then acceptable)
- rejected: score < 4 (fundamental problems)

Base assumption: worker follows the rules. If ops look reasonable and cover findings, APPROVE. Do not reject over stylistic preferences.
If uncertain, lean toward approved. Governance is a safety net, not a perfection bar.`;

  const input = `## Findings to address:
${findingsList}

## Generated operations:
${opsSummary}

Score this operation set. Critique specifically what to fix. Return JSON only.`;

  try {
    const result = await providerFn({
      model,
      temperature: 0.1,
      systemPrompt,
      input
    });
    const parsed = extractJSON(result.text);
    if (!parsed) return { score: 5, verdict: "needs_revision", critique: "Reviewer returned invalid JSON — retry generation." };
    return {
      score: Number(parsed.score) || 0,
      verdict: parsed.verdict || "needs_revision",
      critique: parsed.critique || ""
    };
  } catch (err) {
    return { score: 5, verdict: "needs_revision", critique: `Reviewer error: ${err.message}. Retry.` };
  }
}

// Combined governance step — deterministic checks + LLM review.
// Returns approval decision + full critique for the worker.
export async function governRedesignSpec({ spec, findings, providerFn, model, minScore = 6 }) {
  const det = deterministicChecks(spec, findings);
  const llm = await llmReview({ spec, findings, providerFn, model });

  const critiquePieces = [];
  if (det.violations.length) {
    critiquePieces.push("## Rule violations:\n" + det.violations.map((v, i) => `${i + 1}. ${v}`).join("\n"));
  }
  if (llm.critique) {
    critiquePieces.push(`## Reviewer critique (score ${llm.score}/10):\n${llm.critique}`);
  }
  const critique = critiquePieces.join("\n\n");

  // Approved only when BOTH pass
  const approved = det.pass && llm.score >= minScore && llm.verdict === "approved";
  const rejected = !det.pass || llm.verdict === "rejected" || llm.score < 4;

  return {
    approved,
    rejected,
    score: llm.score,
    verdict: llm.verdict,
    deterministicPass: det.pass,
    violations: det.violations,
    critique,
    llmVerdict: llm.verdict
  };
}
