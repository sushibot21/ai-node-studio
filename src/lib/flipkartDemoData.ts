// Auto-generated demo data for the Flipkart UX Review scenario. Pre-computed so
// the demo loads instantly without a live capture (Flipkart blocks server fetch).
import type { PageContext, UXAudit } from "./types";

export const FLIPKART_PAGE_CONTEXT: PageContext = {
  "requestedUrl": "https://dl.flipkart.com/s/26eXVdNNNN",
  "finalUrl": "https://www.flipkart.com/boat-rockerz-255-pro-with-asap-charge/p/itmc1e0f0e0",
  "redirected": true,
  "status": 200,
  "title": "boAt Rockerz 255 Pro+ Bluetooth Headset - boAt : Flipkart.com",
  "description": "Buy boAt Rockerz 255 Pro+ Bluetooth Headset online at best price in India. Check full specifications, reviews and offers.",
  "lang": "en",
  "viewportMeta": "width=device-width, initial-scale=1",
  "headings": [
    {
      "level": 1,
      "text": "boAt Rockerz 255 Pro+ Bluetooth Headset"
    },
    {
      "level": 2,
      "text": "Ratings & Reviews"
    },
    {
      "level": 2,
      "text": "Similar products"
    }
  ],
  "counts": {
    "h1": 1,
    "h2": 2,
    "h3": 0,
    "links": 184,
    "buttons": 9,
    "inputs": 3,
    "forms": 1,
    "images": 46,
    "ariaAttributes": 12,
    "roles": 7,
    "landmarks": 2,
    "iframes": 1
  },
  "links": [
    "Home",
    "Electronics",
    "Audio",
    "Add to Cart",
    "Buy Now",
    "GET IT ON Google Play"
  ],
  "buttons": [
    "Add to Cart",
    "Buy Now",
    "+",
    "−",
    "Compare",
    "(icon/empty button)"
  ],
  "forms": [
    {
      "fields": 3,
      "labels": 0
    }
  ],
  "images": {
    "total": 46,
    "withAlt": 19
  },
  "textSample": "boAt Rockerz 255 Pro+ ... 40 hours playback, ASAP charge, ENx Technology ... Special Price ₹1,299 ₹2,990 56% off ... Add to Cart  Buy Now ... Available offers Bank Offer 5% ... Delivery by tomorrow ...",
  "screenshot": null,
  "screenshotNote": "DOM + interface metadata capture (no headless browser). Analysis runs on structure + metadata.",
  "notes": [
    "Client-rendered sections (offers, recommendations) are partially represented in static DOM."
  ]
} as unknown as PageContext;

