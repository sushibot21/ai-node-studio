// Node Studio Bridge — main thread. Receives redesign specs from the UI
// (which polls the Node Studio server) and builds native, editable Figma layers.
// Three modes:
//   1. build(spec)        — fresh wireframe from a spec (web audits)
//   2. buildFromSource(p) — clone + text/style patch (Figma design audits)
//   3. redesign(p)        — clone + Claude-generated Figma API script (full AI redesign)

figma.showUI(__html__, { width: 380, height: 460, themeColors: true, title: "Node Studio Bridge" });

const hex = (value, fallback) => {
  const s = String(value || fallback || "").replace("#", "");
  return { r: parseInt(s.slice(0, 2), 16) / 255 || 0, g: parseInt(s.slice(2, 4), 16) / 255 || 0, b: parseInt(s.slice(4, 6), 16) / 255 || 0 };
};
const paint = (color) => [{ type: "SOLID", color }];

// --- Helpers exposed to redesign scripts ------------------------------------

function findByText(root, text, opts) {
  const all = root.findAll((n) => n.type === "TEXT");
  const exact = opts && opts.exact;
  return all.filter((n) => {
    const c = n.characters || "";
    return exact ? c.trim() === text.trim() : c.indexOf(text) !== -1;
  });
}

function findByName(root, name, type) {
  return root.findAll((n) => {
    if (type && n.type !== type) return false;
    return (n.name || "").toLowerCase().includes(name.toLowerCase());
  });
}

function findByType(root, type) {
  return root.findAll((n) => n.type === type);
}

function getAncestor(node, levels) {
  let n = node;
  for (let i = 0; i < (levels || 1); i++) { if (n.parent) n = n.parent; }
  return n;
}

async function loadFont(family, style) {
  try { await figma.loadFontAsync({ family: family || "Inter", style: style || "Regular" }); } catch (e) {}
}

async function setText(node, text, opts) {
  if (!node || node.type !== "TEXT") return;
  const cur = node.characters;
  for (const f of node.getRangeAllFontNames(0, cur.length)) await figma.loadFontAsync(f);
  node.characters = text;
  if (opts) {
    if (opts.fontSize) node.fontSize = opts.fontSize;
    if (opts.color) node.fills = paint(hex(opts.color));
    if (opts.fontWeight) {
      try { node.fontName = { family: node.fontName.family, style: opts.fontWeight }; } catch (e) {}
    }
  }
}

function setFill(node, color) {
  if (!node) return;
  if (node.fills && node.fills.some && node.fills.some((f) => f.type === "IMAGE")) return;
  // Skip gradient fills — only replace solid fills or empty fills
  if (node.fills && node.fills.some && node.fills.some((f) => f.type === "GRADIENT_LINEAR" || f.type === "GRADIENT_RADIAL" || f.type === "GRADIENT_ANGULAR" || f.type === "GRADIENT_DIAMOND")) return;
  node.fills = paint(hex(color));
}

function setStroke(node, color, weight) {
  if (!node) return;
  // Strokes on TEXT nodes render as visible underlines/outlines on glyphs — never desired.
  // Redirect to the nearest ancestor frame instead so form-field affordance lands on the container.
  if (node.type === "TEXT") {
    let parent = node.parent;
    while (parent && parent.type !== "FRAME" && parent.type !== "COMPONENT" && parent.type !== "INSTANCE") {
      parent = parent.parent;
    }
    if (!parent) return;
    node = parent;
  }
  node.strokes = paint(hex(color));
  if (weight != null) node.strokeWeight = weight;
}

function setSpacing(node, opts) {
  if (!node) return;
  // Only allow padding changes on nodes that already have padding (auto-layout frames)
  // Never add padding where none existed — it inflates containers
  const hadPadding = (node.paddingTop || 0) + (node.paddingRight || 0) + (node.paddingBottom || 0) + (node.paddingLeft || 0) > 0;
  const maxPad = Math.min(node.width || 400, node.height || 400) * 0.25;
  const cap = (v) => Math.min(Math.max(0, v), maxPad);
  if (opts.itemSpacing != null) node.itemSpacing = Math.max(0, opts.itemSpacing);
  if (!hadPadding) return; // Don't add padding where there was none
  if (opts.padding != null) {
    const p = cap(opts.padding);
    node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = p;
  }
  if (opts.paddingTop != null) node.paddingTop = cap(opts.paddingTop);
  if (opts.paddingBottom != null) node.paddingBottom = cap(opts.paddingBottom);
  if (opts.paddingLeft != null) node.paddingLeft = cap(opts.paddingLeft);
  if (opts.paddingRight != null) node.paddingRight = cap(opts.paddingRight);
}

