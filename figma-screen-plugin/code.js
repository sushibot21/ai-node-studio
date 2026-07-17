figma.showUI(__html__, { width: 400, height: 560, themeColors: true, title: "Node Studio Screen Builder" });

const paint = (color) => [{ type: "SOLID", color }];
const hex = (value, fallback) => {
  const source = (value || fallback).replace("#", "");
  return { r: parseInt(source.slice(0, 2), 16) / 255, g: parseInt(source.slice(2, 4), 16) / 255, b: parseInt(source.slice(4, 6), 16) / 255 };
};

async function text(content, size, color, weight = "Regular") {
  await figma.loadFontAsync({ family: "Inter", style: weight });
  const node = figma.createText();
  node.fontName = { family: "Inter", style: weight };
  node.characters = content;
  node.fontSize = size;
  node.fills = paint(color);
  return node;
}

// Colour variables make the redesign themeable + editable (change once, update
// everywhere). Wrapped defensively: on older API versions we fall back to raw
// fills so the plugin still produces editable layers.
function createColorVariables(spec) {
  const vars = {};
  try {
    const collection = figma.variables.createVariableCollection("Redesign Tokens");
    const modeId = collection.modes[0].modeId;
    const defs = {
      background: hex(spec.background, "0B0B0B"),
      surface: hex("151515"),
      accent: hex(spec.accent, "FF8A4C"),
      text: hex("FFFFFF"),
      textDim: hex("B8B8B8"),
      border: hex("303030")
    };
    for (const [name, value] of Object.entries(defs)) {
      const variable = figma.variables.createVariable(name, collection, "COLOR");
      variable.setValueForMode(modeId, value);
      vars[name] = variable;
    }
  } catch (e) {
    // Variables unavailable — callers fall back to hex fills.
  }
  return vars;
}

// Fill helper that binds to a variable when available, else uses a hex fill.
function fill(node, vars, name, fallbackHex) {
  const color = hex(fallbackHex, fallbackHex);
  if (vars[name] && figma.variables?.setBoundVariableForPaint) {
    try {
      node.fills = [figma.variables.setBoundVariableForPaint({ type: "SOLID", color }, "color", vars[name])];
      return;
    } catch (e) {
      /* fall through */
    }
  }
  node.fills = paint(color);
}

// Reusable Card component (nested Button component inside). Returns the master;
// callers create instances so the design uses real, editable components.
async function buildCardComponent(vars, buttonComponent) {
  const card = figma.createComponent();
  card.name = "Redesign / Card";
  card.resize(360, 300);
  card.layoutMode = "VERTICAL";
  card.primaryAxisSizingMode = "AUTO";
  card.counterAxisSizingMode = "FIXED";
  card.paddingTop = card.paddingBottom = 28;
  card.paddingLeft = card.paddingRight = 26;
  card.itemSpacing = 14;
  card.cornerRadius = 18;
  card.strokeWeight = 1;
  fill(card, vars, "surface", "151515");
  card.strokes = paint(hex("303030"));

  const title = await text("Feature", 22, hex("FFFFFF"), "Bold");
  title.layoutSizingHorizontal = "FILL";
  card.appendChild(title);
  const body = await text("Describe this improvement.", 15, hex("B8B8B8"));
  body.layoutSizingHorizontal = "FILL";
  body.textAutoResize = "HEIGHT";
  card.appendChild(body);

  const button = buttonComponent.createInstance();
  card.appendChild(button);
  return card;
}

// Reusable Button component.
async function buildButtonComponent(vars, accentHex) {
  const button = figma.createComponent();
  button.name = "Redesign / Button";
  button.layoutMode = "HORIZONTAL";
  button.primaryAxisSizingMode = "AUTO";
  button.counterAxisSizingMode = "AUTO";
  button.paddingLeft = button.paddingRight = 18;
  button.paddingTop = button.paddingBottom = 11;
  button.cornerRadius = 8;
  fill(button, vars, "accent", accentHex);
  const label = await text("Action", 13, hex("20120B"), "Bold");
  button.appendChild(label);
  return button;
}

