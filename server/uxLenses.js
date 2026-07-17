// Detailed instructions per UX lens, used to prompt each analysis pass.
// Keys MUST stay in sync with src/lib/uxLenses.ts. Each entry tells the model
// exactly what to look for so findings are specific and evidence-backed rather
// than generic ("improve spacing").

export const LENS_GUIDE = {
  nielsen:
    "Nielsen's 10 usability heuristics: visibility of system status; match to the real world; user control & freedom; consistency & standards; error prevention; recognition over recall; flexibility & efficiency; aesthetic & minimalist design; help users recover from errors; help & documentation. Name the specific heuristic each issue violates.",
  wcag:
    "WCAG 2.2 accessibility: text alternatives for images, colour-contrast, keyboard operability, focus order, labels for inputs, landmark/heading structure, language attribute, target sizes. Cite the WCAG success criterion (e.g. 1.1.1, 1.4.3, 2.4.6) where possible.",
  visualHierarchy:
    "Visual hierarchy: does size/weight/colour/position guide the eye to primary actions? Is there one clear focal point per view? Are secondary elements visually subordinate?",
  gestalt:
    "Gestalt principles: proximity, similarity, common region, continuity, closure. Are related items grouped and unrelated items separated? Are groupings ambiguous?",
  informationArchitecture:
    "Information architecture: labelling clarity, grouping/categorisation, findability, depth vs breadth, and whether the structure matches user mental models.",
  interactionDesign:
    "Interaction design: affordances, signifiers, state changes, hover/pressed/disabled states, drag/scroll behaviours, and whether interactions are discoverable and predictable.",
  mobileUX:
    "Mobile UX: viewport meta correctness, tap-target size (≥44px), thumb-reachability, responsive reflow, avoiding horizontal scroll, and mobile-specific patterns.",
  navigation:
    "Navigation: clarity of primary nav, wayfinding, breadcrumbs, back behaviour, active-state indication, and whether users always know where they are and how to get back.",
  conversion:
    "Conversion optimisation: clarity and prominence of the primary CTA, friction in the path to conversion, distractions, value proposition clarity, and persuasive but honest copy.",
  trust:
    "Trust & credibility: social proof, security/payment signals, transparency (pricing, returns, contact), professionalism of design, and absence of dark patterns.",
  forms:
    "Forms: label association, input types, inline validation, error messaging, required-field clarity, sensible defaults, and minimising fields.",
  errorPrevention:
    "Error prevention: constraints, confirmations for destructive actions, forgiving formats, and preventing errors before they happen rather than only reporting them.",
  contentReadability:
    "Content & readability: reading level, line length, scannability, heading structure, jargon, and whether copy is concise and task-focused.",
  designConsistency:
    "Design consistency: consistent components, spacing scale, typography, colour usage, and terminology across the interface.",
  cognitiveLoad:
    "Cognitive load: number of simultaneous choices, density, memory burden, and whether the interface chunks information to reduce mental effort.",
  progressiveDisclosure:
    "Progressive disclosure: showing only what's needed now, deferring advanced options, and revealing complexity gradually.",
  recognitionRecall:
    "Recognition vs recall: making options/actions visible so users recognise rather than remember; avoiding reliance on memory across steps.",
  feedbackStatus:
    "Feedback & system status: loading/progress indicators, success/error confirmation, and timely response to every user action."
};

export const LENS_LABEL = {
  nielsen: "Nielsen's 10 Heuristics",
  wcag: "WCAG Accessibility",
  visualHierarchy: "Visual Hierarchy",
  gestalt: "Gestalt Principles",
  informationArchitecture: "Information Architecture",
  interactionDesign: "Interaction Design",
  mobileUX: "Mobile UX",
  navigation: "Navigation",
  conversion: "Conversion Optimisation",
  trust: "Trust & Credibility",
  forms: "Forms",
  errorPrevention: "Error Prevention",
  contentReadability: "Content & Readability",
  designConsistency: "Design Consistency",
  cognitiveLoad: "Cognitive Load",
  progressiveDisclosure: "Progressive Disclosure",
  recognitionRecall: "Recognition vs Recall",
  feedbackStatus: "Feedback & System Status"
};

