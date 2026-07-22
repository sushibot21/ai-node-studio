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

  // 9. Semantic-duplicate insertSection — multiple nav-shaped titles cause the
  // stacked "Quick Links + Popular Services + Featured" mess we saw on the
  // Passport Seva redesign. At most ONE new nav-shaped section per spec.
  const NAV_TITLE = /\b(quick|popular|services|featured|categories|browse|actions|links)\b/i;
  const insertOps = ops.filter((op) => op.action === "insertSection");
  const navInserts = insertOps.filter((op) => NAV_TITLE.test(op.value?.title || ""));
  if (navInserts.length > 1) {
    violations.push(`${navInserts.length} nav-shaped insertSection ops (${navInserts.map((o) => `"${o.value?.title}"`).join(", ")}). Emit at most ONE new nav/services section — the source page probably already has one.`);
  }

  // 10. insertSection must target a specific parent by name — appending into an
  // unknown parent lets Figma drop the frame into a non-auto-layout container,
  // where it collides with existing sections.
  const orphanInserts = insertOps.filter((op) => !op.value?.targetParent);
  if (orphanInserts.length) {
    violations.push(`${orphanInserts.length} insertSection ops with no value.targetParent. Specify the parent frame by name (e.g. "Main", "Content", "Home") so the section lands inside an auto-layout container instead of colliding with existing content.`);
  }

  // 11. cloneAndAppend without meaningful replaceText — cloning a card 3× with
  // the same text just triples visual duplicates. Every clone needs distinct copy.
  const cloneOps = ops.filter((op) => op.action === "cloneAndAppend");
  const clonesWithoutText = cloneOps.filter((op) => !op.value?.replaceText || String(op.value.replaceText).trim().length < 3);
  if (clonesWithoutText.length) {
    violations.push(`${clonesWithoutText.length} cloneAndAppend ops missing value.replaceText. Every clone must have distinct, meaningful text — otherwise you're just duplicating the same card.`);
  }
  // 11b. Identical replaceText across sibling clones (same selector.name) — same failure mode.
  const cloneKey = (op) => `${op.selector?.name || ""}::${op.value?.replaceText || ""}`;
  const cloneKeyCounts = cloneOps.reduce((acc, op) => { const k = cloneKey(op); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const dupClones = Object.entries(cloneKeyCounts).filter(([, n]) => n > 1);
  if (dupClones.length) {
    violations.push(`Duplicate clone-with-same-text detected (${dupClones.map(([k, n]) => `${k}×${n}`).join(", ")}). Each clone needs distinct replaceText.`);
  }

  // 12. insertSection palette guard — reject fills that pick a color out of the
  // page's existing palette. If the source page is blue/white and you emit a
  // yellow chip row, it reads as a broken graft.
  // Cheap heuristic: allowed bg values are transparent, white, near-white, or
  // any hex whose hue matches a color already used in another op. Since we
  // don't have the page palette here, require bg to be either a neutral
  // (#FFFFFF/F5-F9 grays) or match a fill used elsewhere in this spec.
  const usedFills = new Set(ops.filter((op) => op.action === "setFill" && typeof op.value === "string").map((op) => String(op.value).toLowerCase().replace(/^#/, "")));
  const NEUTRAL_BG = /^(fff(fff)?|f[5-9a-f]{5}|f[0-9a-f]f[0-9a-f]f[0-9a-f]|transparent)$/i;
  const paletteViolations = insertOps.filter((op) => {
    const bg = String(op.value?.bg || "").toLowerCase().replace(/^#/, "");
    if (!bg) return false;
    if (NEUTRAL_BG.test(bg)) return false;
    return !usedFills.has(bg);
  });
  if (paletteViolations.length) {
    violations.push(`${paletteViolations.length} insertSection ops use a bg color not seen elsewhere on the page (${paletteViolations.map((o) => `"${o.value?.title}": #${o.value.bg}`).join(", ")}). New sections must inherit the existing palette — use a neutral bg (#FFFFFF or a light gray) or a fill already used elsewhere in this spec.`);
  }

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
- Multiple nav-shaped inserts (Quick/Popular/Services/Featured/Actions) → -3 (semantic duplication — page gets stacked parallel nav blocks)
- insertSection with no value.targetParent → -2 per op (will collide with existing content, no auto-layout container to land in)
- cloneAndAppend missing distinct replaceText → -2 per op (produces visual duplicates)
- insertSection bg color that doesn't match the source palette (e.g. yellow chips on a blue/white page) → -3 (graft looks broken)
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
