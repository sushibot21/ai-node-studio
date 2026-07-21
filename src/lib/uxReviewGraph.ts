import type { Edge, Node } from "@xyflow/react";
import type { AnyNodeData, UXAudit } from "./types";
import { ANALYSIS_PASSES } from "./uxLenses";
import { nextId } from "../store";
import { layoutGraph } from "./layoutGraph";

// Provider used for every reasoning node in the auto-built UX Review graph.
// Local-first by default (matches the app's Ollama default); switch per node
// on the canvas to a hosted model for stronger analysis.
// The reasoning nodes default to Anthropic Claude — it's vision-capable (so the
// analysis is grounded in the captured screenshot) and gives the strongest
// findings. Switch a node to Ollama on the canvas for a fully-local run.
const PROVIDER = "anthropic" as const;
const MODEL = "claude-opus-4-7";

// The redesign reasoning is Claude's job (Anthropic API), per the native
// Claude + Figma MCP architecture. It only reasons + emits a spec — it never
// touches Figma directly; the Figma node's MCP layer performs the write.
const REDESIGN_PROVIDER = "anthropic" as const;
const REDESIGN_MODEL = "claude-opus-4-7";

const FIGMA_SYSTEM_PROMPT =
  "You are a senior product designer. You are given a VERIFIED UX AUDIT (JSON) of a real screen — findings with ids (F001…), titles, violated principles, severity, evidence, and recommendations, plus the captured page context. " +
  "Redesign the SAME screen so that EVERY design decision directly resolves one or more findings. Preserve the original product purpose. Never repeat a mistake the audit identified. " +
  "Do not invent an unrelated marketing page — rebuild the actual screen (its nav, media, primary action, content, forms, trust signals) done correctly.\n\n" +
  "GROUND IT IN THE REAL PAGE: the audit's pageContext lists the page's actual navigation labels, headings, buttons, forms, and visible content. PRESERVE those real sections and real content (product names, nav items, copy) and improve them — do NOT replace them with generic invented sections. Only fix what the findings say is wrong.\n\n" +
  "IF the audit's pageContext contains a `figmaNodeId` (the source is an existing Figma design), DO NOT return the sectioned spec — return REDESIGN OPERATIONS that fix the EXISTING design in place, preserving its exact visual style. Shape: " +
  '{"mode":"redesign","sourceNodeId":"<the exact pageContext.figmaNodeId value>","screenName":"<name> — AI Redesign","rationale":"...","operations":[{"selector":{"text":"..."|"name":"...","type":"FRAME","exact":bool,"index":n,"parent":n},"action":"setFill|setStroke|setCornerRadius|setSpacing|setOpacity|setText|addAnnotation","value":...,"weight":n,"opts":{...}}]}. ' +
  "REDESIGN OPERATION RULES (violations will break the design): " +
  "(1) NEVER use action \"setSize\" — it cascades and breaks auto-layout. " +
  "(2) NEVER add padding via setSpacing where none existed — only ADJUST existing padding values or set itemSpacing. " +
  "(3) NEVER change fills on generic wrapper frames (name matches \"Container\", \"Margin\", \"Group\", \"Frame\", \"Wrapper\") — only target LEAF nodes or explicitly-named elements (\"Button\", \"Card\", \"Background\", \"Nav\", \"Header\", \"Overlay\"). " +
  "(4) PRIORITISE DESIGN CHANGES OVER TEXT CHANGES: 60%+ of operations must be visual — setFill on CTAs for contrast/prominence, setStroke on form fields for affordance, setCornerRadius on cards/buttons for polish, setOpacity on de-emphasised elements, setFill on nav/header backgrounds for contrast. Only use setText when a finding EXPLICITLY names wrong/misleading text. " +
  "(5) Use conservative professional colours from the existing brand palette — no garish, neon, or high-saturation hues. Match the design's existing accent colour when strengthening CTAs. " +
  "(6) NEVER use mode:\"patch\" with textEdits/styleEdits — that path is deprecated. ALWAYS use mode:\"redesign\" with operations array. " +
  "(7) Max 30 operations, one targeted change each. Selectors: use {\"name\":\"...\"} whenever possible for precise leaf-node targeting; use {\"text\":\"...\",\"exact\":true} when targeting by visible text; use \"parent\":n to walk up to the target container. " +
  "(8) Each addAnnotation goes to a separate side panel and explains WHY a change was made (Nielsen heuristic, WCAG rule, or hierarchy principle). Do NOT put annotation text into setText replacement values. " +
  "(9) Colours are hex strings without '#'. Radii 0-100. Opacity 0-1. Weights (stroke) in px. " +
  "(10) Preserve all IMAGE fills automatically (setFill skips them) — but never target frames named after image assets ('*.png', '*.svg', 'HomeBanner*', etc.) with setFill. " +
  "Aim for 15-25 operations that make the redesign visibly better while keeping the original layout intact.\n\n" +
  "OTHERWISE (a web page, no figmaNodeId) return ONLY this sectioned JSON spec (no prose, no code fences):\n" +
  '{"screenName":"short name of the redesigned screen",' +
  '"productPurpose":"one line: what the user is here to accomplish",' +
  '"platform":"mobile" or "desktop",' +
  '"tokens":{"bg":"hex","surface":"hex","accent":"hex","text":"hex","textDim":"hex","border":"hex","success":"hex"},' +
  '"designRationale":"2-3 sentences tying the redesign to the top findings by id",' +
  '"sections":[{"type":"nav|hero|media|priceCta|content|form|trust|list|banner|footer",' +
  '"title":"...","subtitle":"...","body":"...","price":"optional",' +
  '"items":[{"label":"..."}],"fields":[{"label":"...","type":"text"}],"badges":[{"label":"..."}],' +
  '"cta":{"label":"...","emphasis":"primary|secondary"},' +
  '"resolves":["F001","F004"],"rationale":"why this section/layout fixes those findings"}]}\n\n' +
  "Rules: order sections like a real screen (nav → hero/media → priceCta → content → trust → form → footer, as appropriate for the product). " +
  "EVERY section must carry concrete content — a body and/or items/badges/fields with real copy (e.g. a testimonials section needs actual quote+author items). Never emit a section with only a title. " +
  "Put the ACTUAL finding ids from the audit in each section's \"resolves\". Ensure token contrast meets WCAG AA (fix any contrast finding). " +
  "Address CTA prominence, information hierarchy, spacing, labels, tap targets, navigation, trust, and consistency exactly as the findings require. 6-10 sections.";

