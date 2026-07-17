// Node Studio Bridge — main thread. Receives redesign specs relayed from the UI
// (which polls the Node Studio server) and builds native, editable Figma layers:
// frames with Auto Layout, colour Variables, a reusable Button component, text,
// and per-section "Resolves Fxxx" captions tying the redesign to the audit.
// Same renderer as the server's figmaMcp builder — kept in sync by shape.

figma.showUI(__html__, { width: 380, height: 460, themeColors: true, title: "Node Studio Bridge" });

const hex = (value, fallback) => {
  const s = String(value || fallback || "").replace("#", "");
  return { r: parseInt(s.slice(0, 2), 16) / 255 || 0, g: parseInt(s.slice(2, 4), 16) / 255 || 0, b: parseInt(s.slice(4, 6), 16) / 255 || 0 };
};
const paint = (color) => [{ type: "SOLID", color }];

async function build(spec) {
  for (const f of [{ family: "Inter", style: "Regular" }, { family: "Inter", style: "Medium" }, { family: "Inter", style: "Bold" }]) {
    try { await figma.loadFontAsync(f); } catch (e) {}
  }
  const T = spec.tokens || { bg: spec.background || "0B0B0B", surface: "16181D", accent: spec.accent || "2874F0", text: "FFFFFF", textDim: "B8C0CC", border: "2A2E37", success: "3DD68C" };
  const lum = (h) => { const c = hex(h); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; };
  const onAccent = lum(T.accent) > 0.6 ? "111111" : "FFFFFF";

  const vars = {};
  try {
    const col = figma.variables.createVariableCollection("Redesign Tokens");
    const mode = col.modes[0].modeId;
    for (const [n, v] of Object.entries(T)) { const vv = figma.variables.createVariable(n, col, "COLOR"); vv.setValueForMode(mode, hex(v)); vars[n] = vv; }
  } catch (e) {}
  const fill = (node, name) => {
    const color = hex(T[name]);
    try { if (vars[name] && figma.variables && figma.variables.setBoundVariableForPaint) { node.fills = [figma.variables.setBoundVariableForPaint({ type: "SOLID", color }, "color", vars[name])]; return; } } catch (e) {}
    node.fills = paint(color);
  };
  const mk = async (t, size, color, weight) => {
    const n = figma.createText();
    try { n.fontName = { family: "Inter", style: weight || "Regular" }; } catch (e) {}
    n.characters = String(t == null ? "" : t); n.fontSize = size; n.fills = paint(hex(color, "FFFFFF"));
    return n;
  };
  const fillW = (n) => { try { n.layoutSizingHorizontal = "FILL"; } catch (e) {} };

  const button = figma.createComponent();
  button.name = "Redesign / Button";
  button.layoutMode = "HORIZONTAL"; button.primaryAxisSizingMode = "AUTO"; button.counterAxisSizingMode = "AUTO";
  button.paddingLeft = button.paddingRight = 20; button.paddingTop = button.paddingBottom = 14; button.cornerRadius = 10;
  fill(button, "accent"); button.appendChild(await mk("Action", 15, onAccent, "Bold")); button.x = -1400; button.y = 3000;

  const isMobile = (spec.platform || "mobile") !== "desktop";
  const W = isMobile ? 480 : 1200;
  const frame = figma.createFrame();
  frame.name = spec.screenName || spec.title || "Redesigned screen";
  frame.resize(W, 200); fill(frame, "bg");
  frame.layoutMode = "VERTICAL"; frame.primaryAxisSizingMode = "AUTO"; frame.counterAxisSizingMode = "FIXED"; frame.itemSpacing = 0;

  const mkSec = (name, surface, gap) => {
    const s = figma.createFrame(); s.name = name;
    s.layoutMode = "VERTICAL"; s.primaryAxisSizingMode = "AUTO"; s.counterAxisSizingMode = "FIXED";
    s.itemSpacing = gap == null ? 10 : gap; s.paddingLeft = s.paddingRight = isMobile ? 24 : 40; s.paddingTop = s.paddingBottom = 22;
    if (surface) { fill(s, "surface"); } else { s.fills = []; }
    frame.appendChild(s); fillW(s); return s;
  };
  const add = async (p, t, size, c, w) => { const n = await mk(t, size, c, w); n.textAutoResize = "HEIGHT"; p.appendChild(n); fillW(n); return n; };
  const cap = async (p, r) => { if (r && r.length) await add(p, "✓ Resolves " + r.join(", "), 11, T.accent, "Medium"); };
  const btn = async (p, label) => { const b = button.createInstance(); p.appendChild(b); const l = b.findOne((n) => n.type === "TEXT"); if (l) l.characters = label || "Action"; return b; };

  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  const header = mkSec("Header", false, 6);
  await add(header, spec.productPurpose ? "PURPOSE — " + spec.productPurpose : "REDESIGN", 11, T.textDim, "Medium");
  await add(header, spec.screenName || spec.title || "Redesigned screen", isMobile ? 24 : 34, T.text, "Bold");
  if (spec.designRationale) await add(header, spec.designRationale, 13, T.textDim, "Regular");
  const resolvedAll = spec.findingsResolved || [...new Set(sections.flatMap((s) => s.resolves || []))];
  if (resolvedAll.length) await add(header, "Findings resolved: " + resolvedAll.join(", "), 11, T.accent, "Medium");

  if (sections.length) {
    for (const sec of sections.slice(0, 12)) {
      const type = sec.type || "content";
      const surface = ["priceCta", "trust", "form", "media", "banner"].indexOf(type) >= 0;
      const s = mkSec((type + " " + (sec.title || "")).trim(), surface, 10);
      if (sec.title) await add(s, sec.title, type === "hero" ? (isMobile ? 26 : 40) : 18, T.text, "Bold");
      if (sec.subtitle) await add(s, sec.subtitle, 14, T.textDim, "Regular");
      if (type === "nav") {
        const row = figma.createFrame(); row.name = "Nav"; row.layoutMode = "HORIZONTAL"; row.itemSpacing = 16; try { row.counterAxisAlignItems = "CENTER"; } catch (e) {} row.fills = []; s.appendChild(row); fillW(row);
        for (const it of (sec.items || [])) row.appendChild(await mk(it.label || it, 13, T.text, "Medium"));
        if (sec.cta) await btn(row, sec.cta.label);
      } else if (type === "media") {
        const r = figma.createFrame(); r.name = "Media"; r.resize(W - 80, isMobile ? 240 : 340); r.cornerRadius = 14; fill(r, "border"); r.layoutMode = "VERTICAL"; try { r.primaryAxisAlignItems = "CENTER"; r.counterAxisAlignItems = "CENTER"; } catch (e) {} s.appendChild(r); fillW(r);
        r.appendChild(await mk("Media (editable placeholder)", 12, T.textDim, "Regular"));
        if (sec.cta) await btn(s, sec.cta.label);
      } else if (type === "priceCta") {
        if (sec.price) await add(s, sec.price, 26, T.text, "Bold");
        await btn(s, (sec.cta && sec.cta.label) || "Add to Cart");
      } else if (type === "form") {
        for (const f of (sec.fields || [])) { await add(s, f.label || "Field", 12, T.textDim, "Medium"); const inp = figma.createFrame(); inp.name = "Input"; inp.resize(W - 80, 46); inp.cornerRadius = 8; inp.strokeWeight = 1; inp.strokes = paint(hex(T.border)); inp.fills = []; s.appendChild(inp); fillW(inp); }
        for (const b of (sec.badges || [])) await add(s, b.label || b, 12, T.textDim, "Regular");
        if (sec.cta) await btn(s, sec.cta.label);
      } else if (type === "trust") {
        const row = figma.createFrame(); row.name = "Trust"; row.layoutMode = "HORIZONTAL"; row.itemSpacing = 8; try { row.layoutWrap = "WRAP"; } catch (e) {} row.fills = []; s.appendChild(row); fillW(row);
        for (const b of (sec.badges || sec.items || [])) { const chip = figma.createFrame(); chip.layoutMode = "HORIZONTAL"; chip.primaryAxisSizingMode = "AUTO"; chip.counterAxisSizingMode = "AUTO"; chip.paddingLeft = chip.paddingRight = 12; chip.paddingTop = chip.paddingBottom = 7; chip.cornerRadius = 99; chip.strokeWeight = 1; chip.strokes = paint(hex(T.border)); chip.fills = []; row.appendChild(chip); chip.appendChild(await mk(b.label || b, 12, T.text, "Medium")); }
        if (sec.cta) await btn(s, sec.cta.label);
      } else if (type === "list") {
        for (const it of (sec.items || [])) await add(s, "• " + (it.label || it), 13, T.textDim, "Regular");
        if (sec.cta) await btn(s, sec.cta.label);
      } else {
        if (sec.body) await add(s, sec.body, 14, T.textDim, "Regular");
        for (const it of (sec.items || [])) await add(s, "• " + (it.label || it), 13, T.textDim, "Regular");
        if (sec.cta) await btn(s, sec.cta.label);
      }
      await cap(s, sec.resolves);
    }
  } else {
    const body = mkSec("Content", false, 16);
    for (const item of (spec.cards || []).slice(0, 4)) {
      const c = figma.createFrame(); c.name = item.title || "Card"; c.layoutMode = "VERTICAL"; c.primaryAxisSizingMode = "AUTO"; c.counterAxisSizingMode = "FIXED"; c.paddingLeft = c.paddingRight = 20; c.paddingTop = c.paddingBottom = 20; c.itemSpacing = 10; c.cornerRadius = 14; c.strokeWeight = 1; c.strokes = paint(hex(T.border)); fill(c, "surface"); body.appendChild(c); fillW(c);
      await add(c, item.title || "Section", 18, T.text, "Bold");
      if (item.body) await add(c, item.body, 14, T.textDim, "Regular");
      if (item.cta) await btn(c, item.cta);
    }
  }

  let section;
  try { section = figma.createSection(); section.name = "Node Studio — " + (spec.screenName || "UX Redesign"); } catch (e) { section = null; }
  if (section) {
    // Place to the right of existing content so it never overlaps the current file.
    let maxX = 0;
    for (const n of figma.currentPage.children) { if ("x" in n && "width" in n) maxX = Math.max(maxX, n.x + n.width); }
    section.appendChild(frame);
    try { section.x = maxX + 200; section.y = 0; section.resizeWithoutConstraints(W + 200, frame.height + 160); } catch (e) {}
  } else {
    figma.currentPage.appendChild(frame);
  }
  try { figma.currentPage.selection = [frame]; figma.viewport.scrollAndZoomIntoView([frame]); } catch (e) {}
  return { frameId: frame.id, frameName: frame.name, sections: sections.length, variables: Object.keys(vars).length };
}

