// Zero-dependency HTML → PageContext extractor.
//
// A real UX audit ideally works from a rendered screenshot, but that needs a
// headless browser (Chromium) we deliberately do not bundle. Instead we fetch
// the served HTML and pull out the structural signals a heuristic review needs:
// headings, landmarks, forms, images/alt coverage, link/button inventory, and a
// visible-text sample. This is regex-based on purpose — it stays dependency-free
// and never executes remote code. Limitations (client-rendered SPAs, JS-injected
// DOM) are surfaced in `notes` so the audit can be honest about them.

const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : "";
};

const countMatches = (html, re) => (html.match(re) || []).length;

export function extractPageContext(html, requested, response) {
  const notes = [];
  const finalUrl = response?.url || requested;
  const redirected = !!response?.redirected;
  const status = response?.status ?? 0;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).slice(0, 200) : "";

  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  const description = descMatch ? attr(descMatch[0], "content").slice(0, 300) : "";

  const langMatch = html.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i);
  const lang = langMatch ? langMatch[1] : "";

  const viewportMatch = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i);
  const viewportMeta = viewportMatch ? attr(viewportMatch[0], "content") : "";

  // Heading outline (structure + accessibility signal).
  const headings = [];
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm;
  while ((hm = headingRe.exec(html)) && headings.length < 40) {
    const text = stripTags(hm[2]);
    if (text) headings.push({ level: Number(hm[1]), text: text.slice(0, 120) });
  }

  // Link + button inventory (navigation + interaction signal).
  const links = [];
  const linkRe = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let lm;
  while ((lm = linkRe.exec(html)) && links.length < 40) {
    const text = stripTags(lm[1]);
    if (text) links.push(text.slice(0, 80));
  }
  const buttons = [];
  const buttonRe = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  let bm;
  while ((bm = buttonRe.exec(html)) && buttons.length < 30) {
    const text = stripTags(bm[1]);
    buttons.push((text || "(icon/empty button)").slice(0, 60));
  }

  // Forms: field count vs. label count is a direct forms/accessibility signal.
  const forms = [];
  const formRe = /<form\b[\s\S]*?<\/form>/gi;
  let fm;
  while ((fm = formRe.exec(html)) && forms.length < 10) {
    const block = fm[0];
    const fields =
      countMatches(block, /<input\b/gi) +
      countMatches(block, /<select\b/gi) +
      countMatches(block, /<textarea\b/gi);
    const labels = countMatches(block, /<label\b/gi);
    forms.push({ fields, labels });
  }

  // Image alt coverage.
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const withAlt = imgTags.filter((t) => /\balt\s*=\s*["'][^"']+["']/i.test(t)).length;

  const counts = {
    h1: countMatches(html, /<h1\b/gi),
    h2: countMatches(html, /<h2\b/gi),
    h3: countMatches(html, /<h3\b/gi),
    links: countMatches(html, /<a\b/gi),
    buttons: countMatches(html, /<button\b/gi),
    inputs: countMatches(html, /<input\b/gi),
    forms: countMatches(html, /<form\b/gi),
    images: imgTags.length,
    ariaAttributes: countMatches(html, /\baria-[a-z]+\s*=/gi),
    roles: countMatches(html, /\brole\s*=\s*["']/gi),
    landmarks: countMatches(html, /<(nav|main|header|footer|aside)\b/gi),
    iframes: countMatches(html, /<iframe\b/gi)
  };

  const bodyText = stripTags(html);
  if (bodyText.length < 200) {
    notes.push(
      "Very little static text was returned — this is likely a client-rendered (JS) app, so DOM signals are partial. Findings lean on metadata and structure."
    );
  }
  if (counts.h1 === 0) notes.push("No <h1> found in served HTML.");

  return {
    requestedUrl: requested,
    finalUrl,
    redirected,
    status,
    title,
    description,
    lang,
    viewportMeta,
    headings,
    counts,
    links,
    buttons,
    forms,
    images: { total: imgTags.length, withAlt },
    textSample: bodyText.slice(0, 2500),
    screenshot: null,
    screenshotNote:
      "No headless-browser backend is configured, so no visual screenshot was captured. Analysis runs on DOM structure + metadata. See UX_REVIEW.md to enable screenshots.",
    notes
  };
}

/**
 * Fetches a URL following redirects and returns a PageContext.
 * `fetch` (Node 18+) follows redirects by default and exposes the final URL.
 */
export async function capturePage(url) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Enter a full http(s) URL, e.g. https://example.com");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // A realistic UA reduces bot blocks; still honours robots via server rules.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 AI-Node-Studio-UX-Audit",
        accept: "text/html,application/xhtml+xml"
      }
    });
    const html = await response.text();
    return extractPageContext(html, url, response);
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("The page took too long to respond (15s timeout).");
    throw new Error(err?.message || "Could not load the page");
  } finally {
    clearTimeout(timeout);
  }
}