const REFINER_RUBRIC =
  "Every issue must have: concrete on-page evidence, a named violated heuristic/principle, a severity justified by real user impact, and a specific recommendation with reasoning. Remove vague findings (e.g. 'improve spacing' with no justification). De-duplicate overlapping issues. Preserve the reasoning behind both accepted and rejected findings.";

/**
 * Assembles the full autonomous UX Review workflow as a runnable node graph:
 *
 *   URL → Web Capture ─┬─▶ 5 independent UX Analysis passes ─┐
 *                      │                                     ├─▶ Merge/Dedupe/Rank ─┬─▶ Iterative Refiner ─┐
 *                      └─────────────────────────────────────┘                     │                     ├─▶ Report → Output (PDF)
 *                                                                                   ├─────────────────────┘
 *                                                                                   └─▶ LLM redesign spec → Figma Redesign → Output
 *
 * Reuses existing nodes (Text Input, LLM, Iterative Refiner, Output) and adds
 * only the five UX-specific stages. Everything stays visible + editable on the canvas.
 */
export function buildUXReviewGraph(url = "", figmaFileUrl = ""): { nodes: Node<AnyNodeData>[]; edges: Edge[] } {
  const uid = (p: string) => `${p}_${nextId()}`;
  const nodes: Node<AnyNodeData>[] = [];
  const edges: Edge[] = [];
  const connect = (source: string, target: string) =>
    edges.push({ id: `e_${source}_${target}`, source, target });

  const urlInputId = uid("url");
  const captureId = uid("capture");
  const mergeId = uid("merge");
  const refinerId = uid("refiner");
  const reportId = uid("report");
  const reportOutId = uid("reportOut");
  const figmaLLMId = uid("figmaSpec");
  const figmaId = uid("figma");
  const figmaOutId = uid("figmaOut");

  nodes.push({
    id: urlInputId,
    type: "textInput",
    position: { x: 40, y: 360 },
    data: { kind: "textInput", label: "Product URL", inputType: "link", text: url }
  });
  nodes.push({
    id: captureId,
    type: "webCapture",
    position: { x: 300, y: 360 },
    data: { kind: "webCapture", label: "Capture page", url, viewport: "desktop", captureScreenshot: false }
  });
  connect(urlInputId, captureId);

  // Five independent analysis passes covering all 18 lenses.
  const analysisIds: string[] = [];
  ANALYSIS_PASSES.forEach((pass, i) => {
    const id = uid("analysis");
    analysisIds.push(id);
    nodes.push({
      id,
      type: "uxAnalysis",
      position: { x: 600, y: 40 + i * 190 },
      data: { kind: "uxAnalysis", label: pass.label, provider: PROVIDER, model: MODEL, lenses: pass.lenses, temperature: 0.4 }
    });
    connect(captureId, id);
    connect(id, mergeId);
  });

  nodes.push({
    id: mergeId,
    type: "mergeFindings",
    position: { x: 920, y: 360 },
    data: { kind: "mergeFindings", label: "Merge · dedupe · rank", provider: PROVIDER, model: MODEL }
  });
  connect(captureId, mergeId); // page context for scoring / report

  // Reuse the existing Iterative Refiner to strengthen the consolidated findings.
  nodes.push({
    id: refinerId,
    type: "iterativeRefiner",
    position: { x: 1200, y: 140 },
    data: {
      kind: "iterativeRefiner",
      label: "Validate & strengthen findings",
      provider: PROVIDER,
      model: MODEL,
      goal: "Improve and validate the consolidated UX findings against recognised UX and UI best practices, producing a rigorous executive analysis.",
      rubric: REFINER_RUBRIC,
      maxIterations: 3,
      targetScore: 9,
      temperature: 0.5
    }
  });
  connect(mergeId, refinerId);

  nodes.push({
    id: reportId,
    type: "reportGenerator",
    position: { x: 1500, y: 200 },
    data: { kind: "reportGenerator", label: "UX Audit Report", reportUrl: url }
  });
  connect(mergeId, reportId); // structured audit
  connect(refinerId, reportId); // refined narrative
  connect(captureId, reportId); // full page context (screenshot + regions) for the annotated shot

  nodes.push({
    id: reportOutId,
    type: "output",
    position: { x: 1800, y: 200 },
    data: { kind: "output", label: "Report (HTML/PDF)", format: "text" }
  });
  connect(reportId, reportOutId);

  // Redesign: LLM turns the audit into a Figma spec, Figma node writes it.
  nodes.push({
    id: figmaLLMId,
    type: "llm",
    position: { x: 1200, y: 520 },
    data: { kind: "llm", label: "Claude redesign spec", provider: REDESIGN_PROVIDER, model: REDESIGN_MODEL, systemPrompt: FIGMA_SYSTEM_PROMPT, temperature: 0.4 }
  });
  connect(mergeId, figmaLLMId);
  connect(mergeId, figmaId); // audit context (text inventory) for resolving patch edits

  nodes.push({
    id: figmaId,
    type: "figmaWrite",
    position: { x: 1500, y: 520 },
    data: { kind: "figmaWrite", label: "Editable Figma redesign", serverUrl: "", toolName: "", figmaFileUrl }
  });
  connect(figmaLLMId, figmaId);

  // Feed the redesign spec + Figma push result into the report so sections 2
  // (Changes Applied) and 3 (Human Intervention) can populate.
  connect(figmaLLMId, reportId);
  connect(figmaId, reportId);

  nodes.push({
    id: figmaOutId,
    type: "output",
    position: { x: 1800, y: 520 },
    data: { kind: "output", label: "Figma spec / result", format: "text" }
  });
  connect(figmaId, figmaOutId);

  return { nodes: layoutGraph(nodes, edges), edges };
}

