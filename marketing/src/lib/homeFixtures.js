/**
 * Homepage fixture dataset — ported from the design handoff's
 * `source/lib/demo-data.jsx` (design.md v1.4 §3.1 bundle).
 *
 * Every figure rendered on the homepage derives from THIS file, so the KPI
 * tiles, the channel table, the nine attribution models, the journey scrubber
 * and the GA4 comparison always reconcile with each other. Changing a number
 * here changes it everywhere consistently — which is the point: the page's own
 * claim is that switching models never moves the total.
 *
 * ILLUSTRATIVE DATA. No customer or live-account data. The single global
 * disclosure lives in Footer.astro ("Product visuals shown use illustrative
 * data.", design.md §29.8) — do not add a second one per section.
 */

export const DEMO_RANGE = {
  label: "Jul 4 – Aug 2, 2026",
  days: 30,
  start: "Jul 4",
  end: "Aug 2",
};

// --- Channels: the single source of truth -----------------------------------
export const CHANNELS = [
  { key: "paid-search", name: "Paid Search", sub: "Google Ads", visitors: 1568, leads: 72, conv: 34, rev: 7080 },
  { key: "organic", name: "Organic Search", sub: "Google", visitors: 1432, leads: 61, conv: 28, rev: 5410 },
  { key: "direct", name: "Direct", sub: "Direct / none", visitors: 2541, leads: 68, conv: 29, rev: 4940 },
  { key: "ai", name: "AI Search", sub: "ChatGPT, Gemini, Claude +19", visitors: 642, leads: 38, conv: 19, rev: 2480 },
  { key: "paid-social", name: "Paid Social", sub: "LinkedIn + Meta", visitors: 596, leads: 25, conv: 10, rev: 1040 },
  { key: "referral", name: "Referral", sub: "Partner websites", visitors: 524, leads: 20, conv: 6, rev: 480 },
];

const sum = (k) => CHANNELS.reduce((a, c) => a + c[k], 0);

export const TOTALS = {
  visitors: sum("visitors"),
  leads: sum("leads"),
  conv: sum("conv"),
  rev: sum("rev"),
};
TOTALS.cvr = (TOTALS.conv / TOTALS.visitors) * 100; // 1.73%
TOTALS.v2l = (TOTALS.leads / TOTALS.visitors) * 100; // 3.89%
TOTALS.l2c = (TOTALS.conv / TOTALS.leads) * 100; // 44.4%

/**
 * Largest-remainder allocation, so any weighted split sums EXACTLY to the
 * total. Naive rounding leaks a dollar or two, and the page's whole argument is
 * that the total does not move when the model changes — a rounding drift would
 * make the copy a lie.
 */
export function allocate(total, weights) {
  const wsum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / wsum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => [v - Math.floor(v), i])
    .sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0; i++, left--) out[order[i % order.length][1]] += 1;
  return out;
}