export const FLIPKART_AUDIT: UXAudit = {
  "url": "https://www.flipkart.com/boat-rockerz-255-pro-with-asap-charge/p/itmc1e0f0e0",
  "title": "boAt Rockerz 255 Pro+ Bluetooth Headset - boAt : Flipkart.com",
  "overallScore": 50,
  "accessibilityScore": 74,
  "scorecard": [
    {
      "lens": "Conversion Optimisation",
      "score": 3.7
    },
    {
      "lens": "Visual Hierarchy",
      "score": 7.7
    },
    {
      "lens": "WCAG Accessibility",
      "score": 7.7
    },
    {
      "lens": "Trust & Credibility",
      "score": 7.7
    },
    {
      "lens": "Forms",
      "score": 9
    },
    {
      "lens": "Mobile UX",
      "score": 9
    },
    {
      "lens": "Cognitive Load",
      "score": 9
    },
    {
      "lens": "Feedback & System Status",
      "score": 9.7
    }
  ],
  "severityBreakdown": {
    "critical": 1,
    "high": 4,
    "medium": 3,
    "low": 1
  },
  "findings": [
    {
      "title": "App-install interstitial interrupts the purchase path",
      "description": "A full-screen 'Get it on the app' interstitial and repeated app-open banners interrupt users mid-task on mobile web, adding friction between intent and checkout.",
      "principle": "Nielsen #3: User control & freedom; conversion funnel continuity",
      "lens": "conversion",
      "evidence": "Short link (dl.flipkart.com) forces an app-redirect; page includes 'GET IT ON Google Play' and app-open banners.",
      "severity": "critical",
      "userImpact": "Mobile-web shoppers ready to buy are pushed out of the flow, dropping conversion.",
      "recommendation": "Remove the blocking interstitial on the buying path; make mobile web a first-class checkout surface and demote app promotion to a dismissible, non-blocking banner.",
      "confidence": 0.86,
      "id": "F001"
    },
    {
      "title": "Primary CTAs ('Add to Cart' / 'Buy Now') are not persistent on scroll",
      "description": "The two primary actions sit near the top; as users read specs, offers and reviews they scroll away from any way to act, forcing a scroll back up.",
      "principle": "Nielsen #7: Flexibility & efficiency; Fitts's law",
      "lens": "conversion",
      "evidence": "9 buttons total; CTAs appear once near the fold with no sticky action bar in the captured structure.",
      "severity": "high",
      "userImpact": "Users lose the ability to act at the moment of decision, increasing abandonment.",
      "recommendation": "Add a sticky bottom action bar on mobile (price + Add to Cart + Buy Now) that persists through scroll.",
      "confidence": 0.8,
      "id": "F002"
    },
    {
      "title": "Price, rating, and CTA compete for attention — no single focal point",
      "description": "Special price, discount %, ratings, offers and CTAs are all high-emphasis simultaneously, so nothing leads the eye.",
      "principle": "Visual hierarchy; one clear focal point per view",
      "lens": "visualHierarchy",
      "evidence": "Dense above-the-fold block: '₹1,299 ₹2,990 56% off', ratings, and two CTAs stacked with similar weight.",
      "severity": "high",
      "userImpact": "Increased time-to-decision; the primary action is easy to miss.",
      "recommendation": "Establish one focal point: elevate the primary CTA, make price secondary-but-clear, and reduce competing emphasis on offers.",
      "confidence": 0.78,
      "id": "F003"
    },
    {
      "title": "Secondary text fails WCAG AA contrast",
      "description": "Specification labels, delivery text and struck-through MRP use light grey on white below the 4.5:1 threshold.",
      "principle": "WCAG 2.2 — 1.4.3 Contrast (Minimum)",
      "lens": "wcag",
      "evidence": "Struck-through MRP and muted spec/delivery text render as low-contrast grey per captured styles.",
      "severity": "high",
      "userImpact": "Low-vision users and anyone in bright sunlight cannot read key details (price, delivery).",
      "recommendation": "Raise secondary text to ≥4.5:1 (≥3:1 for large text); never rely on grey-on-white for price or delivery info.",
      "confidence": 0.72,
      "id": "F004"
    },
    {
      "title": "Return/replacement policy and seller trust signals aren't near the price",
      "description": "Warranty, replacement window and seller rating are buried below recommendations, so users can't assess risk at the decision point.",
      "principle": "Trust & credibility; transparency at decision point",
      "lens": "trust",
      "evidence": "Headings show 'Ratings & Reviews' and 'Similar products' but no policy/seller block near the buy area.",
      "severity": "high",
      "userImpact": "Purchase hesitation and post-purchase disputes rise when policy is hidden.",
      "recommendation": "Surface a compact trust strip near the CTA: replacement window, warranty, seller rating, and 'Flipkart Assured' badge.",
      "confidence": 0.7,
      "id": "F005"
    },
    {
      "title": "Form inputs (pincode, quantity) have no associated labels",
      "description": "The delivery-pincode and quantity inputs rely on placeholders/icons instead of programmatic labels.",
      "principle": "WCAG 2.2 — 3.3.2 Labels or Instructions; forms best practice",
      "lens": "forms",
      "evidence": "1 form with 3 fields and 0 <label> elements in the captured DOM.",
      "severity": "medium",
      "userImpact": "Screen-reader users can't identify fields; placeholder-only labels disappear on input.",
      "recommendation": "Add visible, programmatically-associated <label>s for pincode and quantity; keep them visible after focus.",
      "confidence": 0.83,
      "id": "F006"
    },
    {
      "title": "Quantity and variant tap targets are below 44px",
      "description": "The +/− quantity steppers and colour/variant chips are small and closely spaced for touch.",
      "principle": "Mobile UX; WCAG 2.5.8 Target Size",
      "lens": "mobileUX",
      "evidence": "'+' and '−' steppers present as compact controls; dense variant chips.",
      "severity": "medium",
      "userImpact": "Mis-taps and frustration on mobile, especially one-handed use.",
      "recommendation": "Enlarge interactive targets to ≥44×44px with adequate spacing.",
      "confidence": 0.68,
      "id": "F007"
    },
    {
      "title": "Above-the-fold offers and banners create high cognitive load",
      "description": "Bank offers, exchange offers, coupons and cross-sell all appear at once, competing with the core buying decision.",
      "principle": "Cognitive load; progressive disclosure",
      "lens": "cognitiveLoad",
      "evidence": "'Available offers Bank Offer 5% ...' plus similar-products and multiple promo blocks near the top.",
      "severity": "medium",
      "userImpact": "Decision paralysis; the core task (choose + buy) is diluted.",
      "recommendation": "Collapse offers behind a single 'View offers' disclosure; keep the fold focused on product, price, and CTA.",
      "confidence": 0.66,
      "id": "F008"
    },
    {
      "title": "No clear system feedback after 'Add to Cart' on slow connections",
      "description": "On slower networks there's no immediate optimistic feedback confirming the item was added.",
      "principle": "Nielsen #1: Visibility of system status",
      "lens": "feedbackStatus",
      "evidence": "Single 'Add to Cart' button with no captured inline confirmation/toast pattern.",
      "severity": "low",
      "userImpact": "Users re-tap or assume failure, creating duplicate adds or drop-off.",
      "recommendation": "Show immediate optimistic feedback (button state + toast + cart badge increment) on add.",
      "confidence": 0.6,
      "id": "F009"
    }
  ],
  "quickWins": [
    "Form inputs (pincode, quantity) have no associated labels",
    "Quantity and variant tap targets are below 44px",
    "Above-the-fold offers and banners create high cognitive load",
    "No clear system feedback after 'Add to Cart' on slow connections"
  ],
  "longTerm": [
    "App-install interstitial interrupts the purchase path",
    "Primary CTAs ('Add to Cart' / 'Buy Now') are not persistent on scroll",
    "Price, rating, and CTA compete for attention — no single focal point",
    "Secondary text fails WCAG AA contrast",
    "Return/replacement policy and seller trust signals aren't near the price"
  ],
  "confidence": 0.74,
  "pageContext": {
    "requestedUrl": "https://dl.flipkart.com/s/26eXVdNNNN",
    "finalUrl": "https://www.flipkart.com/boat-rockerz-255-pro-with-asap-charge/p/itmc1e0f0e0",
    "redirected": true,
    "status": 200,
    "title": "boAt Rockerz 255 Pro+ Bluetooth Headset - boAt : Flipkart.com",
    "description": "Buy boAt Rockerz 255 Pro+ Bluetooth Headset online at best price in India. Check full specifications, reviews and offers.",
    "lang": "en",
    "viewportMeta": "width=device-width, initial-scale=1",
    "headings": [
      {
        "level": 1,
        "text": "boAt Rockerz 255 Pro+ Bluetooth Headset"
      },
      {
        "level": 2,
        "text": "Ratings & Reviews"
      },
      {
        "level": 2,
        "text": "Similar products"
      }
    ],
    "counts": {
      "h1": 1,
      "h2": 2,
      "h3": 0,
      "links": 184,
      "buttons": 9,
      "inputs": 3,
      "forms": 1,
      "images": 46,
      "ariaAttributes": 12,
      "roles": 7,
      "landmarks": 2,
      "iframes": 1
    },
    "links": [
      "Home",
      "Electronics",
      "Audio",
      "Add to Cart",
      "Buy Now",
      "GET IT ON Google Play"
    ],
    "buttons": [
      "Add to Cart",
      "Buy Now",
      "+",
      "−",
      "Compare",
      "(icon/empty button)"
    ],
    "forms": [
      {
        "fields": 3,
        "labels": 0
      }
    ],
    "images": {
      "total": 46,
      "withAlt": 19
    },
    "textSample": "boAt Rockerz 255 Pro+ ... 40 hours playback, ASAP charge, ENx Technology ... Special Price ₹1,299 ₹2,990 56% off ... Add to Cart  Buy Now ... Available offers Bank Offer 5% ... Delivery by tomorrow ...",
    "screenshot": null,
    "screenshotNote": "DOM + interface metadata capture (no headless browser). Analysis runs on structure + metadata.",
    "notes": [
      "Client-rendered sections (offers, recommendations) are partially represented in static DOM."
    ]
  },
  "methodology": "Five independent review passes covering 18 UX lenses (Nielsen heuristics, WCAG, visual hierarchy, Gestalt, IA, interaction, mobile, navigation, conversion, trust, forms, error prevention, content, consistency, cognitive load, progressive disclosure, recognition-vs-recall, feedback). Findings were consolidated, de-duplicated by lens + title similarity, severity-ranked, then improved by an iterative refinement pass. Scores are deductive from severity-weighted findings.",
  "reviewLoop": [
    {
      "round": 1,
      "score": 7,
      "change": "Initial consolidated findings from the five passes; several issues lacked concrete on-page evidence and a justified severity."
    },
    {
      "round": 2,
      "score": 9,
      "change": "Rewrote each issue to cite specific evidence (status codes, element counts, copy), name the violated principle, justify severity by user impact, and give a concrete fix. Merged two overlapping CTA findings.",
      "selected": true
    }
  ]
} as unknown as UXAudit;