function setCornerRadius(node, radius) {
  if (!node) return;
  if (radius < 0 || radius > 100) return;
  node.cornerRadius = radius;
}

function setSize(node, w, h) {
  if (!node) return;
  // Never resize text nodes — use setText instead
  if (node.type === "TEXT") return;
  // Never resize image fills
  if (node.fills && node.fills.some && node.fills.some((f) => f.type === "IMAGE")) return;
  try {
    const parent = node.parent;
    if (parent && parent.width) w = Math.min(w, parent.width);
    if (parent && parent.height) h = Math.min(h, parent.height);
    // Skip if node is in auto-layout and HUG sizing — resize won't stick
    if (node.layoutSizingHorizontal === "HUG" || node.layoutSizingVertical === "HUG") return;
    node.resize(w, h);
  } catch (e) {}
}

function setOpacity(node, opacity) {
  if (!node) return;
  // Never fully invisible (0) and never above 1.
  // If model tries to zero out a node, floor at 0.15 so it's still visible
  // but very de-emphasized. Prevents "hide it" as a lazy fix.
  const clamped = Math.max(0.15, Math.min(1, opacity));
  node.opacity = clamped;
}

function setAutoLayout(node, opts) {
  if (!node) return;
  if (opts.mode) node.layoutMode = opts.mode;
  if (opts.spacing != null) node.itemSpacing = opts.spacing;
  if (opts.padding != null) {
    node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = opts.padding;
  }
  if (opts.align) {
    try { node.primaryAxisAlignItems = opts.align; } catch (e) {}
  }
  if (opts.crossAlign) {
    try { node.counterAxisAlignItems = opts.crossAlign; } catch (e) {}
  }
}

async function addAnnotation(parent, text, opts) {
  const o = opts || {};
  await loadFont("Inter", "Medium");

  const label = figma.createFrame();
  label.name = "Annotation: " + text.slice(0, 30);
  label.layoutMode = "HORIZONTAL";
  label.primaryAxisSizingMode = "AUTO";
  label.counterAxisSizingMode = "AUTO";
  label.paddingLeft = label.paddingRight = 10;
  label.paddingTop = label.paddingBottom = 6;
  label.cornerRadius = 6;
  label.fills = paint(hex(o.bg || "FFF2CC"));
  label.strokes = paint(hex(o.border || "E6BF4D"));
  label.strokeWeight = 1;

  const txt = figma.createText();
  txt.fontName = { family: "Inter", style: "Medium" };
  txt.characters = text;
  txt.fontSize = o.fontSize || 11;
  txt.fills = paint(hex(o.color || "4D3300"));
  label.appendChild(txt);

  if (parent) {
    parent.appendChild(label);
  } else {
    figma.currentPage.appendChild(label);
  }
  return label;
}

function scanTree(node, depth) {
  if (!node) return null;
  const d = depth || 0;
  const info = { id: node.id, name: node.name, type: node.type };
  if (node.type === "TEXT") info.text = (node.characters || "").slice(0, 100);
  const box = node.absoluteBoundingBox;
  if (box) info.bounds = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
  if (node.fills && node.fills.length) {
    const f = node.fills[0];
    if (f.type === "SOLID" && f.color) info.fill = { r: Math.round(f.color.r * 255), g: Math.round(f.color.g * 255), b: Math.round(f.color.b * 255) };
  }
  if (node.layoutMode) info.layout = node.layoutMode;
  if (node.itemSpacing) info.spacing = node.itemSpacing;
  if (node.cornerRadius) info.radius = node.cornerRadius;
  if (d < 4 && node.children && node.children.length) {
    info.children = node.children.map((c) => scanTree(c, d + 1));
  }
  return info;
}

// --- Build modes ------------------------------------------------------------

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