// --- Attribution models: reweight the same $21,430 --------------------------
export const MODELS = [
  {
    id: "first",
    label: "First touch",
    w: { "paid-search": 7080, organic: 5410, direct: 4940, ai: 2480, "paid-social": 1040, referral: 480 },
    note: "Credit goes to the first recorded touch. Discovery channels look strongest.",
  },
  {
    id: "last",
    label: "Last touch",
    w: { "paid-search": 5180, organic: 4060, direct: 7940, ai: 1780, "paid-social": 1880, referral: 590 },
    note: "Credit goes to the final touch before the conversion, which inflates Direct.",
  },
  {
    id: "linear",
    label: "Linear",
    w: { "paid-search": 6120, organic: 5290, direct: 5410, ai: 2610, "paid-social": 1480, referral: 520 },
    note: "Every touch in the path shares credit equally.",
  },
  {
    id: "pos",
    label: "Position-based",
    w: { "paid-search": 6640, organic: 5120, direct: 5880, ai: 2410, "paid-social": 1010, referral: 370 },
    note: "40% first, 40% last, 20% spread across the middle touches.",
  },
  {
    id: "decay",
    label: "Time decay",
    w: { "paid-search": 5680, organic: 4820, direct: 6760, ai: 2140, "paid-social": 1520, referral: 510 },
    note: "Credit increases the closer a touch sits to the conversion date.",
  },
  {
    id: "w",
    label: "W-shaped",
    w: { "paid-search": 6480, organic: 5240, direct: 6120, ai: 2260, "paid-social": 940, referral: 390 },
    note: "30% each to first touch, lead creation and last touch — 10% to the middle.",
  },
  {
    id: "full",
    label: "Full path",
    w: { "paid-search": 6320, organic: 5180, direct: 6040, ai: 2340, "paid-social": 1120, referral: 430 },
    note: "First touch, lead creation, opportunity and closed-won each take 22.5%.",
  },
  {
    id: "nondirect",
    label: "Last non-direct",
    w: { "paid-search": 7640, organic: 5980, direct: 2210, ai: 3480, "paid-social": 1560, referral: 560 },
    note: "Direct hands its credit back to the last known source — the honest read of a return visit.",
  },
  {
    id: "custom",
    label: "Custom weights",
    w: { "paid-search": 6130, organic: 4740, direct: 6440, ai: 2130, "paid-social": 1455, referral: 535 },
    note: "Your own split. This one is set to 50% first touch, 50% last touch.",
  },
];

export function modelRevenue(modelId) {
  const m = MODELS.find((x) => x.id === modelId) || MODELS[0];
  const alloc = allocate(TOTALS.rev, CHANNELS.map((c) => m.w[c.key]));
  const out = {};
  CHANNELS.forEach((c, i) => {
    out[c.key] = alloc[i];
  });
  return out;
}

// --- AI engines detected ----------------------------------------------------
// 16 = the number of distinct assistants / answer engines the live classifier
// resolves to (the canonical label set of AI_DOMAINS_MAP in
// api/lib/channel-classifier.js), NOT a domain count — it matches on 23 hosts,
// several of which are the same product (chatgpt.com and openai.com both mean
// ChatGPT). The old value here was 22, copied from AI_REFERRER_DOMAINS, a dead
// export that nothing read and that had already drifted one entry out of sync
// with the live map. Do not restore a domain-based figure: it changes every time
// an alias is added, and it overstates coverage to a reader.
//
// Renamed from AI_DOMAINS deliberately — the old name would have made "16" read
// as a count of domains, which is the exact confusion that produced the wrong
// number in the first place.
//
// Guarded: api/tests/ai-assistant-count-copy.test.js asserts the shipped
// homepage copy matches the classifier's label count.
export const AI_ASSISTANTS = 16;

// Fixture rows below sum to the AI Search channel exactly: 642 visitors,
// 19 conversions, $2,480.
export const AI_ENGINES = [
  { key: "chatgpt", name: "ChatGPT", host: "chatgpt.com", visitors: 268, conv: 8, rev: 1180 },
  { key: "gemini", name: "Gemini", host: "gemini.google.com", visitors: 132, conv: 4, rev: 520 },
  { key: "claude", name: "Claude", host: "claude.ai", visitors: 96, conv: 3, rev: 410 },
  { key: "perplexity", name: "Perplexity", host: "perplexity.ai", visitors: 88, conv: 3, rev: 250 },
  { key: "copilot", name: "Copilot", host: "copilot.microsoft.com", visitors: 42, conv: 1, rev: 120 },
];
export const AI_OTHER = { visitors: 16, conv: 0, rev: 0, engines: 17 };

