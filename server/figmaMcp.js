// Figma-over-MCP integration layer.
//
// This talks to a Figma MCP server THROUGH the app's existing generic MCP client
// (server/mcp.js) — it never opens a second, Figma-specific transport. The MCP
// client functions are injected so this module stays decoupled and testable.
//
// Design goal: work with ANY Figma MCP server the app can reach, without assuming
// a fixed tool schema. We discover the server's tools at runtime, classify their
// capabilities, and pick a write strategy. If no usable write path exists, we
// throw so the caller can fall back to the bundled plugin flow.
//
// NOTE on the locally-configured `figma-console-mcp` server: it exposes rich
// write tools (figma_execute, figma_create_child, figma_create_component_set,
// figma_instantiate_component, figma_create_variable, figma_set_text/fills, …)
// but over a *WebSocket Desktop Bridge*, whereas server/mcp.js speaks
// Streamable-HTTP. See FIGMA_MCP.md for how to bridge that transport gap. The
// classification + write logic below is transport-agnostic and applies to any
// HTTP-reachable Figma MCP server.

const matchName = (tools, re) => tools.find((t) => re.test(t.name || ""))?.name || null;

/**
 * Classifies a server's tool list into Figma capability flags by name pattern,
 * so we don't hard-code one server's schema.
 */
export function classifyFigmaTools(tools = []) {
  const names = tools.map((t) => t.name || "");
  const has = (re) => names.some((n) => re.test(n));
  const executeTool = matchName(tools, /execute|run.?code|eval_?js|run.?script/i);
  const capabilities = {
    read: has(/get_|list|read|screenshot|search|status|file_data/i),
    execute: !!executeTool,
    frameCreation: has(/create.*(frame|child|node)|add.*(frame|shape)/i),
    autoLayout: has(/auto.?layout|layout.?mode/i) || !!executeTool, // execute can set layoutMode
    componentCreation: has(/create.*component|component.?set/i) || !!executeTool,
    componentInstance: has(/instantiate|create.*instance/i),
    textCreation: has(/create.*text|add.*text/i) || has(/set.?text/i) || !!executeTool,
    layerEditing: has(/set.?text|set.?fills|set.?strokes|move_node|resize_node|rename_node|clone_node|delete_node/i),
    variableSupport: has(/variable/i),
    styleSupport: has(/style|set.?fills|set.?strokes/i)
  };
  const writeTools = names.filter((n) =>
    /create|add|set_|set[A-Z]|instantiate|execute|update|delete|move|resize|rename|clone|combine|batch/i.test(n)
  );
  return {
    ...capabilities,
    hasWrite: writeTools.length > 0,
    executeTool,
    writeTools,
    allTools: names
  };
}

