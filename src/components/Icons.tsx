import React from "react";

// Small stroked icon set — DLS composer, feedback actions, states.
// All 20×20 viewBox, stroke uses currentColor so they inherit button text color.
type P = { size?: number };
const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
});

export const IconAttach = ({ size }: P) => (
  <svg {...base(size)}><path d="M14.5 8.5L8.7 14.3a2.5 2.5 0 01-3.5-3.5l6.5-6.5a4 4 0 015.7 5.7l-6.9 6.9a5.5 5.5 0 01-7.8-7.8l6.3-6.3" /></svg>
);

export const IconLightbulb = ({ size }: P) => (
  <svg {...base(size)}><path d="M9 17h2M8 20h4M10 3a5 5 0 00-3 8.9c.6.5 1 1.3 1 2.1v1h4v-1c0-.8.4-1.6 1-2.1A5 5 0 0010 3z" /></svg>
);

export const IconMic = ({ size }: P) => (
  <svg {...base(size)}><rect x="7.5" y="2.5" width="5" height="9" rx="2.5" /><path d="M5 10a5 5 0 0010 0M10 15v3M7.5 18h5" /></svg>
);

export const IconSend = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3L3 9l6 2 2 6L17 3z"/></svg>
);

export const IconStop = ({ size = 12 }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>
);

export const IconCopy = ({ size }: P) => (
  <svg {...base(size)}><rect x="6" y="6" width="10" height="12" rx="2" /><path d="M4 14V5a2 2 0 012-2h9" /></svg>
);

export const IconThumbUp = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 10v7h2v-7H4zm4 7h7l2.5-6c.3-.8-.3-1.7-1.2-1.7H12V6c0-1.1-.9-2-2-2h-.5L8 8v9z" /></svg>
);

export const IconThumbDown = ({ size }: P) => (
  <svg {...base(size)}><path d="M16 10V3h-2v7h2zm-4-7H5L2.5 9c-.3.8.3 1.7 1.2 1.7H8V14c0 1.1.9 2 2 2h.5L12 12V3z" /></svg>
);

// Sidebar palette icons — outlined 20×20 to replace the ASCII glyphs.
export const IconText = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 5h12M10 5v11M7 16h6" /></svg>
);
export const IconSparkle = ({ size }: P) => (
  <svg {...base(size)}><path d="M10 3v14M3 10h14M6 6l8 8M14 6l-8 8" /></svg>
);
export const IconTemplate = ({ size }: P) => (
  <svg {...base(size)}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></svg>
);
export const IconImage = ({ size }: P) => (
  <svg {...base(size)}><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7" cy="8.5" r="1.2" /><path d="M17 13l-4-4-6 6" /></svg>
);
export const IconRefresh = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 10a7 7 0 0111.5-5.4M17 10a7 7 0 01-11.5 5.4" /><path d="M14 4v3h3M6 16v-3H3" /></svg>
);
export const IconPlug = ({ size }: P) => (
  <svg {...base(size)}><path d="M7 3v4M13 3v4M5 7h10v4a5 5 0 01-10 0V7zM10 16v2" /></svg>
);
export const IconArrowOut = ({ size }: P) => (
  <svg {...base(size)}><path d="M5 10h10M11 6l4 4-4 4" /></svg>
);
export const IconGlobe = ({ size }: P) => (
  <svg {...base(size)}><circle cx="10" cy="10" r="7.5" /><path d="M2.5 10h15M10 2.5c2.5 3 2.5 12 0 15M10 2.5c-2.5 3-2.5 12 0 15" /></svg>
);
export const IconSearch = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="9" r="5" /><path d="M13 13l4 4" /></svg>
);
export const IconMerge = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 3v6a5 5 0 005 5h4M14 3v3M14 3l-3 3M14 3l3 3" /></svg>
);
export const IconReport = ({ size }: P) => (
  <svg {...base(size)}><rect x="4" y="3" width="12" height="14" rx="1.5" /><path d="M7 7h6M7 10h6M7 13h4" /></svg>
);
export const IconStar = ({ size }: P) => (
  <svg {...base(size)}><path d="M10 3l2.5 5 5.5.8-4 3.9.9 5.5L10 15.5l-4.9 2.6.9-5.5-4-3.9 5.5-.8L10 3z" /></svg>
);
export const IconCheck = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 10.5l4 4 8-8" /></svg>
);
