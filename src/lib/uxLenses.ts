// Canonical catalogue of UX review lenses used by the multi-pass analysis.
// The backend (server/uxLenses.js) holds the detailed prompt instructions for
// each key; this frontend copy holds only key + human label for node UI and
// the auto-graph builder. Keys MUST stay in sync across both files.

export interface UXLens {
  key: string;
  label: string;
}

export const UX_LENSES: UXLens[] = [
  { key: "nielsen", label: "Nielsen's 10 Heuristics" },
  { key: "wcag", label: "WCAG Accessibility" },
  { key: "visualHierarchy", label: "Visual Hierarchy" },
  { key: "gestalt", label: "Gestalt Principles" },
  { key: "informationArchitecture", label: "Information Architecture" },
  { key: "interactionDesign", label: "Interaction Design" },
  { key: "mobileUX", label: "Mobile UX" },
  { key: "navigation", label: "Navigation" },
  { key: "conversion", label: "Conversion Optimisation" },
  { key: "trust", label: "Trust & Credibility" },
  { key: "forms", label: "Forms" },
  { key: "errorPrevention", label: "Error Prevention" },
  { key: "contentReadability", label: "Content & Readability" },
  { key: "designConsistency", label: "Design Consistency" },
  { key: "cognitiveLoad", label: "Cognitive Load" },
  { key: "progressiveDisclosure", label: "Progressive Disclosure" },
  { key: "recognitionRecall", label: "Recognition vs Recall" },
  { key: "feedbackStatus", label: "Feedback & System Status" }
];

export const LENS_LABEL: Record<string, string> = Object.fromEntries(
  UX_LENSES.map((lens) => [lens.key, lens.label])
);

// Five independent review passes that together cover all 18 lenses. Grouping
// keeps the auto-built graph readable while preserving "each pass is independent".
export const ANALYSIS_PASSES: { label: string; lenses: string[] }[] = [
  { label: "Usability Heuristics", lenses: ["nielsen", "errorPrevention", "feedbackStatus", "recognitionRecall"] },
  { label: "Accessibility & Readability", lenses: ["wcag", "contentReadability", "cognitiveLoad"] },
  { label: "Visual & Layout", lenses: ["visualHierarchy", "gestalt", "designConsistency", "progressiveDisclosure"] },
  { label: "IA & Interaction", lenses: ["informationArchitecture", "navigation", "interactionDesign"] },
  { label: "Mobile, Forms & Conversion", lenses: ["mobileUX", "forms", "conversion", "trust"] }
];
