// Fetch + cache design skills from emilkowalski/skills.
// Injected into the redesign prompt so Claude has taste guidance before it
// emits Figma ops.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", ".skills-cache");
const REPO = "emilkowalski/skills";
const BRANCH = "main";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Skills that inform UI/UX redesign work. Others (animation-specific) get
// pulled in only when the redesign is for a motion-heavy surface.
export const REDESIGN_SKILLS = ["apple-design", "emil-design-eng", "pick-ui-library"];
export const ANIMATION_SKILLS = ["find-animation-opportunities", "improve-animations", "animation-vocabulary"];

async function ensureCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readCached(name) {
  try {
    const p = path.join(CACHE_DIR, `${name}.md`);
    const stat = await fs.stat(p);
    if (Date.now() - stat.mtimeMs > TTL_MS) return null;
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function writeCached(name, content) {
  await ensureCache();
  await fs.writeFile(path.join(CACHE_DIR, `${name}.md`), content, "utf8");
}

async function fetchOne(name) {
  const cached = await readCached(name);
  if (cached) return cached;
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/skills/${name}/SKILL.md`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const text = await r.text();
    await writeCached(name, text);
    return text;
  } catch {
    return null;
  }
}

// Load a set of skills, return concatenated text ready to inject into a prompt.
// Silently drops skills that fail to fetch — we never want a network hiccup to
// break the redesign pipeline.
export async function loadSkills(names) {
  const results = await Promise.all(names.map((n) => fetchOne(n)));
  const parts = [];
  results.forEach((text, i) => {
    if (!text) return;
    // Strip skill frontmatter (---\nname:...\n---\n) and trim excessive length.
    const body = text.replace(/^---[\s\S]*?---\s*/, "").trim();
    parts.push(`### Skill: ${names[i]}\n\n${body.slice(0, 4000)}`);
  });
  return parts.join("\n\n---\n\n");
}
