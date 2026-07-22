# CHANGELOG

Chronological log of every change with the reasoning behind it. Covers both the prior collaboration session (bootstrapping the repo + CI + first governance/verify pass) and the current session (report rewrite, exports, provider routing, `/loop`, Node Studio critique loop).

Each entry: `<short-hash> — <date>` · **What changed** · *Why*.

---

## Prior session — repo bootstrap, CI, initial governance

### `d913d0b` — 2026-07-16 · Initial commit
- **What:** first push of AI Node Studio — visual node-based canvas (React Flow), Express server proxy, node types (Text Input, LLM Chat, Prompt Template, Image Gen, Output).
- **Why:** establish the baseline app on GitHub so the team could collaborate.

### `faa3e21` — 2026-07-16 · README for collaborator onboarding
- **What:** README with setup + provider guidance.
- **Why:** first collaborators needed a landing pad. Ships before any tickets.

### `aaa7e86` → `1ae70a6` — 2026-07-16 · webpack.yml added then removed
- **What:** GitHub Actions webpack workflow created, then removed the same hour.
- **Why:** wrong tool for the stack (project uses Vite, not webpack). Replaced by the proper CI below.

### `6ce7546` — 2026-07-16 · Proper GitHub Actions CI workflow
- **What:** CI runs `npm install` → `npm run build` → `npx tsc --noEmit` on push/PR to main.
- **Why:** catch build + typecheck regressions before they land.

### `c7ebcde` — 2026-07-16 · Team setup guide + provider setup
- **What:** `TEAM_SETUP.md`, tightened README provider notes.
- **Why:** reduce onboarding friction — every collaborator was hitting the same env-var questions.

### `9e2d669` — 2026-07-17 · UX audit workflow + Figma integration improvements (ananya-rajhans)
- **What:** big feature commit — iterative refiner, MCP tool, chat/workflow persistence, ollama provider, textInput attachments, `server/mcp.js`, `.github/workflows/ci.yml`, `figma-screen-plugin/`.
- **Why:** turned Node Studio from a generic LLM canvas into a UX-audit + Figma-redesign pipeline.

### `e57cc66` — 2026-07-20 · Verify-redesign node, governance, UX audit polish
- **What:** new `VerifyRedesignNode`, `server/governance.js`, `server/redesignPrompt.js`, `figma-bridge-plugin/`; icons + view switch components; `GuidedFlow` enhancements; sidebar / App / styles updates.
- **Why:** first governance layer — a reviewer agent between worker output and Figma push — so bad specs don't reach the file. Verify-redesign closes the loop by re-auditing what the redesign actually did.

---

## Current session — CI fix, report rewrite, UX polish, exports, provider routing, `/loop`

### `1ee45ca` — 2026-07-20 · Fix CI: bump plugin-react to v6, fix two invalid CSS selectors
- **What:** `@vitejs/plugin-react` `^4.3.3 → ^6.0.3`; split two `selector, @media {...}` patterns (trailing comma before an at-rule) at `.chat-bubble.user` and `.topbar`.
- **Why:** CI was failing. `vite@8` peer-requires `@vitejs/plugin-react` v6, and Vite 8's lightningcss is stricter than Vite 5's esbuild — the old comma-then-at-rule CSS silently worked before but now rejects.

### `7e0d2c9` — 2026-07-21 · Tighten governance for structural ops + longer bridge deadline + surface plugin op errors
- **What:**
  - `governance.js`: 0 structural ops is now BLOCKING (dropped the `>15 ops` gate); LLM rubric adds −5 for zero structural, −2 for only-1-with->10-ops.
  - `redesignPrompt.js`: hard requirement block up top (≥2 `insertSection`/`cloneAndAppend`); operation-priority list reordered so structural ops come first.
  - `server/index.js`: Figma bridge deadline 60 s → 180 s (30-op redesigns overshoot 60 s); logs `opErrors` from plugin.
  - `figma-bridge-plugin/ui.html`: log applied/skipped/error counts for redesign mode (was showing "0 sections" always because it read a build-mode field); return `opErrors` to the server.
- **Why:** live loop runs kept "approving" pure-mutation specs — plugin created "Loop iter 1 — AI Redesign (0 sections)" twice. Governance too lax, bridge too impatient, plugin UI hid the real error.

