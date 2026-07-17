// Captures a Figma DESIGN node (not a web page) into the same PageContext shape
// the pipeline uses. Uses the Figma REST API: renders the node to a PNG (for the
// vision analysis + report) and reads its layer tree for real content, headings,
// and element regions (for the annotated screenshot). Requires FIGMA_TOKEN.

function parseFigmaLink(link) {
  const key = (link.match(/figma\.com\/(?:file|design|board)\/([A-Za-z0-9]+)/i) || [])[1];
  const rawNode = (link.match(/node-id=([0-9]+[-:][0-9]+)/i) || [])[1];
  const nodeId = rawNode ? rawNode.replace("-", ":") : null;
  return { key, nodeId };
}

const fontToLevel = (size) => (size >= 40 ? 1 : size >= 28 ? 2 : size >= 20 ? 3 : 4);

// Walks the node subtree collecting text, structure, and element regions.
function walk(node, origin, acc) {
  if (!node) return;
  const box = node.absoluteBoundingBox;
  const rel = box && origin ? { x: Math.round(box.x - origin.x), y: Math.round(box.y - origin.y), w: Math.round(box.width), h: Math.round(box.height) } : null;
  if (node.type === "TEXT" && node.characters) {
    const size = node.style?.fontSize || 12;
    acc.texts.push({ text: node.characters.replace(/\s+/g, " ").trim(), size });
    const isCta = /button|btn|cta|sign ?up|log ?in|subscribe|book|find out|get|apply|start|shop|buy/i.test(node.name + " " + node.characters) && node.characters.length < 40;
    if (rel && size >= 20) acc.regions.push({ kind: "heading", label: node.characters.slice(0, 40), tag: "h" + fontToLevel(size), ...rel });
    else if (rel && isCta) acc.regions.push({ kind: "button", label: node.characters.slice(0, 30), tag: "button", ...rel });
  }
  if (/button|btn|cta/i.test(node.name || "") && rel) acc.regions.push({ kind: "button", label: (node.name || "button").slice(0, 30), tag: "button", ...rel });
  if (node.fills && node.fills.some && node.fills.some((f) => f.type === "IMAGE")) acc.images += 1;
  acc.counts[node.type] = (acc.counts[node.type] || 0) + 1;
  for (const child of node.children || []) walk(child, origin, acc);
}

async function exportImage(key, ids, token, scale) {
  const r = await fetch(`https://api.figma.com/v1/images/${key}?ids=${encodeURIComponent(ids)}&format=png&scale=${scale || 1}`, { headers: { "X-Figma-Token": token } });
  const j = await r.json();
  const url = j.images?.[ids];
  if (!url) return null;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export async function captureFigmaDesign(link) {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error("No FIGMA_TOKEN configured — add it to .env to audit Figma designs.");
  const { key, nodeId } = parseFigmaLink(link);
  if (!key || !nodeId) throw new Error("Couldn't parse the Figma file key / node id from that link.");

  const meta = await (await fetch(`https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(nodeId)}`, { headers: { "X-Figma-Token": token } })).json();
  const doc = meta.nodes?.[nodeId]?.document;
  if (!doc) throw new Error(meta.err || "That node wasn't found (check the link's node-id and that the token can read the file).");

  const origin = doc.absoluteBoundingBox || { x: 0, y: 0 };
  const acc = { texts: [], regions: [], images: 0, counts: {} };
  for (const child of doc.children || []) walk(child, origin, acc);

  const bySize = [...acc.texts].sort((a, b) => b.size - a.size);
  const headings = bySize.filter((t) => t.size >= 20).slice(0, 20).map((t) => ({ level: fontToLevel(t.size), text: t.text.slice(0, 120) }));
  // Exact, distinct text strings — the edit targets for the clone-and-fix redesign.
  const textInventory = [...new Set(acc.texts.map((t) => t.text).filter((t) => t && t.length > 2))].slice(0, 80);
  // An EXPLICITLY numbered list so the model reliably picks the right findIndex
  // (LLMs can't count array positions, but they can match a numbered line).
  const textInventoryNumbered = textInventory.map((t, i) => `${i}: ${t}`).join("\n");
  const sections = (doc.children || []).map((c) => c.name);
  // Keep only human-readable CTA labels; drop raw layer names (Rectangle 3, Frame 12…).
  const JUNK = /^(rectangle|frame|group|vector|ellipse|image|line|component|instance|button|btn|cta|union|subtract|mask|shape|container)\b|^[a-z ]*\d+$/i;
  const buttons = [...new Set(
    acc.regions.filter((r) => r.kind === "button").map((r) => r.label)
      .filter((l) => l && /[a-zA-Z]/.test(l) && !JUNK.test(l) && l.trim().length > 1)
  )].slice(0, 20);
  const textSample = acc.texts.map((t) => t.text).filter(Boolean).join(" · ").slice(0, 2500);

  // Full-node render (report), plus the first/hero section (crisper above-the-fold for vision).
  const fullShot = await exportImage(key, nodeId, token, 1);
  const heroChild = (doc.children || []).find((c) => /hero|header|banner/i.test(c.name)) || (doc.children || [])[0];
  const heroShot = heroChild ? await exportImage(key, heroChild.id, token, 2) : null;

  return {
    requestedUrl: link,
    finalUrl: link,
    redirected: false,
    status: 200,
    source: "figma-design",
    figmaKey: key,
    figmaNodeId: nodeId,
    textInventory,
    textInventoryNumbered,
    title: doc.name || "Figma design",
    description: `Figma design node with ${sections.length} sections: ${sections.join(", ")}`,
    lang: "",
    viewportMeta: "",
    headings,
    counts: {
      textNodes: acc.counts.TEXT || 0,
      frames: (acc.counts.FRAME || 0) + (acc.counts.GROUP || 0),
      components: (acc.counts.INSTANCE || 0) + (acc.counts.COMPONENT || 0),
      images: acc.images,
      sections: sections.length,
      buttons: buttons.length
    },
    links: [],
    buttons: buttons.slice(0, 20),
    forms: [],
    images: { total: acc.images, withAlt: 0 },
    textSample,
    screenshot: fullShot,
    viewportScreenshot: heroShot || fullShot,
    regions: acc.regions.slice(0, 60),
    pageDimensions: { width: Math.round(origin.width || (doc.absoluteBoundingBox && doc.absoluteBoundingBox.width) || 1440), height: Math.round((doc.absoluteBoundingBox && doc.absoluteBoundingBox.height) || 1024) },
    notes: ["Source is a Figma design (rendered via the Figma REST API); analysis is vision + layer-tree based."],
    screenshotNote: "Rendered from the Figma design via the REST API. Numbered markers reference the findings below."
  };
}