// Self-contained builder that runs INSIDE the Figma plugin context (via the
// server's execute-style tool). Uses only the `figma` global. Builds a REAL,
// finding-driven screen from spec.sections — native frames with Auto Layout,
// colour Variables, a reusable Button component, text layers, and per-section
// "Resolves Fxxx" captions that tie the redesign to the audit. Never rasterises.
// Falls back to a simple hero+cards layout for legacy specs without sections.
async function figmaBuilder(spec) {
  const hex = (value, fallback) => {
    const s = String(value || fallback || "").replace("#", "");
    return { r: parseInt(s.slice(0, 2), 16) / 255 || 0, g: parseInt(s.slice(2, 4), 16) / 255 || 0, b: parseInt(s.slice(4, 6), 16) / 255 || 0 };
  };
  const paint = (color) => [{ type: "SOLID", color }];
  for (const f of [{ family: "Inter", style: "Regular" }, { family: "Inter", style: "Medium" }, { family: "Inter", style: "Bold" }]) {
    try { await figma.loadFontAsync(f); } catch (e) {}
  }
  const T = spec.tokens || { bg: spec.background || "0B0B0B", surface: "16181D", accent: spec.accent || "2874F0", text: "FFFFFF", textDim: "B8C0CC", border: "2A2E37", success: "3DD68C" };
  // Accessible label colour on the accent (black on light accents, white on dark).
  const lum = (h) => { const c = hex(h); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; };
  const onAccent = lum(T.accent) > 0.6 ? "111111" : "FFFFFF";

  const vars = {};
  try {
    const collection = figma.variables.createVariableCollection("Redesign Tokens");
    const modeId = collection.modes[0].modeId;
    for (const [name, val] of Object.entries(T)) {
      const v = figma.variables.createVariable(name, collection, "COLOR");
      v.setValueForMode(modeId, hex(val));
      vars[name] = v;
    }
  } catch (e) {}
  const fill = (node, name) => {
    const color = hex(T[name]);
    try {
      if (vars[name] && figma.variables?.setBoundVariableForPaint) {
        node.fills = [figma.variables.setBoundVariableForPaint({ type: "SOLID", color }, "color", vars[name])];
        return;
      }
    } catch (e) {}
    node.fills = paint(color);
  };
  const mk = async (content, size, colorHex, weight) => {
    const n = figma.createText();
    try { n.fontName = { family: "Inter", style: weight || "Regular" }; } catch (e) {}
    n.characters = String(content == null ? "" : content);
    n.fontSize = size;
    n.fills = paint(hex(colorHex, "FFFFFF"));
    return n;
  };
  const fillW = (n) => { try { n.layoutSizingHorizontal = "FILL"; } catch (e) {} };

  // Reusable Button component (accessible contrast on the accent).
  const button = figma.createComponent();
  button.name = "Redesign / Button";
  button.layoutMode = "HORIZONTAL"; button.primaryAxisSizingMode = "AUTO"; button.counterAxisSizingMode = "AUTO";
  button.paddingLeft = button.paddingRight = 20; button.paddingTop = button.paddingBottom = 14; button.cornerRadius = 10;
  fill(button, "accent");
  button.appendChild(await mk("Action", 15, onAccent, "Bold"));
  button.x = -1200; button.y = 2000;

  const isMobile = (spec.platform || "mobile") !== "desktop";
  const W = isMobile ? 480 : 1200;

  const frame = figma.createFrame();
  frame.name = spec.screenName || spec.title || "Redesigned screen";
  frame.resize(W, 200);
  fill(frame, "bg");
  frame.layoutMode = "VERTICAL"; frame.primaryAxisSizingMode = "AUTO"; frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = 0; frame.paddingTop = frame.paddingBottom = 0; frame.paddingLeft = frame.paddingRight = 0;

  // Reusable section container.
  const makeSection = (name, surface, gap) => {
    const s = figma.createFrame();
    s.name = name;
    s.layoutMode = "VERTICAL"; s.primaryAxisSizingMode = "AUTO"; s.counterAxisSizingMode = "FIXED";
    s.itemSpacing = gap == null ? 10 : gap; s.paddingLeft = s.paddingRight = 24; s.paddingTop = s.paddingBottom = 20;
    if (surface) { fill(s, "surface"); } else { s.fills = []; }
    frame.appendChild(s); fillW(s);
    return s;
  };
  const add = async (parent, content, size, colorHex, weight) => { const t = await mk(content, size, colorHex, weight); t.textAutoResize = "HEIGHT"; parent.appendChild(t); fillW(t); return t; };
  const resolvesCaption = async (parent, resolves) => {
    if (resolves && resolves.length) await add(parent, "✓ Resolves " + resolves.join(", "), 11, T.accent, "Medium");
  };

  const sections = Array.isArray(spec.sections) ? spec.sections : [];

  // Header: purpose + rationale + which findings the redesign resolves overall.
  const header = makeSection("Header", false, 6);
  await add(header, spec.productPurpose ? "PURPOSE — " + spec.productPurpose : "REDESIGN", 11, T.textDim, "Medium");
  await add(header, spec.screenName || spec.title || "Redesigned screen", isMobile ? 24 : 34, T.text, "Bold");
  if (spec.designRationale) await add(header, spec.designRationale, 13, T.textDim, "Regular");
  const resolvedAll = spec.findingsResolved || [...new Set(sections.flatMap((s) => s.resolves || []))];
  if (resolvedAll.length) await add(header, "Findings resolved: " + resolvedAll.join(", "), 11, T.accent, "Medium");

  let componentCount = 1;
  if (sections.length) {
    for (const sec of sections.slice(0, 12)) {
      const type = sec.type || "content";
      const surface = ["priceCta", "trust", "form", "media", "banner"].includes(type);
      const s = makeSection((type + " " + (sec.title || "")).trim(), surface, 10);
      if (sec.title) await add(s, sec.title, type === "hero" ? (isMobile ? 26 : 40) : 18, T.text, "Bold");
      if (sec.subtitle) await add(s, sec.subtitle, 14, T.textDim, "Regular");

      if (type === "nav") {
        const row = figma.createFrame(); row.name = "Nav"; row.layoutMode = "HORIZONTAL"; row.itemSpacing = 16; row.counterAxisAlignItems = "CENTER"; row.fills = []; s.appendChild(row); fillW(row);
        for (const it of (sec.items || []).slice(0, 6)) { const t = await mk(it.label || it, 13, T.text, "Medium"); row.appendChild(t); }
      } else if (type === "media") {
        const r = figma.createFrame(); r.name = "Media"; r.resize(W - 48, isMobile ? 260 : 380); r.cornerRadius = 14; fill(r, "border");
        r.layoutMode = "VERTICAL"; r.primaryAxisAlignItems = "CENTER"; r.counterAxisAlignItems = "CENTER";
        s.appendChild(r); fillW(r);
        r.appendChild(await mk(sec.mediaLabel || "Product media (editable placeholder)", 12, T.textDim, "Regular"));
      } else if (type === "priceCta") {
        if (sec.price) await add(s, sec.price, 26, T.text, "Bold");
        const btn = button.createInstance(); componentCount++; s.appendChild(btn); fillW(btn);
        const l = btn.findOne((n) => n.type === "TEXT"); if (l) l.characters = (sec.cta && sec.cta.label) || "Add to Cart";
      } else if (type === "form") {
        for (const f of (sec.fields || []).slice(0, 6)) {
          await add(s, f.label || "Field", 12, T.textDim, "Medium"); // visible, associated label (fixes forms findings)
          const inp = figma.createFrame(); inp.name = "Input"; inp.resize(W - 48, 46); inp.cornerRadius = 8; inp.strokeWeight = 1; inp.strokes = paint(hex(T.border)); inp.fills = []; s.appendChild(inp); fillW(inp);
        }
        if (sec.cta) { const btn = button.createInstance(); componentCount++; s.appendChild(btn); fillW(btn); const l = btn.findOne((n) => n.type === "TEXT"); if (l) l.characters = sec.cta.label || "Submit"; }
      } else if (type === "trust") {
        const row = figma.createFrame(); row.name = "Trust"; row.layoutMode = "HORIZONTAL"; row.itemSpacing = 8; row.layoutWrap = "WRAP"; row.counterAxisSpacing = 8; row.fills = []; s.appendChild(row); fillW(row);
        for (const b of (sec.badges || sec.items || []).slice(0, 6)) {
          const chip = figma.createFrame(); chip.name = "Badge"; chip.layoutMode = "HORIZONTAL"; chip.primaryAxisSizingMode = "AUTO"; chip.counterAxisSizingMode = "AUTO"; chip.paddingLeft = chip.paddingRight = 12; chip.paddingTop = chip.paddingBottom = 7; chip.cornerRadius = 99; chip.strokeWeight = 1; chip.strokes = paint(hex(T.border)); chip.fills = []; row.appendChild(chip);
          chip.appendChild(await mk(b.label || b, 12, T.text, "Medium"));
        }
      } else if (type === "list") {
        for (const it of (sec.items || []).slice(0, 8)) await add(s, "• " + (it.label || it), 13, T.textDim, "Regular");
      } else if (type === "cta") {
        const btn = button.createInstance(); componentCount++; s.appendChild(btn); fillW(btn);
        const l = btn.findOne((n) => n.type === "TEXT"); if (l) l.characters = (sec.cta && sec.cta.label) || sec.title || "Continue";
      } else {
        if (sec.body) await add(s, sec.body, 14, T.textDim, "Regular");
        for (const it of (sec.items || []).slice(0, 8)) await add(s, "• " + (it.label || it), 13, T.textDim, "Regular");
      }
      await resolvesCaption(s, sec.resolves);
    }
  } else {
    // Legacy fallback: hero + cards from the old spec shape.
    const body = makeSection("Content", false, 16);
    for (const item of (spec.cards || []).slice(0, 4)) {
      const c = figma.createFrame(); c.name = item.title || "Card"; c.layoutMode = "VERTICAL"; c.primaryAxisSizingMode = "AUTO"; c.counterAxisSizingMode = "FIXED"; c.paddingLeft = c.paddingRight = 20; c.paddingTop = c.paddingBottom = 20; c.itemSpacing = 10; c.cornerRadius = 14; c.strokeWeight = 1; c.strokes = paint(hex(T.border)); fill(c, "surface"); body.appendChild(c); fillW(c);
      await add(c, item.title || "Section", 18, T.text, "Bold");
      if (item.body) await add(c, item.body, 14, T.textDim, "Regular");
      if (item.cta) { const btn = button.createInstance(); componentCount++; c.appendChild(btn); const l = btn.findOne((n) => n.type === "TEXT"); if (l) l.characters = item.cta; }
    }
  }

  let section;
  try { section = figma.createSection(); section.name = "AI Node Studio — UX Redesign"; } catch (e) { section = null; }
  if (section) { section.appendChild(frame); try { section.resizeWithoutConstraints(W + 160, frame.height + 160); } catch (e) {} } else { figma.currentPage.appendChild(frame); }
  try { figma.currentPage.selection = [frame]; figma.viewport.scrollAndZoomIntoView([frame]); } catch (e) {}
  return { ok: true, frameId: frame.id, frameName: frame.name, sections: sections.length, variables: Object.keys(vars).length, components: 1, resolves: (spec.findingsResolved || []).length };
}

