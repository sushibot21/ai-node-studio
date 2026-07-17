// Optional headless-browser capture. Uses Puppeteer when it's installed and can
// launch; otherwise every export degrades to a no-op so the fetch-based capture
// (server/dom.js) stays the default and nothing breaks. This is what produces
// the full-page screenshot + element regions the report annotates.

let puppeteer = null;
try {
  puppeteer = (await import("puppeteer")).default;
} catch {
  puppeteer = null; // not installed — callers fall back to fetch capture
}

export const browserAvailable = () => !!puppeteer;

/** Renders report HTML to a PDF Buffer (A4, backgrounds). Null if no browser. */
export async function htmlToPdf(html) {
  if (!puppeteer) return null;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Loads a URL in a real browser and returns { html, finalUrl, status,
 * screenshot (data URL), regions, pageWidth, pageHeight } — or null if the
 * browser is unavailable or the load fails (caller falls back).
 */
export async function captureWithBrowser(url) {
  if (!puppeteer) return null;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 AI-Node-Studio-UX-Audit"
    );
    const resp = await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });
    // Give lazy content a moment, then capture.
    await new Promise((r) => setTimeout(r, 600));
    const shot = await page.screenshot({ fullPage: true, type: "jpeg", quality: 60 });
    // Above-the-fold shot (viewport only) — smaller and within vision model
    // dimension limits, so it can be sent to the model to ground the analysis.
    const viewportShot = await page.screenshot({ fullPage: false, type: "jpeg", quality: 65 });

    // Bounding boxes of notable elements, so the report can drop numbered pins.
    const meta = await page.evaluate(() => {
      const out = [];
      const add = (el, kind) => {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 60);
        out.push({ kind, label, tag: el.tagName.toLowerCase(), x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) });
      };
      document.querySelectorAll("h1").forEach((e) => add(e, "heading"));
      document.querySelectorAll("button,[role=button],input[type=submit],input[type=button]").forEach((e) => add(e, "button"));
      document.querySelectorAll("nav").forEach((e) => add(e, "nav"));
      document.querySelectorAll("form").forEach((e) => add(e, "form"));
      document.querySelectorAll("input:not([type=hidden]),select,textarea").forEach((e) => add(e, "input"));
      document.querySelectorAll("img:not([alt]),img[alt='']").forEach((e) => add(e, "image-no-alt"));
      return {
        regions: out.slice(0, 80),
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight
      };
    });

    const html = await page.content();
    return {
      html,
      finalUrl: page.url(),
      status: resp ? resp.status() : 200,
      screenshot: `data:image/jpeg;base64,${shot.toString("base64")}`,
      viewportScreenshot: `data:image/jpeg;base64,${viewportShot.toString("base64")}`,
      regions: meta.regions,
      pageWidth: meta.pageWidth,
      pageHeight: meta.pageHeight
    };
  } catch (err) {
    return null; // any failure → caller uses the fetch-based capture
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
