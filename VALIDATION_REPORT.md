# End-to-End UX Audit — Validation Report

Test date: 2026-07-16. Reasoning model: **Anthropic `claude-sonnet-4-6`** (the
best configured model; the Workflow Assistant and all reasoning nodes ran on it).

Two cases were executed autonomously through the **Workflow Assistant** (which
built the node graph itself) and a headless mirror of the execution engine:

1. **Flipkart** (`https://dl.flipkart.com/s/26eXVdNNNN`) — the specified target.
2. **news.ycombinator.com** — a capturable control, to validate finding /
   redesign / report quality that Flipkart's bot-wall prevents.

## Headline result

The **Workflow Assistant successfully designed the pipeline on its own** in both
cases — choosing the right blocks and wiring them:

```
textInput(url) → webCapture → 4–5× uxAnalysis (all 18 lenses) → mergeFindings
   (+ webCapture context) → iterativeRefiner → reportGenerator → output
mergeFindings → llm(redesign spec) → figmaWrite → output
```

Flipkart: **14 nodes / 18 edges**, 5 analysis passes. HN: **13 nodes / 16 edges**,
4 analysis passes. Structure validation passed for both (webCapture, analysis
passes, merge, refiner, report, figma, output all present). This is the core
capability the task asked to prove.

The run also exposed **three real defects**, now **fixed and re-verified**.

## What worked

- **Assistant graph construction** — Claude assembled a correct, runnable UX
  audit + redesign graph from a one-line brief, including parallel analysis
  passes and the redesign/report branches.
- **URL validation + redirect resolution + capture** — worked on both targets.
- **Honest handling of a blocked target** — Flipkart returned HTTP 403 (a
  reCAPTCHA wall). Rather than hallucinate, the audit's top finding was
  *"Interstitial CAPTCHA page blocks all conversion paths"* with real evidence
  (`HTTP 403; title 'Flipkart reCAPTCHA'; h1 'Are you a human?'`).
- **Merge / dedupe / severity ranking / scoring** — deterministic, instant (<10ms).
- **Report generation** — all 13 required sections present (Cover, Executive
  Summary, UX Score, Heuristic Scorecard, Accessibility, Screens Analysed, Key
  Findings, Evidence, Severity Breakdown, Priority Matrix, Recommendations,
  Quick Wins, Long-term, Methodology, AI Confidence). ~18–28 KB print-ready HTML.
- **Findings quality (post-fix, HN)** — 11 specific, evidence-backed findings
  mapped to principles/WCAG, e.g. *"No heading structure — zero H1/H2/H3"*
  (high, conf 0.95). Consultant-grade, not generic.
- **Redesign quality (post-fix)** — audit-driven; the HN redesign
  ("Hacker News, Elevated") directly addresses findings (heading hierarchy, tap
  targets) with layout, component hierarchy, spacing, typography, interaction
  states, and rationale.
- **Figma fallback** — with no reachable MCP write server, it emitted an
  editable plugin spec + design-decision summary (correct, non-breaking).

## What failed (and the fix)

| # | Defect | Root cause | Status |
|---|---|---|---|
| 1 | **Empty findings on content-rich pages** (HN: 0 findings across all passes) | `callAnthropic` hard-capped `max_tokens: 2048`; findings JSON (~7.9 KB) was **truncated mid-structure** → `extractJSON` returned null → findings discarded | **Fixed**: raised to 8192 + added truncated-array salvage in `extractJSON`. Re-verified: HN → **11 findings**. |
| 2 | **Redesign fell back to a default spec** (Flipkart) | Same truncation — the 7.9 KB redesign JSON exceeded 2048 tokens → unparseable → defaults | **Fixed** by #1. Re-verified: real 4-card audit-driven redesign + rationale. |
| 3 | **Report node hard-failed (HTTP 500)** on the HN graph | The assistant's HN wiring fed the report only the refiner output (not the structured merge audit); `/api/report` rejected a missing audit | **Fixed**: `/api/report` recovers an audit from the narrative or renders a minimal report instead of 500-ing. |

## Architectural bottlenecks

1. **Sequential execution.** The engine runs nodes one at a time in topological
   order. The 4–5 **independent** analysis passes ran serially (~40–80 s each),
   dominating the ~350–365 s total. They could run concurrently → ~3–4× faster.