// HIGH-FIDELITY path: clone the audited design and apply Claude's targeted
// content fixes (real copy, typo fixes, better CTAs) in place — the result is
// the original design, on brand, with the audit's issues corrected.
async function buildFromSource(p) {
  await figma.loadAllPagesAsync();
  const src = await figma.getNodeByIdAsync(p.sourceNodeId);
  if (!src) throw new Error("Source design node not found: " + p.sourceNodeId);
  if (typeof src.clone !== "function") throw new Error("This node type can't be cloned (" + src.type + ")");
  const clone = src.clone();
  clone.name = p.screenName || (src.name + " — Redesign");
  // Place to the right of existing page content so nothing overlaps.
  let maxX = 0;
  for (const n of figma.currentPage.children) { if ("x" in n && "width" in n) maxX = Math.max(maxX, n.x + n.width); }
  try { clone.x = maxX + 200; clone.y = ("y" in src ? src.y : 0); } catch (e) {}
  if (clone.parent !== figma.currentPage) figma.currentPage.appendChild(clone);

  const texts = clone.findAllWithCriteria ? clone.findAllWithCriteria({ types: ["TEXT"] }) : clone.findAll((n) => n.type === "TEXT");
  const edits = p.textEdits || [];
  const styleEdits = p.styleEdits || [];
  const matches = (cur, find) => find && (cur === find || cur.trim() === find.trim() || cur.indexOf(find) !== -1);
  let applied = 0;
  for (const t of texts) {
    const cur = t.characters;
    // Content fix
    const e = edits.find((x) => matches(cur, x.find));
    if (e) {
      try {
        for (const f of t.getRangeAllFontNames(0, cur.length)) await figma.loadFontAsync(f);
        t.characters = cur === e.find || cur.trim() === e.find.trim() ? e.replace : cur.split(e.find).join(e.replace);
        applied++;
      } catch (err) { /* skip */ }
    }
    // Visual fix (recolor for contrast / CTA emphasis)
    const s = styleEdits.find((x) => matches(cur, x.find));
    if (s && s.color) {
      try { t.fills = [{ type: "SOLID", color: hex(s.color, "111111") }]; applied++; } catch (err) { /* skip */ }
    }
  }
  try { figma.currentPage.selection = [clone]; figma.viewport.scrollAndZoomIntoView([clone]); } catch (e) {}
  return { frameId: clone.id, frameName: clone.name, edits: applied };
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "build") {
    try {
      const p = msg.payload || {};
      const result = p.sourceNodeId ? await buildFromSource(p) : await build(p.spec || p);
      figma.ui.postMessage({ type: "built", jobId: msg.jobId, ok: true, ...result });
      figma.notify("Node Studio: redesign created");
    } catch (error) {
      figma.ui.postMessage({ type: "built", jobId: msg.jobId, ok: false, error: (error && error.message) || "Build failed" });
      figma.notify("Node Studio: build failed — " + ((error && error.message) || ""), { error: true });
    }
  }
  if (msg.type === "close") figma.closePlugin();
};