/** Serialises the builder into a script string for an execute-style MCP tool. */
export function buildFigmaExecScript(spec) {
  return `return (${figmaBuilder.toString()})(${JSON.stringify(spec)});`;
}

/**
 * Writes an editable redesign to Figma via an MCP server, chosen by capability.
 * @param serverUrl  Figma MCP Streamable-HTTP endpoint
 * @param toolName   optional explicit write tool to use
 * @param spec       normalised redesign spec
 * @param mcp        { listTools(serverUrl), callTool({serverUrl,toolName,arguments}) }
 * Throws when the server exposes no usable write path (caller falls back).
 */
export async function writeFigmaViaMcp({ serverUrl, toolName, spec }, mcp) {
  const tools = await mcp.listTools(serverUrl);
  const caps = classifyFigmaTools(tools);
  if (!caps.hasWrite) {
    const err = new Error("The Figma MCP server exposes no write tools (read-only).");
    err.capabilities = caps;
    throw err;
  }

  // Prefer an explicit tool, then an execute-style tool (universal + fully
  // editable output). Granular create-tool sequencing is a documented extension.
  const explicit = toolName && tools.find((t) => t.name === toolName)?.name;
  const chosen = explicit || caps.executeTool;
  if (!chosen) {
    const err = new Error(
      "The server has write tools but no execute-style tool; granular create-tool sequencing is not yet implemented. Set an explicit execute tool name or use the plugin fallback."
    );
    err.capabilities = caps;
    throw err;
  }

  // Execute-style tools take the generated Figma-API script under `code`
  // (figma-console) — we also send `script` for servers that name it differently.
  const isExecute = chosen === caps.executeTool || /execute|run.?code|eval|script/i.test(chosen);
  const script = buildFigmaExecScript(spec);
  const args = isExecute ? { code: script, script, timeout: 20000 } : { spec, ...spec };

  const result = await mcp.callTool({ serverUrl, toolName: chosen, arguments: args });
  return {
    mode: "mcp",
    tool: chosen,
    capabilities: caps,
    text: `Created editable native Figma layers via MCP tool "${chosen}".\n${result.text || ""}`.trim()
  };
}