export const FLIPKART_REFINER_NARRATIVE = "This audit reviewed the boAt Rockerz 255 Pro+ product page across 18 UX lenses. The page converts against real friction: a critical app-install interstitial interrupts the mobile-web buying path, and the primary Add to Cart / Buy Now actions do not persist on scroll, so users lose the ability to act at the moment of decision. A crowded above-the-fold — price, discount, ratings, offers and cross-sell all competing at once — leaves no single focal point, while low-contrast secondary text and hidden return/seller trust signals raise hesitation. The highest-leverage fixes are structural and low-risk: a persistent mobile action bar, a demoted (non-blocking) app prompt, a single clear focal point, WCAG-AA contrast, and a compact trust strip beside the price. Addressing the critical and high-severity items should measurably improve add-to-cart and checkout completion.";

export const FLIPKART_REDESIGN_SPEC = {
  "screenName": "boAt Rockerz 255 Pro+ — Product Detail",
  "productPurpose": "Let a shopper evaluate and buy the product on mobile web without friction or an app redirect.",
  "platform": "mobile",
  "tokens": {
    "bg": "FFFFFF",
    "surface": "F5F6FA",
    "accent": "1A6FE8",
    "text": "111827",
    "textDim": "4B5563",
    "border": "E2E6EE",
    "success": "1E874B"
  },
  "designRationale": "Rebuilt as a focused mobile product page: the app-gate is gone, a single primary CTA persists on scroll, price/CTA form one focal point, trust sits beside the price, inputs are labelled, and all text meets WCAG AA.",
  "sections": [
    {
      "type": "nav",
      "title": "Flipkart",
      "items": [
        {
          "label": "Search"
        },
        {
          "label": "Cart"
        },
        {
          "label": "Account"
        }
      ],
      "resolves": [
        "F001"
      ],
      "rationale": "Mobile web is first-class; no app-install interstitial blocks the path."
    },
    {
      "type": "media",
      "title": "Product gallery",
      "mediaLabel": "Product image gallery (editable)",
      "resolves": [
        "F003"
      ],
      "rationale": "Dedicated top real estate gives the page a single clear focal point."
    },
    {
      "type": "priceCta",
      "title": "boAt Rockerz 255 Pro+",
      "subtitle": "40h playback · ASAP charge · ENx",
      "price": "₹1,299  ₹2,990  56% off",
      "cta": {
        "label": "Add to Cart",
        "emphasis": "primary"
      },
      "resolves": [
        "F002",
        "F003"
      ],
      "rationale": "One prominent primary CTA anchors the decision; price is clear but secondary."
    },
    {
      "type": "trust",
      "title": "Why buy here",
      "badges": [
        {
          "label": "7-day replacement"
        },
        {
          "label": "1-yr warranty"
        },
        {
          "label": "Flipkart Assured"
        },
        {
          "label": "4.4★ seller"
        }
      ],
      "resolves": [
        "F006"
      ],
      "rationale": "Trust signals sit directly below the price so buyers assess risk before acting."
    },
    {
      "type": "form",
      "title": "Delivery & quantity",
      "fields": [
        {
          "label": "Delivery pincode",
          "type": "text"
        },
        {
          "label": "Quantity",
          "type": "number"
        }
      ],
      "cta": {
        "label": "Check delivery",
        "emphasis": "secondary"
      },
      "resolves": [
        "F005"
      ],
      "rationale": "Every input has a visible, associated label; ≥44px tap targets."
    },
    {
      "type": "content",
      "title": "Key specifications",
      "body": "Spec text uses #4B5563 on #FFFFFF (7.2:1) — well above WCAG AA.",
      "items": [
        {
          "label": "Driver: 40mm"
        },
        {
          "label": "Battery: 40 hours"
        },
        {
          "label": "Bluetooth 5.2"
        }
      ],
      "resolves": [
        "F004"
      ],
      "rationale": "All secondary text raised to AA contrast; specs are scannable."
    },
    {
      "type": "banner",
      "title": "Sticky action bar",
      "subtitle": "Price + Add to Cart + Buy Now persist as you scroll",
      "resolves": [
        "F002"
      ],
      "rationale": "A persistent bottom bar keeps the action reachable at any scroll position."
    },
    {
      "type": "footer",
      "title": "Policies & support",
      "items": [
        {
          "label": "Returns"
        },
        {
          "label": "Warranty"
        },
        {
          "label": "Contact seller"
        }
      ],
      "resolves": [
        "F001",
        "F006"
      ],
      "rationale": "Full policy/seller detail stays on mobile web — no app gate."
    }
  ]
};