async function build(spec) {
  const vars = createColorVariables(spec);
  const accentHex = (spec.accent || "FF8A4C").replace("#", "");

  // Component masters live off-canvas so the layout uses instances only.
  const buttonComponent = await buildButtonComponent(vars, accentHex);
  const cardComponent = await buildCardComponent(vars, buttonComponent);
  buttonComponent.x = -600; buttonComponent.y = 1200;
  cardComponent.x = -200; cardComponent.y = 1200;
  figma.currentPage.appendChild(buttonComponent);
  figma.currentPage.appendChild(cardComponent);

  const frame = figma.createFrame();
  frame.name = spec.title || "Redesigned screen";
  frame.resize(1440, 1024);
  fill(frame, vars, "background", spec.background || "0B0B0B");
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.paddingTop = frame.paddingBottom = 72;
  frame.paddingLeft = frame.paddingRight = 88;
  frame.itemSpacing = 34;
  figma.currentPage.appendChild(frame);

  const eyebrow = await text(spec.eyebrow || "NODE STUDIO", 12, hex("9A9A9A"), "Medium");
  eyebrow.letterSpacing = { value: 6, unit: "PIXELS" };
  frame.appendChild(eyebrow);
  const heading = await text(spec.title || "A new screen", 52, hex("FFFFFF"), "Bold");
  heading.layoutSizingHorizontal = "FILL";
  heading.textAutoResize = "HEIGHT";
  frame.appendChild(heading);
  const subtitle = await text(spec.subtitle || "Generated natively in Figma.", 20, hex("B8B8B8"));
  subtitle.layoutSizingHorizontal = "FILL";
  subtitle.textAutoResize = "HEIGHT";
  frame.appendChild(subtitle);

  // Content row: cards (fill) + optional audit-improvements panel (fixed).
  const row = figma.createFrame();
  row.name = "Content";
  row.layoutMode = "HORIZONTAL";
  row.itemSpacing = 20;
  row.fills = [];
  frame.appendChild(row);
  row.layoutSizingHorizontal = "FILL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";

  const cards = figma.createFrame();
  cards.name = "Cards";
  cards.layoutMode = "HORIZONTAL";
  cards.itemSpacing = 20;
  cards.fills = [];
  row.appendChild(cards);
  cards.layoutSizingHorizontal = "FILL";
  cards.counterAxisSizingMode = "AUTO";

  const items = (spec.cards || []).slice(0, 4);
  for (const item of items.length ? items : [{ title: "Section" }]) {
    const instance = cardComponent.createInstance();
    cards.appendChild(instance);
    instance.layoutSizingHorizontal = "FILL";
    // Edit the instance's text/CTA (instances stay linked to the master).
    const title = instance.findOne((n) => n.type === "TEXT" && n.fontSize === 22);
    const body = instance.findOne((n) => n.type === "TEXT" && n.fontSize === 15);
    const button = instance.findOne((n) => n.type === "INSTANCE");
    if (title) title.characters = item.title || "Section";
    if (body) body.characters = item.body || "Describe this improvement.";
    if (button) {
      if (item.cta) {
        const label = button.findOne((n) => n.type === "TEXT");
        if (label) label.characters = item.cta;
      } else {
        button.visible = false;
      }
    }
  }

  const improvements = (spec.improvements || []).slice(0, 8);
  if (improvements.length) {
    const panel = figma.createFrame();
    panel.name = "UX improvements applied";
    panel.layoutMode = "VERTICAL";
    panel.resize(320, 300);
    panel.counterAxisSizingMode = "FIXED";
    panel.primaryAxisSizingMode = "AUTO";
    panel.paddingTop = panel.paddingBottom = 24;
    panel.paddingLeft = panel.paddingRight = 22;
    panel.itemSpacing = 12;
    panel.cornerRadius = 18;
    fill(panel, vars, "surface", "151515");
    panel.strokes = paint(hex("303030"));
    panel.strokeWeight = 1;
    row.appendChild(panel);
    const heading = await text("UX fixes applied", 14, hex("FFFFFF"), "Bold");
    panel.appendChild(heading);
    for (const fixText of improvements) {
      const line = await text(`• ${fixText}`, 13, hex("B8B8B8"));
      line.layoutSizingHorizontal = "FILL";
      line.textAutoResize = "HEIGHT";
      panel.appendChild(line);
    }
  }

  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
  figma.notify("Redesign created with editable components + variables");
}

figma.ui.onmessage = async (message) => {
  if (message.type === "create-screen") {
    try { await build(message.spec); figma.ui.postMessage({ type: "success" }); }
    catch (error) { figma.ui.postMessage({ type: "error", message: error.message || "Could not create screen" }); }
  }
  if (message.type === "close") figma.closePlugin();
};