// PATCH path: clone + targeted text/style edits
async function buildFromSource(p) {
  await figma.loadAllPagesAsync();
  const src = await figma.getNodeByIdAsync(p.sourceNodeId);
  if (!src) throw new Error("Source design node not found: " + p.sourceNodeId);
  if (typeof src.clone !== "function") throw new Error("This node type can't be cloned (" + src.type + ")");
  const clone = src.clone();
  clone.name = p.screenName || (src.name + " — Redesign");
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
    const e = edits.find((x) => matches(cur, x.find));
    if (e) {
      try {
        for (const f of t.getRangeAllFontNames(0, cur.length)) await figma.loadFontAsync(f);
        const cleanText = (e.replace || "").replace(/\s*\[.*?\]\s*$/g, "").replace(/\s*\[Resolves[^\]]*\]/g, "").trim();
        t.characters = cur === e.find || cur.trim() === e.find.trim() ? cleanText : cur.split(e.find).join(cleanText);
        applied++;
      } catch (err) { /* skip */ }
    }
    const s = styleEdits.find((x) => matches(cur, x.find));
    if (s && s.color) {
      try { t.fills = [{ type: "SOLID", color: hex(s.color, "111111") }]; applied++; } catch (err) { /* skip */ }
    }
  }

  try { figma.currentPage.selection = [clone]; figma.viewport.scrollAndZoomIntoView([clone]); } catch (e) {}
  return { frameId: clone.id, frameName: clone.name, edits: applied };
}

