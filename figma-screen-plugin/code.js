figma.showUI(__html__, { width: 400, height: 540, themeColors: true, title: "Node Studio Screen Builder" });

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
  node.fills = paint(hex(color, "FFFFFF"));
  return node;
}

async function build(spec) {
  const bg = hex(spec.background, "0B0B0B");
  const accent = hex(spec.accent, "FF8A4C");
  const frame = figma.createFrame();
  frame.name = spec.title || "Generated screen";
  frame.resize(1440, 1024);
  frame.fills = paint(bg);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.paddingTop = frame.paddingBottom = 80;
  frame.paddingLeft = frame.paddingRight = 88;
  frame.itemSpacing = 38;
  figma.currentPage.appendChild(frame);

  const eyebrow = await text(spec.eyebrow || "NODE STUDIO", 12, "9A9A9A", "Medium");
  eyebrow.letterSpacing = { value: 6, unit: "PIXELS" };
  frame.appendChild(eyebrow);
  const heading = await text(spec.title || "A new screen", 54, "FFFFFF", "Bold");
  heading.resize(1050, heading.height);
  frame.appendChild(heading);
  const subtitle = await text(spec.subtitle || "Generated natively in Figma.", 20, "B8B8B8");
  subtitle.resize(760, subtitle.height);
  subtitle.textAutoResize = "HEIGHT";
  frame.appendChild(subtitle);

  const cards = figma.createFrame();
  cards.name = "Content cards";
  cards.layoutMode = "HORIZONTAL";
  cards.primaryAxisSizingMode = "FIXED";
  cards.resize(1264, 380);
  cards.itemSpacing = 20;
  cards.fills = [];
  frame.appendChild(cards);
  for (const item of (spec.cards || []).slice(0, 4)) {
    const card = figma.createFrame();
    card.name = item.title || "Card";
    card.resize(Math.floor((1264 - 20 * ((spec.cards || []).length - 1)) / Math.min((spec.cards || []).length, 4)), 380);
    card.layoutMode = "VERTICAL";
    card.paddingTop = card.paddingBottom = 28;
    card.paddingLeft = card.paddingRight = 26;
    card.itemSpacing = 16;
    card.cornerRadius = 18;
    card.strokes = paint(hex("303030"));
    card.strokeWeight = 1;
    card.fills = paint(hex("151515"));
    cards.appendChild(card);
    const cardTitle = await text(item.title || "Feature", 22, "FFFFFF", "Bold"); card.appendChild(cardTitle);
    const body = await text(item.body || "Describe this feature.", 15, "B8B8B8"); body.resize(card.width - 52, body.height); body.textAutoResize = "HEIGHT"; card.appendChild(body);
    if (item.cta) {
      const button = figma.createFrame(); button.name = item.cta; button.layoutMode = "HORIZONTAL"; button.primaryAxisSizingMode = "AUTO"; button.counterAxisSizingMode = "AUTO"; button.paddingLeft = button.paddingRight = 16; button.paddingTop = button.paddingBottom = 10; button.cornerRadius = 8; button.fills = paint(accent); card.appendChild(button);
      const label = await text(item.cta, 13, "24140C", "Bold"); button.appendChild(label);
    }
  }
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
  figma.notify("Screen created in Figma");
}

figma.ui.onmessage = async (message) => {
  if (message.type === "create-screen") {
    try { await build(message.spec); figma.ui.postMessage({ type: "success" }); }
    catch (error) { figma.ui.postMessage({ type: "error", message: error.message || "Could not create screen" }); }
  }
  if (message.type === "close") figma.closePlugin();
};
