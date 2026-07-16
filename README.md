# AI Node Studio

A visual, node-based canvas for wiring different AI models together into pipelines,
and shaping the output however you want (text, markdown, JSON, images, downloadable files).

## What's here

- **Canvas** (`src/App.tsx`, `src/nodes/*`) — drag nodes from the sidebar, connect them
  with wires, hit **Run graph**. Built on [React Flow](https://reactflow.dev).
- **Node types**:
  - `Text Input` — a raw text/data source
  - `LLM Chat` — pick a provider (Anthropic / OpenAI / Gemini) and model, set a system
    prompt and temperature
  - `Prompt Template` — combine multiple incoming wires with `{{in1}}`, `{{in2}}`, ...
  - `Image Generation` — currently wired to OpenAI's `dall-e-3`
  - `Output` — renders the final result as text, markdown, image, or JSON, with a
    Download button
- **Server** (`server/index.js`, `server/providers.js`) — a tiny Express proxy that
  holds your API keys server-side and exposes one endpoint, `/api/run-node`, that the
  canvas calls to execute a node. Add a new provider by writing one function in
  `providers.js` and registering it in the `PROVIDERS` map.
- **Execution engine** (`src/lib/executeGraph.ts`) — topologically sorts the graph and
  runs each node in order, feeding outputs into connected downstream nodes.
- **Save / Load** — export the whole workflow (nodes + wires + settings) as JSON and
  reload it later.

## Setup

```bash
npm install
cp .env.example .env
# open .env and paste in whichever API keys you have (Anthropic, OpenAI, Google) —
# you only need keys for the providers you actually plan to use
npm run dev
```

This starts the Vite dev server (canvas, http://localhost:5173) and the Express
backend (http://localhost:8787) together. Open http://localhost:5173.

## Extending it

- **New node type**: add a data shape to `src/lib/types.ts`, a component in
  `src/nodes/`, register it in `nodeTypes` in `App.tsx`, add it to the palette in
  `src/components/Sidebar.tsx`, and handle its `kind` in `executeGraph.ts`.
- **New provider**: add a function to `server/providers.js` that takes
  `{ model, systemPrompt, input, temperature }` and returns `{ text }` (or
  `{ imageBase64 }`), then register it in the `PROVIDERS` map. It's immediately
  selectable from any `LLM Chat` node.
- **Multi-input ports / named inputs**: right now nodes take a single unnamed input
  (all incoming wires get concatenated, or filled into `{{in1}}`, `{{in2}}`... in
  connection order for Template nodes). If you want strictly named ports (e.g. a
  "compare" node with a distinct "left" and "right" input), that's the next natural
  upgrade to `executeGraph.ts` and the node components — happy to build that next if
  you want it.

## Notes

- `.env` is git-ignored — never commit real API keys.
- The image node currently only supports OpenAI; Anthropic and Gemini don't have a
  first-party image-generation endpoint at the time of writing.
