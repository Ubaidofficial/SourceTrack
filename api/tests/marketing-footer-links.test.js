// Marketing footer links must resolve to a page that actually exists.
//
// WHY THIS EXISTS: the #501 UI audit flagged the footer as missing Comparisons AND Status.
// Comparisons was addable (/compare/ga4 ships). Status was NOT — there is no /status page,
// so adding that link would have shipped a footer entry that 404s. A footer link is a
// promise that a page exists; a link to nothing is a §6 falsehood in the most-visited
// component on the site, and nothing in the build would have caught it (Astro does not fail
// on a dead internal href).
//
// So this asserts every internal footer URL is backed by one of:
//   · a page file            marketing/src/pages/<path>.astro   (or <path>/index.astro)
//   · a content-collection md marketing/src/content/pages/<slug>.md  (served by [regular].astro)
//
// It intentionally does NOT check the main nav — nav was deliberately cut to 4 items in #494
// and is a separate decision surface. Extend deliberately, not by reflex.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MARKETING = join(__dirname, '..', '..', 'marketing', 'src')
const menu = JSON.parse(readFileSync(join(MARKETING, 'config', 'menu.json'), 'utf8'))

const FOOTER_GROUPS = ['footer_company', 'footer_resource', 'footer_legal']

// Slugs served by the [regular].astro catch-all out of the pages content collection.
const contentSlugs = new Set(
  readdirSync(join(MARKETING, 'content', 'pages'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
)

function resolves (url) {
  if (url === '/') return true
  const path = url.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!path) return true

  // An explicit page file, or a directory index.
  if (existsSync(join(MARKETING, 'pages', `${path}.astro`))) return true
  if (existsSync(join(MARKETING, 'pages', path, 'index.astro'))) return true

  // A content-collection page (single-segment slugs only — that is what the catch-all serves).
  if (!path.includes('/') && contentSlugs.has(path)) return true

  return false
}

const allFooterLinks = FOOTER_GROUPS.flatMap((group) =>
  (menu[group] || []).map((item) => ({ group, ...item }))
)

test('the footer groups exist and are non-empty', () => {
  for (const group of FOOTER_GROUPS) {
    assert.ok(Array.isArray(menu[group]), `${group} must be an array`)
    assert.ok(menu[group].length > 0, `${group} must not be empty`)
  }
})

test('every footer link has both a name and a url', () => {
  for (const link of allFooterLinks) {
    assert.ok(link.name, `${link.group}: a link is missing a name`)
    assert.ok(link.url, `${link.group}/${link.name}: missing url`)
  }
})

test('EVERY internal footer link resolves to a real page — no 404 promises', () => {
  const dead = allFooterLinks
    .filter((l) => l.url.startsWith('/'))
    .filter((l) => !resolves(l.url))
    .map((l) => `${l.group}/${l.name} -> ${l.url}`)

  assert.deepEqual(
    dead,
    [],
    'these footer links point at pages that do not exist. Build the page or remove the link — ' +
    'a footer entry is a promise the page is there.'
  )
})

test('the Roadmap link is present and points at the page shipped in #504', () => {
  const roadmap = allFooterLinks.find((l) => l.url === '/roadmap')
  assert.ok(roadmap, 'the footer must link /roadmap')
  assert.ok(resolves('/roadmap'), '/roadmap must be backed by a real page')
})

test('Comparisons points at the canonical /compare/ga4, not the bare redirect', () => {
  // marketing/src/pages/compare/index.astro is a bare `Astro.redirect(..., 301)`. Linking
  // /compare would work but cost every visitor a redirect hop for no reason.
  const cmp = allFooterLinks.find((l) => l.name === 'Comparisons')
  assert.ok(cmp, 'the footer must link Comparisons')
  assert.equal(cmp.url, '/compare/ga4', 'link the destination, not the 301')
})

test('no Status link until a /status page exists', () => {
  // The #501 audit asked for a Status link and noted the page does not exist. This is the
  // guard for that: the link may only appear once something serves it. If you build
  // /status, this test starts permitting the link rather than blocking it.
  const status = allFooterLinks.find((l) => l.url === '/status' || l.name === 'Status')
  if (status) {
    assert.ok(resolves('/status'), 'a Status link requires a real /status page — none exists today')
  }
})

test('no duplicate URLs within a single footer group', () => {
  for (const group of FOOTER_GROUPS) {
    const urls = (menu[group] || []).map((i) => i.url)
    assert.equal(new Set(urls).size, urls.length, `${group} has a duplicate url`)
  }
})