/** Builds the chat-facing summary shown after an autonomous UX review run. */
export function summarizeUXReview(url: string, audit: UXAudit | null, reportOpened: boolean): string {
  if (!audit || !audit.findings) {
    return `I built and ran the UX Review workflow for ${url}, but couldn't consolidate an audit — check that your model provider (Ollama by default) is running, then open the Workflow view and press Run graph. The full graph is ready there.`;
  }
  const s = audit.severityBreakdown || { critical: 0, high: 0, medium: 0, low: 0 };
  const top = audit.findings
    .slice(0, 5)
    .map((f, i) => `${i + 1}. [${f.severity}] ${f.title} — ${f.recommendation}`)
    .join("\n");
  return [
    `UX audit complete for ${audit.url || url}.`,
    ``,
    `Overall UX score: ${audit.overallScore}/100 · Accessibility: ${audit.accessibilityScore}/100 · AI confidence: ${Math.round((audit.confidence || 0) * 100)}%`,
    `Issues: ${audit.findings.length} (${s.critical} critical, ${s.high} high, ${s.medium} medium, ${s.low} low)`,
    ``,
    `Top findings:`,
    top,
    ``,
    reportOpened
      ? `Use the buttons below to download the PDF or open the full report. The editable Figma redesign was written to your connected file (or is ready as a spec on the canvas).`
      : `Open the Workflow view to view the report (Report node → Export PDF / Open report) and the editable Figma redesign.`
  ].join("\n");
}
