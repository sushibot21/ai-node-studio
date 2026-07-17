# Native Claude + Figma MCP Integration

This replaces the "custom plugin only" redesign flow with a **native Claude +
Figma MCP** workflow, while keeping the plugin as a graceful fallback. Claude
does all reasoning/interface generation; the **app's MCP layer** performs the
Figma write. Claude never manipulates Figma directly.

## 1. MCP capability audit

The Figma MCP server configured in this environment is **`figma-console-mcp`**
(local, `~/.figma-console-mcp/`). Capabilities below were determined by
**inspecting the live tool schemas**, not assumed.

| Capability | Supported | Tool(s) |
|---|---|---|
| Read (file tree, variables, styles, screenshot) | ✅ | `figma_get_file_data`, `figma_get_variables`, `figma_get_styles`, `figma_capture_screenshot`, `figma_get_status` |
| **Write (arbitrary)** | ✅ | `figma_execute` (runs JS with the full `figma` plugin API) |
| Frame creation | ✅ | `figma_create_child` (`FRAME`), `figma_execute` |
| Auto Layout | ✅ | via `figma_execute` (`layoutMode`, sizing, padding, spacing) |
| Component creation | ✅ | `figma_create_component_set`, `figma_execute` |
| Nested components / instances | ✅ | `figma_instantiate_component` (overrides, variants) |
| Text creation / editing | ✅ | `figma_create_child` (`TEXT`), `figma_set_text` |
| Layer editing | ✅ | `figma_set_fills`, `figma_set_strokes`, `figma_move_node`, `figma_resize_node`, `figma_rename_node`, `figma_clone_node`, `figma_delete_node` |
| Variables (design tokens) | ✅ | `figma_create_variable`, `figma_create_variable_collection`, `figma_batch_create_variables`, `figma_setup_design_tokens` |
| Styles / variable binding | ✅ | `figma_set_fills` with `variableId`, `figma_get_text_styles` |

**Conclusion: write capabilities exist and are comprehensive** — frames, auto
layout, components, instances, text, variables, styles, and full layer editing.

### The one real constraint: transport

`figma-console-mcp` connects over a **WebSocket "Desktop Bridge"** to Figma
Desktop (ports 9223–9232). The app's MCP client (`server/mcp.js`) speaks
**Streamable-HTTP JSON-RPC** only. So the app cannot reach *this specific*
server as-is, and at audit time the bridge also had **no Figma file connected**
(`figma_get_status` → `setup.valid: false`).

This is a **transport gap, not a capability gap**. The integration is therefore
built to be transport-agnostic and works with **any HTTP-reachable Figma MCP
server** exposing an execute-style or granular write tool. Two ways to enable it:

1. Point the Figma Redesign node at a Figma MCP server exposed over
   **Streamable HTTP** (some servers/ gateways offer this).
2. Add a WebSocket transport to `server/mcp.js` (isolated change; the capability
   classification and write logic below need no modification).

## 2. Architecture (what changed)

Reuses the existing provider layer (`server/providers.js`) and MCP client
(`server/mcp.js`). No duplicate Figma integration was introduced.

```
Verified UX audit (JSON)
        │
        ▼
  Claude (Anthropic API)  ← reasoning + interface generation ONLY
   • semantic layout • component hierarchy • spacing • typography
   • interaction states • design rationale  →  redesign spec (JSON)
        │
        ▼
  Figma Redesign node  →  POST /api/figma-write
        │
        ├─▶ server/figma.js  (orchestration + normalisation + fallback)
        │        │
        │        ▼
        │   server/figmaMcp.js  (transport-agnostic)
        │     1. discover tools via server/mcp.js  (listMCPTools)
        │     2. classifyFigmaTools() → capability flags
        │     3. pick write tool (explicit → execute-style)
        │     4. buildFigmaExecScript(spec) → native, editable layers
        │     5. call via server/mcp.js  (callMCPTool)
        │
        └─▶ on ANY failure → plugin fallback (figma-screen-plugin/)
```

**New/changed files:** `server/figmaMcp.js` (new — capability classification +
native builder + MCP write), `server/figma.js` (orchestration + richer spec +
fallback), `server/index.js` (`/api/figma-capabilities`, `/api/figma-write`
inject MCP client), `src/lib/uxReviewGraph.ts` (redesign node → Claude/Anthropic
with the richer prompt), `src/nodes/FigmaWriteNode.tsx` (+ "Detect capabilities"),
`src/styles.css`.

## 3. Claude integration

The redesign node in the auto-built graph now runs on **Anthropic
`claude-sonnet-4-6`**. Given the verified audit it returns a structured spec:
`layout`, `componentHierarchy`, `spacing`, `typography`, `interactionStates`,
and `rationale`, plus the concrete `cards`/`colours` the builders render. These
reasoning fields are normalised (`server/figma.js` tolerates string/object/array
shapes) and surfaced as a **design-decision summary** on the node output.

Add your key to `.env` (`ANTHROPIC_API_KEY=…`) and restart. Without it, switch
the node's provider back to Ollama on the canvas.

## 4. Figma write integration

When a Figma MCP server URL is set on the node, `server/figmaMcp.js`:

- **Discovers** the server's tools and **classifies** them (no hard-coded schema).
- Chooses a write tool: an explicit `toolName` if given, else an **execute-style**
  tool (universal, produces the richest editable output).
- **Generates a Figma-API script** (`buildFigmaExecScript`) that builds native,
  editable objects: a Section → Frame with **Auto Layout**, colour **Variables**,
  reusable **Button/Card components** (instances), text layers, and an
  audit-improvements panel. **Never rasterises.**
- Sends it via the shared MCP client. For granular-only servers (no execute
  tool), sequencing individual create tools is a documented extension point
  (currently triggers the plugin fallback with a clear reason).

Use the node's **Detect capabilities** button (or `POST /api/figma-capabilities`)
to audit any server before running.

## 5. Fallback behaviour (never breaks)

`writeFigma` never throws. It falls back to the bundled plugin — emitting a
validated, editable spec — and explains why, when:

- no MCP server URL is configured (normal local default);
- the server is unreachable / errors (`fetch failed`, timeout, transport);
- the server is read-only (no write tools discovered);
- the server has write tools but no execute-style tool (granular sequencing TBD).

The plugin path (`figma-screen-plugin/`) is unchanged and still produces editable
native layers, so existing functionality is fully preserved.

## 6. Verification performed

- Capability classification validated against the real `figma-console-mcp` tool
  list (→ full write) and a read-only list (→ `hasWrite: false`).
- Generated Figma script validated as syntactically valid JS containing
  `createFrame` / variables / components.
- MCP write path proven end-to-end with a mocked client (selects `figma_execute`,
  sends `code`).
- **Real Claude** spec generation verified via the Anthropic API; all richer
  fields carried through and rendered in the design summary.
- Graceful fallback verified for unreachable and read-only servers.

> A live app→Figma write against `figma-console-mcp` was not exercised because
> of the WebSocket-vs-HTTP transport gap (§1) and no connected Figma file. The
> write logic is transport-agnostic and ready once a reachable server is set.
