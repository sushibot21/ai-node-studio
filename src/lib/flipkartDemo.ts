import type { Edge, Node } from "@xyflow/react";
import type { AnyNodeData } from "./types";
import { ANALYSIS_PASSES } from "./uxLenses";
import { nextId } from "../store";
import { layoutGraph } from "./layoutGraph";
import {
  FLIPKART_PAGE_CONTEXT,
  FLIPKART_AUDIT,
  FLIPKART_REFINER_NARRATIVE,
  FLIPKART_REDESIGN_SPEC,
  FLIPKART_FIGMA_OUTPUT,
  FLIPKART_REPORT_HTML
} from "./flipkartDemoData";

// Pre-populated Flipkart UX Review scenario for live demos. It mirrors exactly
// the graph buildUXReviewGraph() produces, but every node is already "done" with
// realistic outputs — so the demo loads instantly (Flipkart blocks live server
// fetch with a CAPTCHA, so a real run can't be shown reliably). The Report node's
// "Open report" and the Figma node's spec both work immediately.
const URL = FLIPKART_PAGE_CONTEXT.requestedUrl;
const PROVIDER = "anthropic" as const;
const MODEL = "claude-sonnet-4-6";

export function buildFlipkartDemo(): { nodes: Node<AnyNodeData>[]; edges: Edge[] } {
  const uid = (p: string) => `${p}_${nextId()}`;
  const nodes: Node<AnyNodeData>[] = [];
  const edges: Edge[] = [];
  const connect = (source: string, target: string) => edges.push({ id: `e_${source}_${target}`, source, target });

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
    id: urlInputId, type: "textInput", position: { x: 40, y: 360 },
    data: { kind: "textInput", label: "Product URL", inputType: "link", text: URL, status: "done", output: URL }
  });
  nodes.push({
    id: captureId, type: "webCapture", position: { x: 300, y: 360 },
    data: { kind: "webCapture", label: "Capture page", url: URL, viewport: "desktop", status: "done", output: JSON.stringify(FLIPKART_PAGE_CONTEXT) }
  });
  connect(urlInputId, captureId);

  // Five independent analysis passes, each pre-filled with the findings whose
  // lens belongs to that pass (some passes legitimately find nothing).
  ANALYSIS_PASSES.forEach((pass, i) => {
    const id = uid("analysis");
    const passFindings = FLIPKART_AUDIT.findings.filter((f) => pass.lenses.includes(f.lens));
    nodes.push({
      id, type: "uxAnalysis", position: { x: 600, y: 40 + i * 190 },
      data: { kind: "uxAnalysis", label: pass.label, provider: PROVIDER, model: MODEL, lenses: pass.lenses, temperature: 0.4, status: "done", output: JSON.stringify(passFindings) }
    });
    connect(captureId, id);
    connect(id, mergeId);
  });

  nodes.push({
    id: mergeId, type: "mergeFindings", position: { x: 920, y: 360 },
    data: { kind: "mergeFindings", label: "Merge · dedupe · rank", provider: PROVIDER, model: MODEL, status: "done", output: JSON.stringify(FLIPKART_AUDIT) }
  });
  connect(captureId, mergeId);

  nodes.push({
    id: refinerId, type: "iterativeRefiner", position: { x: 1200, y: 140 },
    data: {
      kind: "iterativeRefiner", label: "Validate & strengthen findings", provider: PROVIDER, model: MODEL,
      goal: "Improve and validate the consolidated UX findings against recognised UX and UI best practices.",
      rubric: "Concrete evidence, named principle, justified severity, specific recommendation; remove vague findings; preserve reasoning.",
      maxIterations: 3, targetScore: 9, temperature: 0.5, status: "done", output: FLIPKART_REFINER_NARRATIVE,
      history: [
        { iteration: 1, score: 7, critique: "Issues were listed but several lacked concrete on-page evidence and a justified severity.", draft: "Initial consolidated findings for the product page.", selected: false, selectionReason: "Not selected: scored 7/10, below the best candidate's 9/10." },
        { iteration: 2, score: 9, critique: "Each issue now cites concrete evidence, a named principle, and a justified severity with a specific fix.", draft: FLIPKART_REFINER_NARRATIVE, selected: true, selectionReason: "Selected: highest evaluation score (9/10) after comparing all rounds; it meets the 9/10 target." }
      ]
    }
  });
  connect(mergeId, refinerId);

  nodes.push({
    id: reportId, type: "reportGenerator", position: { x: 1500, y: 200 },
    data: { kind: "reportGenerator", label: "UX Audit Report", reportUrl: URL, title: "Flipkart — boAt Rockerz 255 Pro+ Product Page", status: "done", output: FLIPKART_REPORT_HTML }
  });
  connect(mergeId, reportId);
  connect(refinerId, reportId);
  connect(captureId, reportId);

  nodes.push({
    id: reportOutId, type: "output", position: { x: 1800, y: 200 },
    data: { kind: "output", label: "Report summary", format: "markdown", status: "done", output: FLIPKART_REFINER_NARRATIVE }
  });
  connect(reportId, reportOutId);

  nodes.push({
    id: figmaLLMId, type: "llm", position: { x: 1200, y: 520 },
    data: { kind: "llm", label: "Claude redesign spec", provider: PROVIDER, model: MODEL, systemPrompt: "Turn the verified UX audit into a JSON redesign spec (layout, component hierarchy, spacing, typography, interaction states, rationale, cards, colours).", temperature: 0.4, status: "done", output: JSON.stringify(FLIPKART_REDESIGN_SPEC, null, 2) }
  });
  connect(mergeId, figmaLLMId);
  connect(mergeId, figmaId); // audit context for the Figma write step

  nodes.push({
    id: figmaId, type: "figmaWrite", position: { x: 1500, y: 520 },
    data: { kind: "figmaWrite", label: "Editable Figma redesign", serverUrl: "", toolName: "", status: "done", output: FLIPKART_FIGMA_OUTPUT }
  });
  connect(figmaLLMId, figmaId);

  nodes.push({
    id: figmaOutId, type: "output", position: { x: 1800, y: 520 },
    data: { kind: "output", label: "Figma spec / result", format: "text", status: "done", output: FLIPKART_FIGMA_OUTPUT }
  });
  connect(figmaId, figmaOutId);

  return { nodes: layoutGraph(nodes, edges), edges };
}
