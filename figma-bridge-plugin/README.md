# Node Studio Bridge — Figma plugin

A live bridge between AI Node Studio and your Figma file. When a UX Review
produces a redesign, Node Studio writes it **directly into the open Figma file**
as editable native layers (frames, Auto Layout, a reusable Button component,
colour variables) — no copy-paste, no external service.

## How it works

```
Node Studio (figmaWrite node) → POST /api/figma-bridge (job queue)
        ▲                                   │
        │ result                            ▼ poll
        └──────────  Node Studio Bridge plugin (this) ── builds in your file
```

The plugin polls the local Node Studio server for build jobs, builds each one
with the Figma plugin API, and reports the result back. While it's connected,
`/api/figma-write` routes redesigns to it automatically (in preference to the
MCP or plugin-spec fallbacks).

## Setup (local)

1. Run Node Studio: `npm run dev` (server on `http://localhost:8787`).
2. In **Figma Desktop**, open the file you want to design into.
3. **Plugins → Development → Import plugin from manifest…** → pick
   `figma-bridge-plugin/manifest.json`.
4. Run **Plugins → Development → Node Studio Bridge**, confirm the server URL,
   and click **Connect**. The status should read "Connected — waiting for
   redesigns."
5. In Node Studio, run a UX Review. The redesign appears in your file to the
   right of existing content. No Figma link needed while the bridge is connected.

If the server runs on a different host/port, just update the URL in the plugin's
Connect panel. `networkAccess.allowedDomains` is `["*"]` because Figma's manifest
validator rejects an IP-with-port (e.g. `http://127.0.0.1:8787`) in that field;
`"*"` is acceptable for a local dev bridge. To lock it down, move the local
origin to `devAllowedDomains` instead.

## Notes

- This is separate from `figma-screen-plugin/` (the paste-a-spec plugin). This
  one is a persistent, automatic bridge.
- The renderer here mirrors the server's `figmaMcp` builder, so bridge output
  matches the spec output.