2. **Iterative refiner on the critical path.** It took **133–145 s** (multiple
   sequential Claude calls) and, fed a structured audit, effectively **echoed
   it** — the prose-oriented refiner adds latency without transforming the JSON
   in this wiring. Its output also isn't consumed as the report narrative
   (a JSON string isn't treated as narrative).
3. **Capture is fetch-only (no headless browser).** Bot-protected sites
   (Flipkart) return 403; SPAs return partial DOM. This caps real-world coverage.
4. **Assistant wiring is non-deterministic.** Flipkart wired `merge→report`; HN
   did not — which triggered defect #3. Critical edges need guaranteeing.

## Missing MCP capabilities (Figma write)

Write **capabilities exist** on the configured `figma-console-mcp` server
(`figma_execute`, `figma_create_child`, `figma_create_component_set`,
`figma_instantiate_component`, `figma_create_variable(_collection)`,
`figma_set_text`/`set_fills`, layer editing). **None were usable in this test:**

- **Transport gap** — `figma-console` uses a **WebSocket Desktop Bridge**; the
  app's MCP client speaks **Streamable-HTTP** only. The app cannot reach it.
- **Not connected** — `figma_get_status` → `setup.valid: false` ("No active file
  connected"); the Desktop Bridge plugin isn't open in Figma.
- **Figma REST token is read-only** for content — the provided token validated
  (`/v1/me` 200) and read the target file (`/v1/files/{key}` 200), but Figma's
  REST API has **no node-creation endpoint**, so it cannot write frames/layers.

**Effect on output:** native Figma write did not run; the pipeline fell back to
the editable **plugin spec** (correct, non-breaking). To enable native write:
open the Desktop Bridge plugin in Figma **and** add a WebSocket transport to
`server/mcp.js`, or point the node at an HTTP-reachable Figma MCP write server.
The write logic (`server/figmaMcp.js`) is transport-agnostic and ready.

## Performance observations

| Stage | Flipkart | HN | Note |
|---|---|---|---|
| Assistant builds graph | 19.1 s | 18.5 s | one Claude call |
| Capture | 0.07 s | 1.05 s | fetch only |
| Analysis pass (each) | ~40 s | ~41–45 s | **serial**; ~80 s post-fix (more findings = more tokens) |
| Merge | <10 ms | <10 ms | deterministic |
| Iterative refiner | 133 s | 145 s | **dominant, low value here** |
| Redesign (LLM) | 27 s | 33 s | |
| Report | 18 ms | (500, fixed) | deterministic |
| **Total** | **~365 s** | **~348 s** | ~6 min |

## Accuracy

- **Findings:** specific, evidence-backed (element counts, WCAG criteria),
  actionable, de-duplicated, principle-mapped, severity-ranked. Meets the
  "experienced UX consultant, not generic AI" bar for the captured data.
- **Confidence calibration is optimistic** — 91 % on a page that was just a
  CAPTCHA wall. Confidence should be down-weighted when `status != 200`, text is
  sparse, or capture is a block page.
- **Score semantics** — 0 findings produced **100/100** (HN, pre-fix). "No data"
  should not read as "perfect."
- **Redesign:** directly traceable to findings; strong on hierarchy, spacing,
  a11y, interaction states, consistency, and rationale.

## Readiness for production

| Area | Status |
|---|---|
| Assistant-built UX pipeline (capturable pages) | ✅ Working after fixes |
| Report (content + formatting) | ✅ Client-ready |
| Findings & redesign quality | ✅ Good; confidence/score calibration ⚠️ |
| Bot-protected / SPA targets (e.g. Flipkart) | ❌ Needs headless browser |
| Native Figma write | ❌ Transport gap; plugin fallback works |
| Performance | ⚠️ ~6 min; serial + refiner dominate |

**Verdict:** functional and genuinely useful for capturable pages; **not yet
production-ready** for bot-protected sites, native Figma write, or latency-
sensitive use.

## Recommended improvements (prioritised) before the next iteration

1. **Parallelise independent nodes** in `executeGraph` (run the analysis passes
   concurrently) — largest performance win (~3–4×). *(not yet done)*
2. **Rework the refiner's role** — don't route the structured audit through the
   prose refiner on the critical path. Either drop it for structured audits, run
   candidate refinements concurrently, cap iterations, or have merge emit a short
   prose narrative in one call that the report consumes. *(not yet done)*
3. **Add headless-browser capture** (Puppeteer) with realistic headers/anti-bot
   + screenshots → unblocks Flipkart and enables vision analysis. *(not yet done)*
4. **Calibrate confidence & score** to capture quality (status, text length,
   block-page detection). *(not yet done)*
5. **Guarantee critical edges** in the assistant graph (always `merge→report`),
   or keep the deterministic builder as the executor while the assistant proposes
   structure. *(report tolerance already added)*
6. **Enable native Figma write** — add a WebSocket transport to `server/mcp.js`
   for `figma-console`, or configure an HTTP Figma MCP write server. *(logic ready)*

## Fixes already applied in this pass

- `server/providers.js` — Anthropic `max_tokens` 2048 → 8192 (fixes truncation).
- `server/uxUtil.js` — `extractJSON` salvages truncated JSON arrays.
- `server/index.js` — `/api/report` degrades gracefully instead of 500-ing.
- `server/index.js` + `src/App.tsx` — Workflow Assistant now runs on Claude and
  can build the full UX node graph itself (`createAssistantGraph` instantiates
  the UX node kinds and seeds the URL/lenses).