// Compact, model-friendly rendering of the captured page for prompts. For a
// Figma design mockup, HTML-only signals (lang/viewport/alt coverage) are
// omitted so the model doesn't flag implementation artifacts as design flaws.
export function renderPageContext(ctx) {
  if (!ctx) return "(no page context was captured)";
  const isDesign = ctx.source === "figma-design";
  const headings = (ctx.headings || []).map((h) => `h${h.level}: ${h.text}`).slice(0, 20).join("\n");
  const forms = (ctx.forms || []).map((f, i) => `form ${i + 1}: ${f.fields} fields, ${f.labels} labels`).join("; ");
  return [
    isDesign ? `Source: Figma DESIGN mockup — "${ctx.title}"` : `URL: ${ctx.finalUrl}${ctx.redirected ? ` (redirected from ${ctx.requestedUrl})` : ""}`,
    isDesign ? "" : `HTTP status: ${ctx.status}`,
    isDesign ? "" : `Title: ${ctx.title || "(none)"}`,
    isDesign ? "" : `Meta description: ${ctx.description || "(none)"}`,
    isDesign ? "" : `Lang: ${ctx.lang || "(not set)"} | Viewport meta: ${ctx.viewportMeta || "(not set)"}`,
    `Element counts: ${JSON.stringify(ctx.counts || {})}`,
    isDesign ? "" : `Images: ${ctx.images?.total ?? 0} total, ${ctx.images?.withAlt ?? 0} with alt text`,
    isDesign ? "" : `Forms: ${forms || "(none)"}`,
    `Sections/regions: ${(ctx.buttons || []).length ? "" : ""}`,
    `Headings / large text:\n${headings || "(none found)"}`,
    isDesign ? "" : `Sample link labels: ${(ctx.links || []).slice(0, 15).join(" | ") || "(none)"}`,
    `Prominent labels: ${(ctx.buttons || []).slice(0, 12).join(" | ") || "(none)"}`,
    ctx.notes?.length ? `Capture notes: ${ctx.notes.join(" ")}` : "",
    ctx.screenshotNote ? `Visual: ${ctx.screenshotNote}` : "",
    `Text content sample:\n${(ctx.textSample || "").slice(0, 1800)}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAnalysisPrompt(lenses, ctx) {
  const active = (lenses && lenses.length ? lenses : ["nielsen"]).filter((k) => LENS_GUIDE[k]);
  const lensText = active.map((k) => `- ${LENS_LABEL[k]} [${k}]: ${LENS_GUIDE[k]}`).join("\n");
  const isDesign = ctx?.source === "figma-design";
  const designNote = isDesign
    ? `\nSOURCE IS A FIGMA DESIGN MOCKUP (not shipped HTML). Audit the visual & UX design itself: layout, hierarchy, spacing, typography, colour/contrast, consistency, content quality (real vs placeholder/lorem-ipsum copy, typos), and usability. Do NOT report implementation-only issues that don't exist in a design file — e.g. missing alt text, missing lang attribute, missing viewport meta tag, or "buttons have raw layer names" — those are export/capture artifacts, NOT design flaws. Ignore them entirely.\n`
    : "";
  return `You are a senior UX researcher auditing a real ${isDesign ? "product design" : "web page"}. Review it ONLY through the lenses below and report concrete, evidence-based issues. Do not invent UI you cannot infer from the captured data; if a lens has no supportable issue, omit it.

IMPORTANT: A screenshot ${isDesign ? "of the design" : "of the rendered above-the-fold page"} is attached when available. Base your findings on what is ACTUALLY VISIBLE. Do NOT flag an issue the design already handles — e.g. never recommend "surface X" if X is already prominent. Describe the real, observed problem and cite visible evidence.${designNote}

LENSES:
${lensText}

CAPTURED PAGE:
${renderPageContext(ctx)}

Return ONLY a JSON array (no prose, no code fences). Each element:
{"lens":"<one of: ${active.join(", ")}>","title":"short issue title","description":"what is wrong and why it matters","principle":"the specific violated heuristic/principle/WCAG criterion","evidence":"concrete evidence from the captured page (element, count, copy) — never generic","severity":"critical|high|medium|low","userImpact":"who is affected and how","recommendation":"specific, actionable fix with reasoning","confidence":0.0-1.0}

Rules: severity reflects real user harm — reserve "critical" for issues that block a core task or ship broken content, "high" for clear friction, and use "medium"/"low" for polish and refinements (a realistic audit has a SPREAD of severities, not everything high); confidence reflects how well the captured data supports the claim (lower it when data is partial); avoid vague advice like "improve spacing" without justification; 2-5 issues per lens maximum.`;
}