// --- Live visitors (realtime panel) -----------------------------------------
// Pseudonymous by design: SourceTrack sets no cookie and stores no name, so a
// session shows up as a stable animal alias derived from its anonymous id.
export const LIVE = [
  { id: "a4f2c9e1", alias: "Wise Dolphin", flag: "🇧🇷", dev: "mobile", path: "/pricing", label: "ChatGPT", secs: 6 },
  { id: "b71d0e55", alias: "Quick Raven", flag: "🇺🇸", dev: "desktop", path: "/", label: "Google Ads", secs: 12 },
  { id: "c93a4b07", alias: "Bright Koala", flag: "🇩🇪", dev: "desktop", path: "/attribution", label: "Organic", secs: 24 },
  { id: "d18f6c2a", alias: "Calm Otter", flag: "🇬🇧", dev: "mobile", path: "/compare/ga4", label: "LinkedIn", secs: 38 },
  { id: "e6b25d94", alias: "Swift Panther", flag: "🇨🇦", dev: "desktop", path: "/blog/utm-tracking", label: "Perplexity", secs: 52 },
  { id: "f0c78a31", alias: "Bold Falcon", flag: "🇮🇳", dev: "desktop", path: "/demo", label: "Direct", secs: 71 },
  { id: "2a5e91cf", alias: "Keen Heron", flag: "🇦🇺", dev: "mobile", path: "/integrations", label: "Meta Ads", secs: 94 },
  { id: "3b6f28ad", alias: "Warm Lynx", flag: "🇫🇷", dev: "desktop", path: "/pricing", label: "Gemini", secs: 118 },
];
export const LIVE_PATHS = [
  "/pricing",
  "/attribution",
  "/demo",
  "/integrations",
  "/compare/ga4",
  "/blog/utm-tracking",
  "/",
  "/features",
];

// --- The lead the journey scrubber and the "with attribution" card share -----
// Marketing page and product tell one story, so both read this single record.
export const FEATURED_LEAD = {
  emoji: "👩🏾‍💼",
  name: "Amara Osei",
  email: "amara@northwind.example",
  ch: "AI Search",
  status: "Customer",
  value: 1480,
  journey: [
    {
      t: "Jul 9 · 10:12",
      kind: "visit",
      ttl: "Discovered us in ChatGPT",
      src: "chatgpt",
      page: "/compare/ga4",
      kv: [["Referrer", "chatgpt.com"], ["Channel", "AI Search"], ["UTMs present", "No — inferred"]],
    },
    {
      t: "Jul 12 · 20:47",
      kind: "visit",
      ttl: "Checked us in Perplexity",
      src: "perplexity",
      page: "/attribution",
      kv: [["Referrer", "perplexity.ai"], ["Channel", "AI Search"], ["Cited page", "/attribution"]],
    },
    {
      t: "Jul 15 · 08:41",
      kind: "visit",
      ttl: "Returned via branded search",
      src: "google-organic",
      page: "/pricing",
      kv: [["Referrer", "google.com"], ["Medium", "organic"], ["Query group", "branded"]],
    },
    {
      t: "Jul 18 · 12:09",
      kind: "visit",
      ttl: "Clicked a LinkedIn retargeting ad",
      src: "linkedin-ads",
      page: "/demo",
      kv: [["Campaign", "retarget_visitors_q3"], ["li_fat_id", "b7c1…4e"], ["Creative", "single_image_02"]],
    },
    {
      t: "Jul 21 · 14:03",
      kind: "form",
      ttl: "Asked Claude, then filled the demo form",
      src: "claude",
      page: "/demo",
      kv: [["Referrer", "claude.ai"], ["Form", "HubSpot · Request demo"], ["First touch", "AI Search"]],
    },
    {
      t: "Jul 28 · 16:22",
      kind: "pay",
      ttl: "Stripe payment captured",
      src: "direct",
      page: "/checkout",
      kv: [["Amount", "$1,480.00"], ["Plan", "Growth · annual"], ["Attributed to", "AI Search (first touch)"]],
    },
  ],
};

export const SRC_LABEL = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  copilot: "Copilot",
  "google-organic": "Google organic",
  "google-ads": "Google Ads",
  "linkedin-ads": "LinkedIn Ads",
  linkedin: "LinkedIn",
  meta: "Meta Ads",
  direct: "Direct",
  referral: "Referral",
};

export const KIND_LABEL = {
  visit: "Page view",
  form: "Form fill",
  chat: "Chat",
  meet: "Meeting booked",
  pay: "Payment",
};

export const AI_SRCS = ["chatgpt", "claude", "gemini", "perplexity", "copilot"];

export const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