// REDESIGN path: clone + execute Claude-generated Figma API script for full
// structural/visual/content changes. The script has access to helper functions
// (findByText, findByName, setText, setFill, setSpacing, addAnnotation, etc.)
// and receives the clone as `target`.
async function redesign(p) {
  await figma.loadAllPagesAsync();

  for (const f of [
    { family: "Inter", style: "Regular" }, { family: "Inter", style: "Medium" },
    { family: "Inter", style: "Bold" }, { family: "Inter", style: "SemiBold" }
  ]) { try { await figma.loadFontAsync(f); } catch (e) {} }

  const src = await figma.getNodeByIdAsync(p.sourceNodeId);
  if (!src) throw new Error("Source node not found: " + p.sourceNodeId);
  if (typeof src.clone !== "function") throw new Error("Can't clone " + src.type);

  const clone = src.clone();
  clone.name = p.screenName || (src.name + " — AI Redesign");
  let maxX = 0;
  for (const n of figma.currentPage.children) { if ("x" in n && "width" in n) maxX = Math.max(maxX, n.x + n.width); }
  try { clone.x = maxX + 200; clone.y = ("y" in src ? src.y : 0); } catch (e) {}
  if (clone.parent !== figma.currentPage) figma.currentPage.appendChild(clone);

  // Snapshot original dimensions before any operations
  const origW = clone.width;
  const origH = clone.height;
  const childSnap = new Map();
  function snapChildren(frame, depth) {
    if (!frame.children || depth > 3) return;
    for (const c of frame.children) {
      childSnap.set(c.id, { w: c.width, h: c.height });
      if (c.children) snapChildren(c, depth + 1);
    }
  }
  snapChildren(clone, 0);

  const annotGroup = figma.createFrame();
  annotGroup.name = "UX Annotations";
  annotGroup.fills = [];
  annotGroup.layoutMode = "VERTICAL";
  annotGroup.primaryAxisSizingMode = "AUTO";
  annotGroup.counterAxisSizingMode = "AUTO";
  annotGroup.itemSpacing = 6;
  annotGroup.paddingLeft = annotGroup.paddingRight = 12;
  annotGroup.paddingTop = annotGroup.paddingBottom = 12;

  const ops = p.operations || [];
  let applied = 0;
  const errors = [];
  let debugSkipped = 0;

  // Verify clone has text nodes
  const allTexts = clone.findAll((n) => n.type === "TEXT");
  const debugInfo = { totalTextNodes: allTexts.length, totalOps: ops.length, sampleTexts: allTexts.slice(0, 3).map((n) => (n.characters || "").slice(0, 40)) };

  for (const op of ops) {
    try {
      let nodes = [];
      if (op.selector) {
        const sel = op.selector;
        if (sel.text) nodes = findByText(clone, sel.text, { exact: sel.exact });
        else if (sel.name) nodes = findByName(clone, sel.name, sel.type);
        else if (sel.type) nodes = findByType(clone, sel.type);

        if (sel.index != null) nodes = nodes[sel.index] ? [nodes[sel.index]] : [];
        if (sel.parent) nodes = nodes.map((n) => getAncestor(n, sel.parent));
        nodes = nodes.filter(Boolean);
      }

      if (!nodes.length && op.action !== "addAnnotation") { debugSkipped++; continue; }

      for (const node of nodes) {
        switch (op.action) {
          case "setText":
            await setText(node, op.value, op.opts);
            applied++;
            break;
          case "setFill":
            setFill(node, op.value);
            applied++;
            break;
          case "setStroke":
            setStroke(node, op.value, op.weight);
            applied++;
            break;
          case "setSpacing":
            setSpacing(node, op.value);
            applied++;
            break;
          case "setCornerRadius":
            setCornerRadius(node, op.value);
            applied++;
            break;
          case "setSize":
            setSize(node, op.value.w, op.value.h);
            applied++;
            break;
          case "setOpacity":
            setOpacity(node, op.value);
            applied++;
            break;
          case "setAutoLayout":
            setAutoLayout(node, op.value);
            applied++;
            break;
          case "remove":
            try { node.remove(); applied++; } catch (e) {}
            break;
          case "reorder":
            try {
              const parent = node.parent;
              if (parent && op.value === "front") parent.appendChild(node);
              else if (parent && op.value === "back") parent.insertChild(0, node);
              applied++;
            } catch (e) {}
            break;
          case "cloneAndAppend":
            // Deep-clone the selected node and append to parent (or targetParent).
            // Use for duplicating cards, chips, list items.
            try {
              const dup = node.clone();
              if (op.value?.name) dup.name = op.value.name;
              if (op.value?.replaceText && dup.type === "TEXT") {
                for (const f of dup.getRangeAllFontNames(0, dup.characters.length)) await figma.loadFontAsync(f);
                dup.characters = op.value.replaceText;
              }
              const targetParent = op.value?.targetParent ? findByName(clone, op.value.targetParent)[0] : node.parent;
              if (targetParent && "appendChild" in targetParent) targetParent.appendChild(dup);
              applied++;
            } catch (e) { errors.push("cloneAndAppend: " + e.message); }
            break;
          case "insertSection":
            // Add a new labeled section frame beside/after the target.
            // value: { title, subtitle?, kind: "card"|"chip-row"|"hero", items?: [] }
            try {
              await loadFont("Inter", "Regular");
              await loadFont("Inter", "Bold");
              const section = figma.createFrame();
              section.name = op.value?.title || "New Section";
              section.layoutMode = "VERTICAL";
              section.primaryAxisSizingMode = "AUTO";
              section.counterAxisSizingMode = "AUTO";
              section.itemSpacing = 12;
              section.paddingLeft = section.paddingRight = 20;
              section.paddingTop = section.paddingBottom = 20;
              section.cornerRadius = 12;
              section.fills = paint(hex(op.value?.bg || "F7F9FA"));
              if (op.value?.title) {
                const title = figma.createText();
                title.fontName = { family: "Inter", style: "Bold" };
                title.characters = op.value.title;
                title.fontSize = 18;
                title.fills = paint(hex(op.value?.titleColor || "1A2B85"));
                section.appendChild(title);
              }
              if (op.value?.subtitle) {
                const sub = figma.createText();
                sub.fontName = { family: "Inter", style: "Regular" };
                sub.characters = op.value.subtitle;
                sub.fontSize = 13;
                sub.fills = paint(hex("6B7280"));
                section.appendChild(sub);
              }
              // Optional: build item chips inline
              if (Array.isArray(op.value?.items)) {
                const row = figma.createFrame();
                row.name = "Items";
                row.layoutMode = "HORIZONTAL";
                row.primaryAxisSizingMode = "AUTO";
                row.counterAxisSizingMode = "AUTO";
                row.itemSpacing = 12;
                row.fills = [];
                for (const item of op.value.items.slice(0, 6)) {
                  const chip = figma.createFrame();
                  chip.name = "Chip";
                  chip.layoutMode = "HORIZONTAL";
                  chip.primaryAxisSizingMode = "AUTO";
                  chip.counterAxisSizingMode = "AUTO";
                  chip.paddingLeft = chip.paddingRight = 16;
                  chip.paddingTop = chip.paddingBottom = 10;
                  chip.cornerRadius = 20;
                  chip.fills = paint(hex(op.value?.chipBg || "FFFFFF"));
                  chip.strokes = paint(hex("E5E7EB"));
                  chip.strokeWeight = 1;
                  const t = figma.createText();
                  t.fontName = { family: "Inter", style: "Regular" };
                  t.characters = String(item);
                  t.fontSize = 13;
                  t.fills = paint(hex("1A2B85"));
                  chip.appendChild(t);
                  row.appendChild(chip);
                }
                section.appendChild(row);
              }
              // Append to target parent frame
              const targetParent = op.value?.targetParent ? findByName(clone, op.value.targetParent)[0] : node;
              if (targetParent && "appendChild" in targetParent) targetParent.appendChild(section);
              applied++;
            } catch (e) { errors.push("insertSection: " + e.message); }
            break;
        }
      }

      if (op.action === "addAnnotation") {
        await addAnnotation(annotGroup, op.value, op.opts);
        applied++;
      }
    } catch (err) {
      errors.push((op.action || "?") + ": " + (err.message || err));
    }
  }

  // Restore original dimensions — operations can expand auto-layout frames
  // Process deepest children first so inner frames shrink before parents
  function restoreChildren(frame, depth) {
    if (!frame.children || depth > 3) return;
    for (const c of frame.children) {
      if (c.children) restoreChildren(c, depth + 1);
      const snap = childSnap.get(c.id);
      if (snap) {
        try {
          const newW = c.width > snap.w ? snap.w : c.width;
          const newH = c.height > snap.h ? snap.h : c.height;
          if (newW !== c.width || newH !== c.height) c.resizeWithoutConstraints(newW, newH);
        } catch (e) {}
      }
    }
  }
  restoreChildren(clone, 0);
  try { clone.resizeWithoutConstraints(origW, origH); } catch (e) {}

  try {
    annotGroup.x = clone.x + clone.width + 40;
    annotGroup.y = clone.y;
  } catch (e) {}
  if (annotGroup.children.length === 0) {
    annotGroup.remove();
  } else {
    figma.currentPage.appendChild(annotGroup);
  }

  try { figma.currentPage.selection = [clone]; figma.viewport.scrollAndZoomIntoView([clone]); } catch (e) {}
  return { frameId: clone.id, frameName: clone.name, applied, skipped: debugSkipped, debug: debugInfo, errors: errors.length ? errors.slice(0, 10) : undefined };
}