### `ba515c0` — 2026-07-21 · Fix invisible text on Iterative Refiner final-choice / iteration-selected blocks
- **What:** force `--positive-strong` (#008816) on text + all children inside `.final-choice` and `.iteration-selected`.
- **Why:** background is `--positive-softest` (light green) in BOTH themes, but text was inheriting `--text-high` which is white in dark mode → invisible. Contrast now ~5.3:1 either theme (WCAG AA).

### `a6b454d` — 2026-07-21 · Trim raw-JSON dumps in chat + cap the refiner draft preview
- **What:**
  - `App.tsx runWorkflow` return: JSON-shaped or >1.6 k char output → compact preview + pointer to Workflow view.
  - `styles.css .iteration-history pre`: 180 px max-height + scroll + monospace + boxed.
- **Why:** raw audit JSON was spilling into the chat and the refiner-round expander. Later partially reverted (`763a691`) once we could scroll inside the bubble.

### `61559b6` — 2026-07-21 · Rewrite UX report as 3 concise sections with before/after images
- **What:** report is now **1. Issues Found · 2. Changes Applied · 3. Human Intervention Remaining**. New async `buildReportHTML` accepts `{ spec, push, verify, afterImageUrl, figmaFileKey }`. Fetches the redesigned frame image via Figma REST when `FIGMA_TOKEN` + `fileKey` + `frameId` are available. `executeGraph` reportGenerator now gathers spec + push + verify from upstream node inputs. `uxReviewGraph`: wire `figmaLLM → report` and `figmaWrite → report`.
- **Why:** old report was cover + exec summary + scorecard + severity matrix + priority quadrant + recommendations + appendix — too long, wrong altitude for the actual deliverable users wanted (what was found, what got fixed, what's left).

### `6eebfcf` — 2026-07-21 · Extend canvas zoom range
- **What:** React Flow `minZoom: 0.05` (was 0.5), `maxZoom: 2.5`; `<MiniMap pannable zoomable />`.
- **Why:** on the full UX Review graph (14 nodes fanned out), 0.5× zoom-out wasn't enough to see the whole thing at once.

### `ddcc3a4` — 2026-07-21 · Add DOCX/PPTX exports, gate report CTA + 3-5 s reply hold, polish sidebar
- **What:**
  - `server/report.js` — extract shared `buildReportModel()`; add `buildReportDocx` (`docx` pkg) + `buildReportPptx` (`pptxgenjs`) that consume the same model (cover + 3 slides / 3 sections).
  - `server/index.js` — `/api/report-docx` + `/api/report-pptx` endpoints.
  - `ReportGeneratorNode` + `GuidedFlow` report CTA — DOCX + PPTX buttons; helper reads audit/spec/push from the live store.
  - `GuidedFlow.send()` — randomised 3–5 s minimum before revealing an answer.
  - Report CTA only reveals when THIS session's send() finished an audit AND the user hasn't switched chats.
  - Sidebar — palette cards with icon + label + description + drag-grip.
- **Why:** exports beyond PDF were asked for; cached/fast replies felt robotic (popped instantly); a stale report from a prior chat was showing up in fresh chats; sidebar was flat/hard to scan.

### `8fbcd74` — 2026-07-21 · Fix chat / workflow-canvas mismatch
- **What:** store `setGraphForChat(chatId, ...)` writes to a specific chat regardless of what's active. `runLoopAudit` at start seeds the originating chat with `buildUXReviewGraph`.
- **Why:** loop-audit is server-side SSE and never populated the client graph — old chats with completed audits showed an empty canvas when reopened.

### `fc4bba7` — 2026-07-21 · Fix chat-list collapse to 0 height in Workflow sidebar
- **What:** `.chat-list { flex-shrink: 0; max-height: 220px; }`.
- **Why:** items existed in the DOM but rendered invisibly — the sidebar's flex column was squeezing the list to zero height between siblings.

### `cc78855` — 2026-07-21 · Keep chat history visible on narrow windows + look-and-feel polish
- **What:**
  - Responsive rail: 1080 px → 240 px, 860 px → 200 px, hide only at ≤ 600 px (was hidden at ≤ 760 px).
  - Visual pass: hero title larger + tighter, active chat item gets inset accent bar, user bubble asymmetric 18/18/6/18 radius, composer floats with softer shadow, preset chips + report CTA get gradient backgrounds, unified button hover motion.
- **Why:** on any laptop between 760 and 1080 px, the chat history disappeared entirely. And overall the UI needed a lift.

### `763a691` — 2026-07-21 · Drop chat-column gradient; show full AI output with in-bubble scroll
- **What:** removed the radial-gradient wash on `.guided-chat`; `runWorkflow` returns raw text (dropped the compact preview); assistant bubble body capped at 60vh with internal scroll.
- **Why:** user disliked the gradient; and wanted the actual model response in chat, not a pointer to the workflow view. Bubble-scroll handles long JSON without dominating the thread.

### `2b51816` — 2026-07-21 · Always show Open/PDF/DOCX/PPTX buttons on Report node — disabled until run
- **What:** button row rendered unconditionally; disabled when no `data.output`; empty-state copy lists all three formats.
- **Why:** users couldn't tell DOCX/PPTX existed because the whole button row was hidden until a report was generated.

### `547368c` — 2026-07-21 · Fix run-progress ETA that climbed while a slow node ran; show % + remaining
- **What:** snapshot `elapsedAtLastCompletion` on each `onNodeDone`; `eta = avgCompletedDuration × nodesLeft − timeInCurrentNode`, clamped ≥ 0. Display now `~Xs remaining · A/B steps` + %. Same fix in the guided-chat thinking bubble.
- **Why:** old formula `(elapsed / completed) × nodesLeft` climbed while a slow LLM node ran because elapsed grew and completed didn't. "Remaining" was going UP.

### `dba2329` — 2026-07-21 · Colored format-icons, split provider routing, inject design-taste skills
- **What:**
  - `IconPdf` / `IconDocx` / `IconPptx` — brand-tinted document silhouettes (red / blue / orange) shown next to labels.
  - **Provider split:** heuristic work (analysis, governance, verifier) → `ollama/gemma3:4b` default; design work (redesign spec) → `anthropic/claude-opus-4-7` default. Loop-audit accepts `{ heuristicProvider, heuristicModel, designProvider, designModel }` (with back-compat for old `provider`/`model`). `uxReviewGraph` PROVIDER/MODEL constants split the same way.
  - `server/skills.js` — fetch + 24 h file-cache SKILL.md files from `emilkowalski/skills` (apple-design, emil-design-eng, pick-ui-library). Loaded once per loop-audit run and appended to the redesign system prompt.
- **Why:**
  - Icons: user wanted format branding, not text-only labels.
  - Routing: pay Claude only for taste-critical steps (redesign spec); Gemma is fine for heuristic scoring + governance and it's free/local.
  - Skills: bring an outside voice on design taste (Apple + Emil Kowalski) into the redesign prompt so the model isn't inventing patterns from scratch.

### `60c9c3e` — 2026-07-22 · Teach Node Studio not to break redesigns; `/loop` wrapper; heuristic-flow wiring
- **What:**
  - Case study: Passport Seva frame 160:859 — Node Studio added a yellow "Quick Links" block that overlapped "Popular Services" + "Know About Our Services", cloned 5 identical "Vacancy Circular" cards, used a bg color absent elsewhere.
  - `redesignPrompt.js` new **LESSONS FROM PAST FAILURES** block (A–E): no spatial collision, no semantic duplication, inherit palette, distinct `replaceText` per clone, rejected structural ops count as zero.
  - `governance.js` new deterministic rules 9–12: block multi-nav inserts, orphan inserts (no `targetParent`), duplicate/blank clones, palette-mismatch inserts. LLM rubric adds −3 / −2 / −3 for these.
  - `/loop` prefix (`/loop <brief>`, `/loop 5 <brief>`, `/loop <goal> :: <brief>`): iterates the workflow, feeding evaluator feedback into the next iteration's brief until score ≥ 8 or maxIter reached. Server: `/api/loop-eval` (Gemma judge).
  - `uxReviewGraph`: wire `refiner → figmaLLM` so the redesign spec consumes REFINED findings instead of raw merge output.
- **Why:**
  - Prompt+governance changes: the same failure class kept slipping through — a whole "let me add a Quick Links section" hallucination that had nothing to do with the findings. Encode the observed failure so it can't repeat.
  - `/loop`: user wanted the loop pattern from `loop-audit` to be usable on ANY workflow, not just Figma audits.
  - Refiner→figmaLLM: refiner was validating findings but its output only reached the report — the actual redesign was still eating raw merge output.

---

## Cross-cutting rationale (why the direction)

- **Governance as a first-class stage** (not just a linter): every failure that reached Figma was a lesson worth encoding as a rule. Cheap deterministic checks first, LLM rubric second, both with concrete deductions so the worker knows exactly what to fix.
- **Provider routing by taste-value**: LLM tokens are the biggest ongoing cost. Anything scorable by rubric or JSON-shape can run on a local Gemma; only design + prose keep Claude.
- **Report should match the deliverable**: designers/PMs consuming this want issues → fixes → open items, not a 9-section audit tome. Same shape, three export formats.
- **Chat has to feel human**: instant replies + stale CTAs + zero-height chat lists all read as broken. The 3–5 s hold, session-gated CTA, and responsive rail all serve the same "feels alive and coherent" goal.
- **Never trust a persisted graph across chat switches**: `setGraphForChat` + graph seeding on loop-audit start close the biggest source of "the chat and the canvas disagree" bugs.
