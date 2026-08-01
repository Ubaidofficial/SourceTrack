import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

// Homepage collection
const homepageCollection = defineCollection({
  loader: glob({ pattern: "**/-*.{md,mdx}", base: "src/content/homepage" }),
  schema: z.object({}).catchall(z.any()),
});

// Blog collection
const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/blog" }),
  schema: z.object({
    title: z.string(),
    meta_title: z.string().optional(),
    description: z.string().optional(),
    date: z.coerce.date().optional(),
    image: z.string().optional(),
    category: z.string().optional(),
    featured: z.boolean().optional(),
    author: z.object({
      name: z.string(),
      avatar: z.string().optional(),
      designation: z.string().optional(),
    }).optional(),
    draft: z.boolean().optional(),
  }),
});

// Changelog collection
const changelogCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/changelog" }),
  schema: z.object({}).catchall(z.any()),
});

// Contact collection
const contactCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/contact" }),
  schema: z.object({}).catchall(z.any()),
});

// Integrations collection
const integrationsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/integrations" }),
  schema: z.object({}).catchall(z.any()),
});

// Pages collection
const pagesCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/pages" }),
  schema: z.object({}).catchall(z.any()),
});

// Pricing collection
const pricingCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/pricing" }),
  schema: z.object({}).catchall(z.any()),
});

// Sections collection
const sectionsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/sections" }),
  schema: z.object({}).catchall(z.any()),
});

// Developers collection — the /developers/* reference pages. Mirrors `integrations`:
// `-index.md` holds the hub's own copy and is filtered out of getStaticPaths by
// getSinglePage(), so it never generates a route of its own.
const developersCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/developers" }),
  schema: z.object({}).catchall(z.any()),
});

// Standalone collection — copy for pages that keep their OWN .astro markup (dpa, security,
// subprocessors, solutions/*, demo, compare/ga4). Deliberately NOT the `pages` collection:
// every entry there becomes a route via [regular].astro, which would collide with the .astro
// file already serving that path. Nothing routes off this collection.
const standaloneCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/standalone" }),
  schema: z.object({}).catchall(z.any()),
});

// Glossary collection — one file per docs-hub glossary term. A collection rather than a nested
// YAML array so terms can be added, edited and reordered individually; `order` in the frontmatter
// fixes the sequence, because the glob loader sorts by id and would otherwise reshuffle them.
const glossaryCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/glossary" }),
  schema: z.object({}).catchall(z.any()),
});

// Export collections
export const collections = {
  homepage: homepageCollection,
  blog: blogCollection,
  changelog: changelogCollection,
  contact: contactCollection,
  integrations: integrationsCollection,
  pages: pagesCollection,
  pricing: pricingCollection,
  sections: sectionsCollection,
  developers: developersCollection,
  standalone: standaloneCollection,
  glossary: glossaryCollection,
};