// SCAN: return the clone's node tree so server can feed it to Claude
async function scan(p) {
  await figma.loadAllPagesAsync();
  const node = await figma.getNodeByIdAsync(p.nodeId);
  if (!node) throw new Error("Node not found: " + p.nodeId);
  const tree = scanTree(node, 0);
  return { tree };
}

// --- Message handler --------------------------------------------------------

figma.ui.onmessage = async (msg) => {
  if (msg.type === "build") {
    try {
      const p = msg.payload || {};
      let result;
      if (p.mode === "redesign" && p.operations) {
        result = await redesign(p);
      } else if (p.sourceNodeId && !p.operations) {
        result = await buildFromSource(p);
      } else {
        result = await build(p.spec || p);
      }
      figma.ui.postMessage({ type: "built", jobId: msg.jobId, ok: true, ...result });
      figma.notify("Node Studio: redesign created (" + (result.applied || result.edits || 0) + " changes)");
    } catch (error) {
      figma.ui.postMessage({ type: "built", jobId: msg.jobId, ok: false, error: (error && error.message) || "Build failed" });
      figma.notify("Node Studio: build failed — " + ((error && error.message) || ""), { error: true });
    }
  }
  if (msg.type === "scan") {
    try {
      const result = await scan(msg.payload || {});
      figma.ui.postMessage({ type: "scanned", jobId: msg.jobId, ok: true, ...result });
    } catch (error) {
      figma.ui.postMessage({ type: "scanned", jobId: msg.jobId, ok: false, error: (error && error.message) || "Scan failed" });
    }
  }
  if (msg.type === "close") figma.closePlugin();
};