export const FLIPKART_FIGMA_OUTPUT = "Design decisions\nRationale: Rebuilt as a focused mobile product page: the app-gate is gone, a single primary CTA persists on scroll, price/CTA form one focal point, trust sits beside the price, inputs are labelled, and all text meets WCAG AA.\n\nEditable Figma redesign spec (native layers — frames, auto-layout, reusable Button/Card components, colour variables).\nTo build it: Figma Desktop → Plugins → Development → \"Node Studio — Screen Builder\" → paste the spec below → Create screen.\n\n{\n  \"screenName\": \"boAt Rockerz 255 Pro+ — Product Detail\",\n  \"productPurpose\": \"Let a shopper evaluate and buy the product on mobile web without friction or an app redirect.\",\n  \"platform\": \"mobile\",\n  \"tokens\": {\n    \"bg\": \"FFFFFF\",\n    \"surface\": \"F5F6FA\",\n    \"accent\": \"1A6FE8\",\n    \"text\": \"111827\",\n    \"textDim\": \"4B5563\",\n    \"border\": \"E2E6EE\",\n    \"success\": \"1E874B\"\n  },\n  \"sections\": [\n    {\n      \"type\": \"nav\",\n      \"title\": \"Flipkart\",\n      \"subtitle\": \"\",\n      \"body\": \"\",\n      \"price\": \"\",\n      \"items\": [\n        {\n          \"label\": \"Search\"\n        },\n        {\n          \"label\": \"Cart\"\n        },\n        {\n          \"label\": \"Account\"\n        }\n      ],\n      \"fields\": [],\n      \"badges\": [],\n      \"cta\": null,\n      \"resolves\": [\n        \"F001\"\n      ],\n      \"rationale\": \"Mobile web is first-class; no app-install interstitial blocks the path.\"\n    },\n    {\n      \"type\": \"media\",\n      \"title\": \"Product gallery\",\n      \"subtitle\": \"\",\n      \"body\": \"\",\n      \"price\": \"\",\n      \"items\": [],\n      \"fields\": [],\n      \"badges\": [],\n      \"cta\": null,\n      \"resolves\": [\n        \"F003\"\n      ],\n      \"rationale\": \"Dedicated top real estate gives the page a single clear focal point.\"\n    },\n    {\n      \"type\": \"priceCta\",\n      \"title\": \"boAt Rockerz 255 Pro+\",\n      \"subtitle\": \"40h playback · ASAP charge · ENx\",\n      \"body\": \"\",\n      \"price\": \"₹1,299  ₹2,990  56% off\",\n      \"items\": [],\n      \"fields\": [],\n      \"badges\": [],\n      \"cta\": {\n        \"label\": \"Add to Cart\",\n        \"emphasis\": \"primary\"\n      },\n      \"resolves\": [\n        \"F002\",\n        \"F003\"\n      ],\n      \"rationale\": \"One prominent primary CTA anchors the decision; price is clear but secondary.\"\n    },\n    {\n      \"type\": \"trust\",\n      \"title\": \"Why buy here\",\n      \"subtitle\": \"\",\n      \"body\": \"\",\n      \"price\": \"\",\n      \"items\": [],\n      \"fields\": [],\n      \"badges\": [\n        {\n          \"label\": \"7-day replacement\"\n        },\n        {\n          \"label\": \"1-yr warranty\"\n        },\n        {\n          \"label\": \"Flipkart Assured\"\n        },\n        {\n          \"label\": \"4.4★ seller\"\n        }\n      ],\n      \"cta\": null,\n      \"resolves\": [\n        \"F006\"\n      ],\n      \"rationale\": \"Trust signals sit directly below the price so buyers assess risk before acting.\"\n    },\n    {\n      \"type\": \"form\",\n      \"title\": \"Delivery & quantity\",\n      \"subtitle\": \"\",\n      \"body\": \"\",\n      \"price\": \"\",\n      \"items\": [],\n      \"fields\": [\n        {\n          \"label\": \"Delivery pincode\",\n          \"type\": \"text\"\n        },\n        {\n          \"label\": \"Quantity\",\n          \"type\": \"number\"\n        }\n      ],\n      \"badges\": [],\n      \"cta\": {\n        \"label\": \"Check delivery\",\n        \"emphasis\": \"secondary\"\n      },\n      \"resolves\": [\n        \"F005\"\n      ],\n      \"rationale\": \"Every input has a visible, associated label; ≥44px tap targets.\"\n    },\n    {\n      \"type\": \"content\",\n      \"title\": \"Key specifications\",\n      \"subtitle\": \"\",\n      \"body\": \"Spec text uses #4B5563 on #FFFFFF (7.2:1) — well above WCAG AA.\",\n      \"price\": \"\",\n      \"items\": [\n        {\n          \"label\": \"Driver: 40mm\"\n        },\n        {\n          \"label\": \"Battery: 40 hours\"\n        },\n        {\n          \"label\": \"Bluetooth 5.2\"\n        }\n      ],\n      \"fields\": [],\n      \"badges\": [],\n      \"cta\": null,\n      \"resolves\": [\n        \"F004\"\n      ],\n      \"rationale\": \"All secondary text raised to AA contrast; specs are scannable.\"\n    },\n    {\n      \"type\": \"banner\",\n      \"title\": \"Sticky action bar\",\n      \"subtitle\": \"Price + Add to Cart + Buy Now persist as you scroll\",\n      \"body\": \"\",\n      \"price\": \"\",\n      \"items\": [],\n      \"fields\": [],\n      \"badges\": [],\n      \"cta\": null,\n      \"resolves\": [\n        \"F002\"\n      ],\n      \"rationale\": \"A persistent bottom bar keeps the action reachable at any scroll position.\"\n    },\n    {\n      \"type\": \"footer\",\n      \"title\": \"Policies & support\",\n      \"subtitle\": \"\",\n      \"body\": \"\",\n      \"price\": \"\",\n      \"items\": [\n        {\n          \"label\": \"Returns\"\n        },\n        {\n          \"label\": \"Warranty\"\n        },\n        {\n          \"label\": \"Contact seller\"\n        }\n      ],\n      \"fields\": [],\n      \"badges\": [],\n      \"cta\": null,\n      \"resolves\": [\n        \"F001\",\n        \"F006\"\n      ],\n      \"rationale\": \"Full policy/seller detail stays on mobile web — no app gate.\"\n    }\n  ],\n  \"findingsResolved\": [\n    \"F001\",\n    \"F003\",\n    \"F002\",\n    \"F006\",\n    \"F005\",\n    \"F004\"\n  ],\n  \"eyebrow\": \"REDESIGN\",\n  \"title\": \"boAt Rockerz 255 Pro+ — Product Detail\",\n  \"subtitle\": \"Rebuilt around the audit's highest-severity findings.\",\n  \"background\": \"FFFFFF\",\n  \"accent\": \"1A6FE8\",\n  \"primaryCta\": \"Get started\",\n  \"cards\": [\n    {\n      \"title\": \"Section 1\",\n      \"body\": \"Describe this improvement.\",\n      \"cta\": \"\"\n    },\n    {\n      \"title\": \"Section 2\",\n      \"body\": \"Describe this improvement.\",\n      \"cta\": \"\"\n    },\n    {\n      \"title\": \"Section 3\",\n      \"body\": \"Describe this improvement.\",\n      \"cta\": \"\"\n    }\n  ],\n  \"improvements\": [],\n  \"layout\": \"\",\n  \"componentHierarchy\": [],\n  \"spacing\": \"\",\n  \"typography\": \"\",\n  \"interactionStates\": [],\n  \"rationale\": \"Rebuilt as a focused mobile product page: the app-gate is gone, a single primary CTA persists on scroll, price/CTA form one focal point, trust sits beside the price, inputs are labelled, and all text meets WCAG AA.\"\n}";

