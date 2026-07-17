// Redesign → Figma output layer.
//
// Two write strategies, chosen at run time with graceful degradation:
//   1. Native MCP write — via a Figma MCP server, using the app's existing MCP
//      client (see figmaMcp.js). Produces editable native layers.
//   2. Plugin fallback — emits a validated spec for the bundled Figma plugin
//      (figma-screen-plugin/), which also builds editable native layers.
// Never produces or references raster images.

import { extractJSON } from "./uxUtil.js";
import { writeFigmaViaMcp } from "./figmaMcp.js";

const str = (v, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const hex = (v, fallback) => {
  const clean = String(v || "").replace(/[^0-9a-f]/gi, "");
  return clean.length === 6 ? clean.toUpperCase() : fallback;
};

// LLMs return these reasoning fields as strings, objects, or arrays. Coerce any
// of those into readable text / a string list so nothing is silently dropped.
const flat = (v, fallback = "") => {
  if (typeof v === "string") return v.trim() || fallback;
  if (Array.isArray(v)) return v.map((x) => flat(x)).filter(Boolean).join("; ") || fallback;
  if (v && typeof v === "object") {
    return Object.entries(v).map(([k, val]) => `${k}: ${flat(val)}`).filter(Boolean).join("; ") || fallback;
  }
  return v == null ? fallback : String(v);
};
const flatList = (v, max) => {
  if (Array.isArray(v)) return v.map((x) => flat(x)).filter(Boolean).slice(0, max);
  const single = flat(v);
  return single ? [single].slice(0, max) : [];
};

/**
 * Returns { spec, warnings } — spec is always valid for the plugin AND the MCP
 * builder. Carries Claude's richer design reasoning (semantic layout, component
 * hierarchy, spacing, typography, interaction states, rationale) alongside the
 * concrete cards/colours the builders render. Extra fields are ignored by the
 * builders but surfaced in the design-decision summary, so this stays backward
 * compatible with the existing plugin.
 */
export function normalizeRedesignSpec(raw) {
  const warnings = [];
  const parsed = typeof raw === "string" ? extractJSON(raw) : raw;
  if (!parsed) warnings.push("Could not parse a redesign spec; used safe defaults.");
  const source = parsed && typeof parsed === "object" ? parsed : {};

  const cards = Array.isArray(source.cards) ? source.cards : [];
  const t = source.tokens && typeof source.tokens === "object" ? source.tokens : {};
  // v2 sectioned screen spec (the finding-driven redesign). Kept alongside the
  // legacy card fields so older specs / the plugin still render.
  const sections = Array.isArray(source.sections)
    ? source.sections.slice(0, 12).map((s) => ({
        type: str(s.type, "content"),
        title: str(s.title),
        subtitle: str(s.subtitle),
        body: flat(s.body),
        price: str(s.price),
        items: Array.isArray(s.items) ? s.items.map((i) => ({ label: str(i.label || i) })).filter((i) => i.label).slice(0, 10) : [],
        fields: Array.isArray(s.fields) ? s.fields.map((f) => ({ label: str(f.label || f), type: str(f.type, "text") })).filter((f) => f.label).slice(0, 8) : [],
        badges: Array.isArray(s.badges) ? s.badges.map((b) => ({ label: str(b.label || b) })).filter((b) => b.label).slice(0, 6) : [],
        cta: s.cta ? { label: str(s.cta.label || s.cta, "Continue"), emphasis: str(s.cta.emphasis, "primary") } : null,
        resolves: flatList(s.resolves, 8),
        rationale: flat(s.rationale)
      }))
    : [];
  const spec = {
    // v2 fields
    screenName: str(source.screenName || source.title, "Redesigned screen"),
    productPurpose: str(source.productPurpose),
    platform: str(source.platform) === "desktop" ? "desktop" : "mobile",
    tokens: {
      bg: hex(t.bg || source.background, "0B0B0B"),
      surface: hex(t.surface, "16181D"),
      accent: hex(t.accent || source.accent, "2874F0"),
      text: hex(t.text, "FFFFFF"),
      textDim: hex(t.textDim, "B8C0CC"),
      border: hex(t.border, "2A2E37"),
      success: hex(t.success, "3DD68C")
    },
    sections,
    findingsResolved: [...new Set(sections.flatMap((s) => s.resolves))],
    // legacy fields (backward compatible with the plugin + old renderer)
    eyebrow: str(source.eyebrow, "REDESIGN"),
    title: str(source.screenName || source.title, "Improved interface"),
    subtitle: str(source.subtitle, "Rebuilt around the audit's highest-severity findings."),
    background: hex(t.bg || source.background, "0B0B0B"),
    accent: hex(t.accent || source.accent, "2874F0"),
    primaryCta: str(source.primaryCta, cards[0]?.cta || "Get started"),
    cards: (cards.length ? cards : [{}, {}, {}]).slice(0, 4).map((c, i) => ({
      title: str(c.title, `Section ${i + 1}`),
      body: str(c.body, "Describe this improvement."),
      cta: str(c.cta, "")
    })),
    improvements: flatList(source.improvements, 8),
    layout: flat(source.layout || source.semanticLayout),
    componentHierarchy: flatList(source.componentHierarchy || source.hierarchy, 20),
    spacing: flat(source.spacing),
    typography: flat(source.typography),
    interactionStates: flatList(source.interactionStates || source.states, 12),
    rationale: flat(source.rationale || source.designRationale)
  };
  return { spec, warnings };
}

// Human-readable design-decision summary from Claude's reasoning fields — a
// deliverable in its own right, shown alongside whichever write path ran.
function designSummary(spec) {
  const lines = [];
  if (spec.rationale) lines.push(`Rationale: ${spec.rationale}`);
  if (spec.layout) lines.push(`Layout: ${spec.layout}`);
  if (spec.typography) lines.push(`Typography: ${spec.typography}`);
  if (spec.spacing) lines.push(`Spacing: ${spec.spacing}`);
  if (spec.componentHierarchy?.length) lines.push(`Component hierarchy:\n  - ${spec.componentHierarchy.join("\n  - ")}`);
  if (spec.interactionStates?.length) lines.push(`Interaction states: ${spec.interactionStates.join(", ")}`);
  return lines.length ? `Design decisions\n${lines.join("\n")}\n` : "";
}

const pluginInstructions = (spec, reason) =>
  (reason ? `Figma MCP write unavailable — ${reason}\nFalling back to the bundled plugin.\n\n` : "") +
  `Editable Figma redesign spec (native layers — frames, auto-layout, reusable Button/Card components, colour variables).\n` +
  `To build it: Figma Desktop → Plugins → Development → "Node Studio — Screen Builder" → paste the spec below → Create screen.\n\n` +
  JSON.stringify(spec, null, 2);

/**
 * Produces an editable Figma redesign. Tries native MCP write when a server URL
 * is configured; on any failure (no server, read-only, transport, runtime) it
 * falls back to the plugin spec and explains why. Never throws — never breaks
 * the pipeline.
 *
 * @param mcp { listTools, callTool } — the app's shared MCP client functions.
 */
export async function writeFigma({ serverUrl, toolName, spec, figmaFileUrl }, mcp) {
  const { spec: normalized, warnings } = normalizeRedesignSpec(spec);

  // Validate the destination link if one was supplied.
  if (figmaFileUrl && !/^https?:\/\/(www\.)?figma\.com\/(file|design|proto)\//i.test(figmaFileUrl)) {
    return {
      mode: "invalid-destination",
      text: `That doesn't look like a Figma file link. Please provide a link like https://www.figma.com/design/…`,
      spec: normalized,
      warnings
    };
  }

  if (serverUrl && mcp?.listTools && mcp?.callTool) {
    try {
      const result = await writeFigmaViaMcp({ serverUrl, toolName, spec: normalized }, mcp);
      const summary = designSummary(normalized);
      return { ...result, text: `${result.text}\n\n${summary}`.trim(), spec: normalized, warnings };
    } catch (err) {
      // Graceful fallback: keep the reason + any discovered capabilities.
      const reason = err?.message || "the MCP write attempt failed";
      warnings.push(`MCP write failed: ${reason}`);
      return {
        mode: "plugin",
        fallback: true,
        reason,
        capabilities: err?.capabilities || null,
        text: `${designSummary(normalized)}\n${pluginInstructions(normalized, reason)}`.trim(),
        spec: normalized,
        warnings
      };
    }
  }

  // No MCP server configured → plugin path (not an error).
  const target = figmaFileUrl ? `Target Figma file: ${figmaFileUrl}\n(No Figma MCP write server is configured, so the redesign is emitted as an editable plugin spec to build into that file.)\n\n` : "";
  return {
    mode: "plugin",
    text: `${designSummary(normalized)}\n${target}${pluginInstructions(normalized)}`.trim(),
    spec: normalized,
    warnings
  };
}
