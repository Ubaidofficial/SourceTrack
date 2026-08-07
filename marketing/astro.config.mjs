import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import AutoImport from "astro-auto-import";
import { defineConfig, fontProviders } from "astro/config";
import remarkCollapse from "remark-collapse";
import remarkToc from "remark-toc";
import sharp from "sharp";
import config from "./src/config/config.json";
import theme from "./src/config/theme.json";

// Helper to parse font string format: "FontName:wght@400;500;600;700"
function parseFontString(fontStr) {
  const [name, weightPart] = fontStr.split(":");
  let weights = [400];

  if (weightPart) {
    const weightMatch = weightPart.match(/wght@?([\d;]+)/);
    if (weightMatch) {
      weights = weightMatch[1].split(";").map((w) => parseInt(w, 10));
    }
  }

  const cleanName = name.replace(/\+/g, " ");
  return { name: cleanName, weights };
}

// Families listed in theme.json's `self_hosted` array are served from
// marketing/public/fonts via a hand-written @font-face in src/styles/fonts.css
// (design.md §3.1 — Geist + Geist Mono self-hosted, no third-party font host).
// They still earn a --font-<key> token from theme.json so Tailwind can build the
// utility, but they must NOT be routed through a remote provider here: that would
// register a second, competing @font-face for the same family.
//
// Base.astro reads the same array to skip rendering <Font> for these — keep the
// two in sync via theme.json, never by duplicating the list.
const SELF_HOSTED_FONTS = new Set(theme.fonts.self_hosted || []);

// Build fonts configuration from theme.json
const fontsConfig = Object.entries(theme.fonts.font_family)
  .filter(([key]) => !key.includes("_type") && !SELF_HOSTED_FONTS.has(key))
  .map(([key, fontStr]) => {
    const { name, weights } = parseFontString(fontStr);
    const typeKey = `${key}_type`;
    const fallback = theme.fonts.font_family[typeKey] || "sans-serif";

    return {
      name,
      cssVariable: `--font-${key}`,
      provider: fontProviders.google(),
      weights,
      display: "swap",
      fallbacks: [fallback],
    };
  });

// https://astro.build/config
export default defineConfig({
  site: config.site.base_url ? config.site.base_url : "http://examplesite.com",
  base: config.site.base_path ? config.site.base_path : "/",
  trailingSlash: config.site.trailing_slash ? "always" : "never",
  image: { service: sharp() },
  vite: {
    plugins: [tailwindcss()],
    server: { watch: { ignored: ["**/.claude/**"] } },
  },
  fonts: fontsConfig,
  // /v3/* redirects — the preview paths were shared and may be linked or indexed, so they
  // must survive the cutover rather than 404. NOTE WHAT THESE COMPILE TO: this project is
  // static (no `output`/`adapter` set, so Astro defaults to output:'static'), and the static
  // build emits redirects as META-REFRESH HTML, not 301s. Verified empirically, not assumed:
  // dist/compare/index.html already ships `http-equiv="refresh" content="0;url=/compare/ga4"`
  // from the existing compare redirect. That is fine for a human following an old link; it is
  // NOT a 301 and search engines treat it more weakly. If a true 301 is wanted for these,
  // it belongs at the Railway/edge layer — it cannot be produced from this file.
  redirects: {
    "/v3": "/",
    "/v3/pricing": "/pricing",
    "/v3/compare-ga4": "/compare/ga4",
    "/v3/product": "/product",
    "/v3/report-builder": "/report-builder",
    "/v3/use-cases-saas": "/use-cases-saas",
    "/v3/use-cases-ecommerce": "/use-cases-ecommerce",
    "/v3/attribution": "/attribution",
    "/v3/ai-referral-tracking": "/ai-referral-tracking",
  },
  integrations: [
    react(),
    // The /v3 filter was removed at the cutover. It existed because /v3 was a
    // noindex PREVIEW route, and a noindex page listed in the sitemap is a
    // contradiction — it tells crawlers "index this" and "do not index this" at
    // once, and Search Console reports it as an error rather than ignoring it.
    // Those pages are now the live routes (/, /pricing, /compare/ga4, /product,
    // /report-builder, /use-cases-saas, /use-cases-ecommerce, /attribution,
    // /ai-referral-tracking), they carry no noindex, and /v3/* no longer exists
    // as a source route — so there is nothing left to filter and the two signals
    // already agree. Re-adding a filter here would silently drop live pages.
    sitemap(),
    AutoImport({
      imports: [
        "@/shortcodes/Button",
        "@/shortcodes/Accordion",
        "@/shortcodes/Notice",
        "@/shortcodes/Video",
        "@/shortcodes/Youtube",
        "@/shortcodes/Tabs",
        "@/shortcodes/Tab",
      ],
    }),
    mdx(),
  ],
  markdown: {
    remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
    shikiConfig: { theme: "one-dark-pro", wrap: true },
  },
});
