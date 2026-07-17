# Autonomous UX Review Workflow

AI Node Studio can take a single **product URL** and autonomously produce a
professional UX audit, a research-backed heuristic evaluation, an accessibility
report, a severity matrix, prioritised recommendations, an **editable Figma
redesign**, and a **client-ready PDF report** — all as a visible, editable node
graph.

## How to run it

**Chat-first (recommended):** open the Agent view and paste a URL, e.g.

```
https://example.com
```

Any message containing an `http(s)` URL triggers the UX Review pipeline. The
graph is built, executed, the report opens in a new tab, and a summary (scores +
top findings) appears in the chat. The full graph stays on the canvas.

**Canvas:** open the Workflow view → **◎ UX Review**. This drops the full graph
onto the canvas. Set the URL on the **Web Capture** node, then **Run graph**.

> Reasoning nodes default to **Ollama** (`hermes3:latest`) so it runs locally.
> Switch any node's provider to Anthropic/OpenAI/Gemini for stronger analysis
> (add the key in `.env`). Vision-capable hosted models give the best results.

## The pipeline

```
URL → Web Capture ─┬─▶ 5 independent UX Analysis passes ─┐
                   │                                     ├─▶ Merge / Dedupe / Rank ─┬─▶ Iterative Refiner ─┐
                   └─────────────────────────────────────┘   (deterministic audit)  │                     ├─▶ Report → Output (Export PDF)
                                                                                     ├─────────────────────┘
                                                                                     └─▶ LLM redesign spec → Figma Redesign → Output
```

| Stage | Node kind | What it does |
|---|---|---|
| Capture | `webCapture` | Validates the URL, follows redirects, loads the page, extracts DOM + interface metadata into a `PageContext`. |
| Analysis ×5 | `uxAnalysis` | Five **independent** passes covering all **18 lenses** (see below). Each emits structured `Finding[]`. |
| Merge | `mergeFindings` | Concatenates, **de-duplicates**, **severity-ranks**, and derives overall/accessibility/lens scores → one `UXAudit`. Deterministic (reproducible, offline-safe). |
| Refine | `iterativeRefiner` | **Reused as-is.** Critiques and strengthens the consolidated findings against UX standards over several rounds. |
| Report | `reportGenerator` | Renders a presentation-grade HTML report (cover, exec summary, scorecard, severity breakdown, priority matrix, recommendations, appendix, methodology, AI confidence). |
| Redesign | `llm` + `figmaWrite` | The LLM turns the audit into a redesign spec; the Figma node produces **editable** native layers. |

### The 18 lenses (grouped into 5 passes)

1. **Usability Heuristics** — Nielsen's 10, Error Prevention, Feedback & System Status, Recognition vs Recall
2. **Accessibility & Readability** — WCAG, Content & Readability, Cognitive Load
3. **Visual & Layout** — Visual Hierarchy, Gestalt, Design Consistency, Progressive Disclosure
4. **IA & Interaction** — Information Architecture, Navigation, Interaction Design
5. **Mobile, Forms & Conversion** — Mobile UX, Forms, Conversion, Trust & Credibility

Each finding carries: title, description, violated principle, evidence,
severity, user impact, recommendation, and a confidence score.

## The PDF report

The Report node emits a self-contained, **print-optimised HTML** document.
Open it (Report node → **Open report**, or the chat auto-opens it) and use your
browser's **Print → Save as PDF** — this produces the client-ready PDF. The
report CSS has print rules (page breaks, backgrounds) tuned for this.

## Editable Figma redesign (native Claude + Figma MCP)

The redesign is a **native Claude + Figma MCP** flow — see
[FIGMA_MCP.md](FIGMA_MCP.md) for the full capability audit and architecture.
**Claude** (Anthropic `claude-sonnet-4-6`) turns the verified audit into a
structured redesign spec (semantic layout, component hierarchy, spacing,
typography, interaction states, rationale). Claude never touches Figma directly;
the **Figma Redesign node's MCP layer** performs the write. Output is always
**native + editable** — never a raster.

Two write modes, chosen automatically at run time with graceful degradation:

1. **MCP write mode** — set a Figma **MCP server URL** (+ optional write tool)
   on the node. It discovers the server's tools, classifies capabilities (use
   **Detect capabilities**), generates a Figma-API build script, and writes
   native layers via the app's existing MCP client (`server/mcp.js`).
2. **Plugin fallback (default / on any failure)** — with no reachable MCP write
   server, the node emits a validated spec for the bundled plugin in
   `figma-screen-plugin/` (frames, **auto-layout**, reusable **Button/Card
   components**, text, **colour variables**). It also explains *why* it fell back.

> The locally-configured `figma-console-mcp` server has full write tools but
> speaks a WebSocket Desktop Bridge, while the app's MCP client speaks
> Streamable-HTTP — a transport gap documented in [FIGMA_MCP.md](FIGMA_MCP.md).
> The integration is transport-agnostic and works with any HTTP-reachable Figma
> MCP server.

## Known limitations & integration gaps (deliberate, not fabricated)

These depend on capabilities not bundled in the repo. The integration points
exist and degrade cleanly:

- **Screenshots / true visual capture.** No headless browser (Puppeteer/
  Playwright) is bundled — that would download Chromium and materially change
  the dependency footprint. `webCapture` therefore analyses **served DOM +
  metadata** and clearly marks that no screenshot was taken. *To enable:* add
  `puppeteer`, then in `server/dom.js` capture a screenshot after `fetch` and
  set `PageContext.screenshot` (base64). Vision-capable analysis models can then
  consume it. Client-rendered SPAs return limited static DOM — findings note
  this and confidence is lowered accordingly.
- **Native binary PDF.** No PDF library is bundled; the report ships as
  print-to-PDF HTML (which produces excellent PDFs). *To enable a server-side
  `.pdf`:* add `puppeteer` (`page.pdf()`) or `pdfkit` and add a `/api/report.pdf`
  route that renders `buildReportHTML` output.
- **Figma MCP write.** Now a native Claude + Figma MCP flow (see
  [FIGMA_MCP.md](FIGMA_MCP.md)). Write capabilities in the configured
  `figma-console-mcp` server are comprehensive; the only gap is a WebSocket-vs-
  HTTP **transport** mismatch with the app's MCP client. Works with any
  HTTP-reachable Figma MCP server; falls back to the editable plugin otherwise.
- **Semantic de-duplication.** Merge de-dupes by lens + title similarity
  (lexical, conservative — it won't over-merge). Paraphrased duplicates across
  passes may survive; the Iterative Refiner consolidates them in the narrative.

## Files added / changed

**Backend:** `server/dom.js` (capture), `server/uxLenses.js` (lens prompts),
`server/uxUtil.js` (JSON/finding normalisation), `server/uxReview.js` (merge +
scoring), `server/report.js` (HTML report), `server/figma.js` (redesign spec +
MCP write), and new routes in `server/index.js`.

**Frontend:** `src/lib/types.ts` (domain types), `src/lib/uxLenses.ts`,
`src/lib/models.ts`, `src/lib/uxReviewGraph.ts` (auto-graph builder),
`src/lib/executeGraph.ts` (5 new node branches), 5 new node components in
`src/nodes/`, and wiring in `src/App.tsx`, `src/components/GuidedFlow.tsx`,
`src/components/Sidebar.tsx`, `src/styles.css`.

**Figma plugin:** `figma-screen-plugin/code.js` extended with reusable
components + colour variables.