export const FLIPKART_REPORT_HTML = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>Flipkart — boAt Rockerz 255 Pro+ Product Page — UX Audit</title>\n<style>\n  :root{--ink:#14110e;--muted:#5b5750;--line:#e6e1d8;--accent:#ff8a4c;--bg:#fbfaf7;}\n  *{box-sizing:border-box}\n  body{margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Inter,sans-serif;color:var(--ink);background:var(--bg)}\n  .page{max-width:900px;margin:0 auto;padding:56px 64px}\n  h1,h2,h3,h4{line-height:1.2;margin:0 0 .4em}\n  h2{font-size:24px;margin-top:0;padding-bottom:8px;border-bottom:2px solid var(--line)}\n  section{margin:0 0 40px}\n  .muted{color:var(--muted)}\n  .cover{min-height:88vh;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid var(--line)}\n  .cover .eyebrow{letter-spacing:.28em;font-size:12px;color:var(--accent);font-weight:700;text-transform:uppercase}\n  .cover h1{font-size:52px;letter-spacing:-.02em;margin:16px 0 8px}\n  .cover .url{font-size:16px;color:var(--muted);word-break:break-all}\n  .cover .meta{margin-top:auto;padding-top:28px;color:var(--muted);font-size:13px}\n  .scores{display:flex;gap:24px;flex-wrap:wrap;margin:24px 0}\n  .gauge{flex:1;min-width:200px;border:1px solid var(--line);border-radius:16px;padding:22px;background:#fff}\n  .gauge .n{font-size:44px;font-weight:800}\n  .gauge .l{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.08em}\n  table{width:100%;border-collapse:collapse}\n  td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}\n  td.num{font-weight:700;text-align:right;white-space:nowrap;width:70px}\n  .minibar{height:8px;border-radius:6px;background:var(--line);overflow:hidden;min-width:120px}\n  .minibar span{display:block;height:100%}\n  .sevbar{display:flex;height:26px;border-radius:8px;overflow:hidden;margin:8px 0}\n  .sevbar span{display:block}\n  ul.legend{list-style:none;padding:0;display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted)}\n  ul.legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}\n  .finding{border:1px solid var(--line);border-left-width:5px;border-radius:12px;padding:16px 18px;margin:14px 0;background:#fff;break-inside:avoid}\n  .finding.sev-critical{border-left-color:#ff5c5c}\n  .finding.sev-high{border-left-color:#ff9f43}\n  .finding.sev-medium{border-left-color:#ffd43b}\n  .finding.sev-low{border-left-color:#5fd68f}\n  .finding header{display:flex;align-items:center;gap:10px}\n  .finding header h3{flex:1;margin:0;font-size:17px}\n  .fid{font:700 12px ui-monospace,monospace;color:var(--muted)}\n  .pill{color:#20120b;font-weight:700;font-size:11px;padding:3px 9px;border-radius:20px;text-transform:uppercase}\n  .finding .desc{margin:10px 0}\n  .finding dl{display:grid;grid-template-columns:150px 1fr;gap:4px 14px;margin:0;font-size:13.5px}\n  .finding dt{color:var(--muted);font-weight:600}\n  .finding dd{margin:0}\n  .matrix{display:grid;grid-template-columns:1fr 1fr;gap:14px}\n  .matrix .cell{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff}\n  .matrix h4{font-size:14px}.matrix h4 span{color:var(--muted);font-weight:400}\n  .matrix ul{margin:6px 0 0;padding-left:18px;font-size:13px}.matrix .empty{list-style:none;margin-left:-18px;color:var(--muted)}\n  .shot{position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:10px 0;line-height:0}\n  .shot img{width:100%;display:block}\n  .pin{position:absolute;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.55)}\n  .pin.sev-critical,.pin-n.sev-critical{background:#ff5c5c}\n  .pin.sev-high,.pin-n.sev-high{background:#ff9f43}\n  .pin.sev-medium,.pin-n.sev-medium{background:#ffd43b;color:#20120b}\n  .pin.sev-low,.pin-n.sev-low{background:#5fd68f;color:#12351f}\n  .shot-legend{list-style:none;padding:0;margin:10px 0 0;display:grid;gap:6px;font-size:13px}\n  .shot-legend li{display:flex;align-items:center;gap:8px}\n  .pin-n{display:inline-flex;width:20px;height:20px;border-radius:50%;color:#fff;font:700 11px sans-serif;align-items:center;justify-content:center;flex:none}\n  .decisions{display:flex;flex-direction:column;gap:10px}\n  .decision{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#fff;break-inside:avoid}\n  .decision .pill{margin-top:2px}\n  .decision .why{color:var(--muted);font-size:13.5px;margin-top:3px}\n  .cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}\n  .card{border:1px solid var(--line);border-radius:12px;padding:16px 18px;background:#fff}\n  .card ul{margin:6px 0 0;padding-left:18px}\n  .appendix{font-size:13px;color:var(--muted)}\n  .appendix code{background:#f0ece4;padding:1px 5px;border-radius:4px}\n  @media print{body{background:#fff}.page{padding:0 12mm}section{break-inside:avoid}.cover{min-height:96vh}.no-print{display:none}}\n</style></head>\n<body><div class=\"page\">\n\n  <section class=\"cover\">\n    <div class=\"eyebrow\">UX Audit Report</div>\n    <h1>Flipkart — boAt Rockerz 255 Pro+ Product Page</h1>\n    <div class=\"url\">https://www.flipkart.com/boat-rockerz-255-pro-with-asap-charge/p/itmc1e0f0e0</div>\n    <div class=\"scores\">\n      <div class=\"gauge\"><div class=\"n\" style=\"color:#ff5c5c\">50<span style=\"font-size:20px\">/100</span></div><div class=\"l\">Overall UX Score</div></div>\n      <div class=\"gauge\"><div class=\"n\" style=\"color:#ffd43b\">74<span style=\"font-size:20px\">/100</span></div><div class=\"l\">Accessibility</div></div>\n      <div class=\"gauge\"><div class=\"n\">9</div><div class=\"l\">Issues Found</div></div>\n      <div class=\"gauge\"><div class=\"n\">74<span style=\"font-size:20px\">%</span></div><div class=\"l\">AI Confidence</div></div>\n    </div>\n    <div class=\"meta\">Prepared by AI Node Studio · July 17, 2026</div>\n  </section>\n\n  <section><h2>Executive Summary</h2><p>This audit reviewed the boAt Rockerz 255 Pro+ product page across 18 UX lenses. The page converts against real friction: a critical app-install interstitial interrupts the mobile-web buying path, and the primary Add to Cart / Buy Now actions do not persist on scroll, so users lose the ability to act at the moment of decision. A crowded above-the-fold — price, discount, ratings, offers and cross-sell all competing at once — leaves no single focal point, while low-contrast secondary text and hidden return/seller trust signals raise hesitation. The highest-leverage fixes are structural and low-risk: a persistent mobile action bar, a demoted (non-blocking) app prompt, a single clear focal point, WCAG-AA contrast, and a compact trust strip beside the price. Addressing the critical and high-severity items should measurably improve add-to-cart and checkout completion.</p></section>\n\n  <section><h2>Severity Breakdown</h2><div class=\"sevbar\"><span style=\"width:11.11111111111111%;background:#ff5c5c\" title=\"critical: 1\"></span><span style=\"width:44.44444444444444%;background:#ff9f43\" title=\"high: 4\"></span><span style=\"width:33.33333333333333%;background:#ffd43b\" title=\"medium: 3\"></span><span style=\"width:11.11111111111111%;background:#5fd68f\" title=\"low: 1\"></span></div><ul class=\"legend\"><li><i style=\"background:#ff5c5c\"></i>Critical — <b>1</b></li><li><i style=\"background:#ff9f43\"></i>High — <b>4</b></li><li><i style=\"background:#ffd43b\"></i>Medium — <b>3</b></li><li><i style=\"background:#5fd68f\"></i>Low — <b>1</b></li></ul></section>\n\n  <section><h2>Heuristic Scorecard</h2>\n    <table><thead><tr><th>Lens</th><th class=\"num\">Score</th><th></th></tr></thead>\n    <tbody><tr><td>Conversion Optimisation</td><td class=\"num\" style=\"color:#ff5c5c\">3.7/10</td>\n        <td><div class=\"minibar\"><span style=\"width:37%;background:#ff5c5c\"></span></div></td></tr><tr><td>Visual Hierarchy</td><td class=\"num\" style=\"color:#ffd43b\">7.7/10</td>\n        <td><div class=\"minibar\"><span style=\"width:77%;background:#ffd43b\"></span></div></td></tr><tr><td>WCAG Accessibility</td><td class=\"num\" style=\"color:#ffd43b\">7.7/10</td>\n        <td><div class=\"minibar\"><span style=\"width:77%;background:#ffd43b\"></span></div></td></tr><tr><td>Trust &amp; Credibility</td><td class=\"num\" style=\"color:#ffd43b\">7.7/10</td>\n        <td><div class=\"minibar\"><span style=\"width:77%;background:#ffd43b\"></span></div></td></tr><tr><td>Forms</td><td class=\"num\" style=\"color:#5fd68f\">9/10</td>\n        <td><div class=\"minibar\"><span style=\"width:90%;background:#5fd68f\"></span></div></td></tr><tr><td>Mobile UX</td><td class=\"num\" style=\"color:#5fd68f\">9/10</td>\n        <td><div class=\"minibar\"><span style=\"width:90%;background:#5fd68f\"></span></div></td></tr><tr><td>Cognitive Load</td><td class=\"num\" style=\"color:#5fd68f\">9/10</td>\n        <td><div class=\"minibar\"><span style=\"width:90%;background:#5fd68f\"></span></div></td></tr><tr><td>Feedback &amp; System Status</td><td class=\"num\" style=\"color:#5fd68f\">9.7/10</td>\n        <td><div class=\"minibar\"><span style=\"width:97%;background:#5fd68f\"></span></div></td></tr></tbody></table>\n  </section>\n\n  <section><h2>Screens Analysed</h2>\n    <div class=\"card\">\n      <p><b>boAt Rockerz 255 Pro+ Bluetooth Headset - boAt : Flipkart.com</b><br><span class=\"muted\">https://www.flipkart.com/boat-rockerz-255-pro-with-asap-charge/p/itmc1e0f0e0</span></p>\n      <p class=\"muted\">DOM + interface metadata capture (no headless browser). Analysis runs on structure + metadata.</p>\n    </div>\n    \n  </section>\n\n  <section><h2>Key Findings</h2><article class=\"finding sev-critical\">\n    <header>\n      <span class=\"fid\">F001</span>\n      <h3>App-install interstitial interrupts the purchase path</h3>\n      <span class=\"pill\" style=\"background:#ff5c5c\">critical</span>\n    </header>\n    <p class=\"desc\">A full-screen 'Get it on the app' interstitial and repeated app-open banners interrupt users mid-task on mobile web, adding friction between intent and checkout.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>Nielsen #3: User control &amp; freedom; conversion funnel continuity</dd>\n      <dt>Evidence</dt><dd>Short link (dl.flipkart.com) forces an app-redirect; page includes 'GET IT ON Google Play' and app-open banners.</dd>\n      <dt>User impact</dt><dd>Mobile-web shoppers ready to buy are pushed out of the flow, dropping conversion.</dd>\n      <dt>Recommendation</dt><dd>Remove the blocking interstitial on the buying path; make mobile web a first-class checkout surface and demote app promotion to a dismissible, non-blocking banner.</dd>\n      <dt>Confidence</dt><dd>86%</dd>\n    </dl>\n  </article><article class=\"finding sev-high\">\n    <header>\n      <span class=\"fid\">F002</span>\n      <h3>Primary CTAs ('Add to Cart' / 'Buy Now') are not persistent on scroll</h3>\n      <span class=\"pill\" style=\"background:#ff9f43\">high</span>\n    </header>\n    <p class=\"desc\">The two primary actions sit near the top; as users read specs, offers and reviews they scroll away from any way to act, forcing a scroll back up.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>Nielsen #7: Flexibility &amp; efficiency; Fitts's law</dd>\n      <dt>Evidence</dt><dd>9 buttons total; CTAs appear once near the fold with no sticky action bar in the captured structure.</dd>\n      <dt>User impact</dt><dd>Users lose the ability to act at the moment of decision, increasing abandonment.</dd>\n      <dt>Recommendation</dt><dd>Add a sticky bottom action bar on mobile (price + Add to Cart + Buy Now) that persists through scroll.</dd>\n      <dt>Confidence</dt><dd>80%</dd>\n    </dl>\n  </article><article class=\"finding sev-high\">\n    <header>\n      <span class=\"fid\">F003</span>\n      <h3>Price, rating, and CTA compete for attention — no single focal point</h3>\n      <span class=\"pill\" style=\"background:#ff9f43\">high</span>\n    </header>\n    <p class=\"desc\">Special price, discount %, ratings, offers and CTAs are all high-emphasis simultaneously, so nothing leads the eye.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>Visual hierarchy; one clear focal point per view</dd>\n      <dt>Evidence</dt><dd>Dense above-the-fold block: '₹1,299 ₹2,990 56% off', ratings, and two CTAs stacked with similar weight.</dd>\n      <dt>User impact</dt><dd>Increased time-to-decision; the primary action is easy to miss.</dd>\n      <dt>Recommendation</dt><dd>Establish one focal point: elevate the primary CTA, make price secondary-but-clear, and reduce competing emphasis on offers.</dd>\n      <dt>Confidence</dt><dd>78%</dd>\n    </dl>\n  </article><article class=\"finding sev-high\">\n    <header>\n      <span class=\"fid\">F004</span>\n      <h3>Secondary text fails WCAG AA contrast</h3>\n      <span class=\"pill\" style=\"background:#ff9f43\">high</span>\n    </header>\n    <p class=\"desc\">Specification labels, delivery text and struck-through MRP use light grey on white below the 4.5:1 threshold.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>WCAG 2.2 — 1.4.3 Contrast (Minimum)</dd>\n      <dt>Evidence</dt><dd>Struck-through MRP and muted spec/delivery text render as low-contrast grey per captured styles.</dd>\n      <dt>User impact</dt><dd>Low-vision users and anyone in bright sunlight cannot read key details (price, delivery).</dd>\n      <dt>Recommendation</dt><dd>Raise secondary text to ≥4.5:1 (≥3:1 for large text); never rely on grey-on-white for price or delivery info.</dd>\n      <dt>Confidence</dt><dd>72%</dd>\n    </dl>\n  </article><article class=\"finding sev-high\">\n    <header>\n      <span class=\"fid\">F005</span>\n      <h3>Return/replacement policy and seller trust signals aren't near the price</h3>\n      <span class=\"pill\" style=\"background:#ff9f43\">high</span>\n    </header>\n    <p class=\"desc\">Warranty, replacement window and seller rating are buried below recommendations, so users can't assess risk at the decision point.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>Trust &amp; credibility; transparency at decision point</dd>\n      <dt>Evidence</dt><dd>Headings show 'Ratings &amp; Reviews' and 'Similar products' but no policy/seller block near the buy area.</dd>\n      <dt>User impact</dt><dd>Purchase hesitation and post-purchase disputes rise when policy is hidden.</dd>\n      <dt>Recommendation</dt><dd>Surface a compact trust strip near the CTA: replacement window, warranty, seller rating, and 'Flipkart Assured' badge.</dd>\n      <dt>Confidence</dt><dd>70%</dd>\n    </dl>\n  </article><article class=\"finding sev-medium\">\n    <header>\n      <span class=\"fid\">F006</span>\n      <h3>Form inputs (pincode, quantity) have no associated labels</h3>\n      <span class=\"pill\" style=\"background:#ffd43b\">medium</span>\n    </header>\n    <p class=\"desc\">The delivery-pincode and quantity inputs rely on placeholders/icons instead of programmatic labels.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>WCAG 2.2 — 3.3.2 Labels or Instructions; forms best practice</dd>\n      <dt>Evidence</dt><dd>1 form with 3 fields and 0 &lt;label&gt; elements in the captured DOM.</dd>\n      <dt>User impact</dt><dd>Screen-reader users can't identify fields; placeholder-only labels disappear on input.</dd>\n      <dt>Recommendation</dt><dd>Add visible, programmatically-associated &lt;label&gt;s for pincode and quantity; keep them visible after focus.</dd>\n      <dt>Confidence</dt><dd>83%</dd>\n    </dl>\n  </article><article class=\"finding sev-medium\">\n    <header>\n      <span class=\"fid\">F007</span>\n      <h3>Quantity and variant tap targets are below 44px</h3>\n      <span class=\"pill\" style=\"background:#ffd43b\">medium</span>\n    </header>\n    <p class=\"desc\">The +/− quantity steppers and colour/variant chips are small and closely spaced for touch.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>Mobile UX; WCAG 2.5.8 Target Size</dd>\n      <dt>Evidence</dt><dd>'+' and '−' steppers present as compact controls; dense variant chips.</dd>\n      <dt>User impact</dt><dd>Mis-taps and frustration on mobile, especially one-handed use.</dd>\n      <dt>Recommendation</dt><dd>Enlarge interactive targets to ≥44×44px with adequate spacing.</dd>\n      <dt>Confidence</dt><dd>68%</dd>\n    </dl>\n  </article><article class=\"finding sev-medium\">\n    <header>\n      <span class=\"fid\">F008</span>\n      <h3>Above-the-fold offers and banners create high cognitive load</h3>\n      <span class=\"pill\" style=\"background:#ffd43b\">medium</span>\n    </header>\n    <p class=\"desc\">Bank offers, exchange offers, coupons and cross-sell all appear at once, competing with the core buying decision.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>Cognitive load; progressive disclosure</dd>\n      <dt>Evidence</dt><dd>'Available offers Bank Offer 5% ...' plus similar-products and multiple promo blocks near the top.</dd>\n      <dt>User impact</dt><dd>Decision paralysis; the core task (choose + buy) is diluted.</dd>\n      <dt>Recommendation</dt><dd>Collapse offers behind a single 'View offers' disclosure; keep the fold focused on product, price, and CTA.</dd>\n      <dt>Confidence</dt><dd>66%</dd>\n    </dl>\n  </article><article class=\"finding sev-low\">\n    <header>\n      <span class=\"fid\">F009</span>\n      <h3>No clear system feedback after 'Add to Cart' on slow connections</h3>\n      <span class=\"pill\" style=\"background:#5fd68f\">low</span>\n    </header>\n    <p class=\"desc\">On slower networks there's no immediate optimistic feedback confirming the item was added.</p>\n    <dl>\n      <dt>Violated principle</dt><dd>Nielsen #1: Visibility of system status</dd>\n      <dt>Evidence</dt><dd>Single 'Add to Cart' button with no captured inline confirmation/toast pattern.</dd>\n      <dt>User impact</dt><dd>Users re-tap or assume failure, creating duplicate adds or drop-off.</dd>\n      <dt>Recommendation</dt><dd>Show immediate optimistic feedback (button state + toast + cart badge increment) on add.</dd>\n      <dt>Confidence</dt><dd>60%</dd>\n    </dl>\n  </article></section>\n\n  <section><h2>Priority Matrix</h2><div class=\"matrix\">\n    <div class=\"cell\"><h4>Do now — high impact, high confidence <span>(5)</span></h4><ul><li>App-install interstitial interrupts the purchase path</li><li>Primary CTAs ('Add to Cart' / 'Buy Now') are not persistent on scroll</li><li>Price, rating, and CTA compete for attention — no single focal point</li><li>Secondary text fails WCAG AA contrast</li><li>Return/replacement policy and seller trust signals aren't near the price</li></ul></div>\n    <div class=\"cell\"><h4>Validate — high impact, lower confidence <span>(0)</span></h4><ul><li class=empty>—</li></ul></div>\n    <div class=\"cell\"><h4>Quick wins — lower impact, high confidence <span>(1)</span></h4><ul><li>Form inputs (pincode, quantity) have no associated labels</li></ul></div>\n    <div class=\"cell\"><h4>Backlog — lower impact, lower confidence <span>(3)</span></h4><ul><li>Quantity and variant tap targets are below 44px</li><li>Above-the-fold offers and banners create high cognitive load</li><li>No clear system feedback after 'Add to Cart' on slow connections</li></ul></div>\n  </div></section>\n\n  <section><h2>Review Process &amp; Decision Log</h2>\n    <p class=\"muted\">This audit ran five independent review passes across 18 UX lenses. Each pass surfaced issues on its own; findings were then merged, de-duplicated by lens + title similarity, ranked by severity, and put through an iterative refinement loop that critiques and strengthens each finding against recognised UX standards. The log below shows why each issue was flagged and how it was rated.</p>\n    <h4 style=\"margin:14px 0 6px\">Refinement loop</h4><table><thead><tr><th>Iteration</th><th class=\"num\">Score</th><th>What changed / why</th></tr></thead><tbody><tr><td class=\"num\">Round 1</td>\n        <td class=\"num\" style=\"color:#ffd43b\">7/10</td>\n        <td>Initial consolidated findings from the five passes; several issues lacked concrete on-page evidence and a justified severity.</td></tr><tr><td class=\"num\">Round 2</td>\n        <td class=\"num\" style=\"color:#5fd68f\">9/10</td>\n        <td>Rewrote each issue to cite specific evidence (status codes, element counts, copy), name the violated principle, justify severity by user impact, and give a concrete fix. Merged two overlapping CTA findings. <b>(selected)</b></td></tr></tbody></table>\n    <h4 style=\"margin:16px 0 6px\">Decision log</h4>\n    <div class=\"decisions\"><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#ff5c5c\">critical</span>\n      <div>\n        <b>F001 — App-install interstitial interrupts the purchase path</b>\n        <div class=\"why\">Flagged under <b>Nielsen #3: User control &amp; freedom; conversion funnel continuity</b> (lens: conversion). Triggered by: Short link (dl.flipkart.com) forces an app-redirect; page includes 'GET IT ON Google Play' and app-open banners.. Rated <b>critical</b> because Mobile-web shoppers ready to buy are pushed out of the flow, dropping conversion. Confidence 86%.</div>\n      </div>\n    </div><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#ff9f43\">high</span>\n      <div>\n        <b>F002 — Primary CTAs ('Add to Cart' / 'Buy Now') are not persistent on scroll</b>\n        <div class=\"why\">Flagged under <b>Nielsen #7: Flexibility &amp; efficiency; Fitts's law</b> (lens: conversion). Triggered by: 9 buttons total; CTAs appear once near the fold with no sticky action bar in the captured structure.. Rated <b>high</b> because Users lose the ability to act at the moment of decision, increasing abandonment. Confidence 80%.</div>\n      </div>\n    </div><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#ff9f43\">high</span>\n      <div>\n        <b>F003 — Price, rating, and CTA compete for attention — no single focal point</b>\n        <div class=\"why\">Flagged under <b>Visual hierarchy; one clear focal point per view</b> (lens: visualHierarchy). Triggered by: Dense above-the-fold block: '₹1,299 ₹2,990 56% off', ratings, and two CTAs stacked with similar weight.. Rated <b>high</b> because Increased time-to-decision; the primary action is easy to miss. Confidence 78%.</div>\n      </div>\n    </div><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#ff9f43\">high</span>\n      <div>\n        <b>F004 — Secondary text fails WCAG AA contrast</b>\n        <div class=\"why\">Flagged under <b>WCAG 2.2 — 1.4.3 Contrast (Minimum)</b> (lens: wcag). Triggered by: Struck-through MRP and muted spec/delivery text render as low-contrast grey per captured styles.. Rated <b>high</b> because Low-vision users and anyone in bright sunlight cannot read key details (price, delivery). Confidence 72%.</div>\n      </div>\n    </div><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#ff9f43\">high</span>\n      <div>\n        <b>F005 — Return/replacement policy and seller trust signals aren't near the price</b>\n        <div class=\"why\">Flagged under <b>Trust &amp; credibility; transparency at decision point</b> (lens: trust). Triggered by: Headings show 'Ratings &amp; Reviews' and 'Similar products' but no policy/seller block near the buy area.. Rated <b>high</b> because Purchase hesitation and post-purchase disputes rise when policy is hidden. Confidence 70%.</div>\n      </div>\n    </div><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#ffd43b\">medium</span>\n      <div>\n        <b>F006 — Form inputs (pincode, quantity) have no associated labels</b>\n        <div class=\"why\">Flagged under <b>WCAG 2.2 — 3.3.2 Labels or Instructions; forms best practice</b> (lens: forms). Triggered by: 1 form with 3 fields and 0 &lt;label&gt; elements in the captured DOM.. Rated <b>medium</b> because Screen-reader users can't identify fields; placeholder-only labels disappear on input. Confidence 83%.</div>\n      </div>\n    </div><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#ffd43b\">medium</span>\n      <div>\n        <b>F007 — Quantity and variant tap targets are below 44px</b>\n        <div class=\"why\">Flagged under <b>Mobile UX; WCAG 2.5.8 Target Size</b> (lens: mobileUX). Triggered by: '+' and '−' steppers present as compact controls; dense variant chips.. Rated <b>medium</b> because Mis-taps and frustration on mobile, especially one-handed use. Confidence 68%.</div>\n      </div>\n    </div><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#ffd43b\">medium</span>\n      <div>\n        <b>F008 — Above-the-fold offers and banners create high cognitive load</b>\n        <div class=\"why\">Flagged under <b>Cognitive load; progressive disclosure</b> (lens: cognitiveLoad). Triggered by: 'Available offers Bank Offer 5% ...' plus similar-products and multiple promo blocks near the top.. Rated <b>medium</b> because Decision paralysis; the core task (choose + buy) is diluted. Confidence 66%.</div>\n      </div>\n    </div><div class=\"decision\">\n      <span class=\"pill\" style=\"background:#5fd68f\">low</span>\n      <div>\n        <b>F009 — No clear system feedback after 'Add to Cart' on slow connections</b>\n        <div class=\"why\">Flagged under <b>Nielsen #1: Visibility of system status</b> (lens: feedbackStatus). Triggered by: Single 'Add to Cart' button with no captured inline confirmation/toast pattern.. Rated <b>low</b> because Users re-tap or assume failure, creating duplicate adds or drop-off. Confidence 60%.</div>\n      </div>\n    </div></div>\n  </section>\n\n  <section><h2>Recommendations</h2>\n    <div class=\"cols\">\n      <div class=\"card\"><h4>Quick Wins</h4><ul><li>Form inputs (pincode, quantity) have no associated labels</li><li>Quantity and variant tap targets are below 44px</li><li>Above-the-fold offers and banners create high cognitive load</li><li>No clear system feedback after 'Add to Cart' on slow connections</li></ul></div>\n      <div class=\"card\"><h4>Long-term Improvements</h4><ul><li>App-install interstitial interrupts the purchase path</li><li>Primary CTAs ('Add to Cart' / 'Buy Now') are not persistent on scroll</li><li>Price, rating, and CTA compete for attention — no single focal point</li><li>Secondary text fails WCAG AA contrast</li><li>Return/replacement policy and seller trust signals aren't near the price</li></ul></div>\n    </div>\n  </section>\n\n  <section class=\"appendix\"><h2>Appendix — Methodology &amp; Confidence</h2>\n    <p>Five independent review passes covering 18 UX lenses (Nielsen heuristics, WCAG, visual hierarchy, Gestalt, IA, interaction, mobile, navigation, conversion, trust, forms, error prevention, content, consistency, cognitive load, progressive disclosure, recognition-vs-recall, feedback). Findings were consolidated, de-duplicated by lens + title similarity, severity-ranked, then improved by an iterative refinement pass. Scores are deductive from severity-weighted findings.</p>\n    <p><b>AI confidence score:</b> 74% (mean confidence across all findings). Confidence is reduced when the captured data only partially supports a claim — for example on client-rendered pages where static DOM signals are limited.</p>\n    <p><b>Capture:</b> DOM + interface metadata capture (no headless browser). Analysis runs on structure + metadata. Client-rendered sections (offers, recommendations) are partially represented in static DOM.</p>\n  </section>\n\n</div></body></html>";
