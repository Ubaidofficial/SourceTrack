#!/usr/bin/env node
// SELF-HOSTED FONT PRESENCE CHECK.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// An @font-face whose `src` file is missing does not fail the build, does not warn,
// and does not log. The browser silently falls back to system-ui and the page ships
// in the wrong typeface with every other check green. There is no stage of the
// existing pipeline that would catch it: Astro does not resolve public/ URLs at build
// time, `astro check` type-checks TS rather than CSS, and qa-marketing-html.mjs reads
// markup rather than font bytes.
//
// ── WHY IT EXISTS EVEN THOUGH NOTHING IS SELF-HOSTED TODAY ──────────────────
// As of v1.5 all three families (Schibsted Grotesk, Instrument Serif, JetBrains Mono)
// are OFL and go through Astro's provider, so there is no vendored file and this
// script's first check has nothing to inspect. That is the correct state, not a
// reason to delete the guard.
//
// It was written during v1.5 against a real defect and CAUGHT IT: the handoff
// specifies Switzer, which is Fontshare-only (no npm package, no Astro provider —
// four candidate package names all 404), so it was briefly wired as a hand-vendored
// @font-face. The file was not there. The build passed, `astro check` passed, all
// three CI marketing gates passed, and the site rendered in system-ui — the browser
// reported `Switzer error` and nothing else did. Switzer was then dropped for a
// licence reason (see src/styles/fonts.css), which removed the vendored file but not
// the failure mode: the next person to add a self-hosted face will hit it again.
//
// ── WHAT IT CHECKS, AND WHAT IT DOES NOT ────────────────────────────────────
// CHECKS:   every `src: url(/fonts/…)` in src/styles/fonts.css resolves to a real,
//           non-empty file under public/fonts, and that each is a real WOFF2 (magic
//           bytes `wOF2`) rather than an HTML error page saved with a .woff2 name —
//           which is what a failed CDN download actually leaves behind.
// CHECKS:   every family in theme.json's `self_hosted` array has a matching @font-face
//           in fonts.css. A family marked self-hosted but never declared gets skipped
//           by BOTH astro.config.mjs and Base.astro, so it loads from nowhere at all.
// DOES NOT: verify the font is the RIGHT font, that its weight axis matches the
//           declared range, or that its licence permits redistribution. Those are
//           human checks. A guard that overstates its coverage is the false-pass
//           class this repo has hit repeatedly — so the limit is stated, not implied.

import { readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONTS_CSS = join(ROOT, 'src/styles/fonts.css')
const PUBLIC = join(ROOT, 'public')
const THEME = join(ROOT, 'src/config/theme.json')

const WOFF2_MAGIC = 'wOF2'
const failures = []

// Strip /* … */ comments before scanning. The prose in fonts.css deliberately quotes
// the very patterns this script matches — `src: url(/fonts/…)` appears in the comment
// explaining the failure mode — and scanning raw text reported that documentation as a
// missing file. The comment is the lesson; the guard has to read around it. Same fix,
// same reason, as api/tests/v3-lift-detection.test.js.
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '')

// ── 1. Every referenced file exists, is non-empty, and is really a WOFF2. ──
const css = stripComments(readFileSync(FONTS_CSS, 'utf8'))
const refs = [...css.matchAll(/src:\s*url\(["']?(\/fonts\/[^"')]+)["']?\)/g)].map(m => m[1])

// NOTE: zero refs is the CORRECT state as of v1.5 — all three families are OFL and go
// through Astro's provider, so nothing is vendored. It is NOT reported as a failure on
// its own. What must hold is that fonts.css and theme.json AGREE: zero faces here means
// self_hosted must be empty, which check 2 enforces from the other direction. Failing on
// an empty list would make the guard fire permanently and get it muted, which is the way
// a guard stops guarding.

for (const ref of refs) {
  const file = join(PUBLIC, ref)
  if (!existsSync(file)) {
    failures.push(
      `MISSING: ${ref}\n` +
      `    fonts.css references it, so the browser will request it and get a 404.\n` +
      `    The page then renders in the fallback family with no error anywhere.\n` +
      `    Vendor the file to marketing/public${ref}.`
    )
    continue
  }
  const size = statSync(file).size
  if (size === 0) {
    failures.push(`EMPTY: ${ref} is 0 bytes.`)
    continue
  }
  const head = readFileSync(file).subarray(0, 4).toString('latin1')
  if (head !== WOFF2_MAGIC) {
    failures.push(
      `NOT A WOFF2: ${ref} (${size} bytes) starts with ${JSON.stringify(head)}, ` +
      `expected ${JSON.stringify(WOFF2_MAGIC)}.\n` +
      `    A failed download saved under the right name looks exactly like this.`
    )
  }
}

// ── 2. Every self_hosted family in theme.json is actually declared. ──
const theme = JSON.parse(readFileSync(THEME, 'utf8'))
const selfHosted = theme.fonts?.self_hosted ?? []
const families = [...css.matchAll(/font-family:\s*["']([^"']+)["']/g)].map(m => m[1].toLowerCase())

for (const key of selfHosted) {
  const spec = theme.fonts?.font_family?.[key]
  if (!spec) {
    failures.push(`theme.json self_hosted names "${key}", which has no font_family entry.`)
    continue
  }
  // "Schibsted Grotesk:wght@400;500" -> "schibsted grotesk"
  const name = spec.split(':')[0].replace(/\+/g, ' ').trim().toLowerCase()
  if (!families.includes(name)) {
    failures.push(
      `NO @font-face for "${name}" (theme.json self_hosted key "${key}").\n` +
      `    astro.config.mjs skips the provider for self_hosted families and Base.astro\n` +
      `    skips <Font> for them, so with no @font-face here it loads from nowhere.`
    )
  }
}

if (failures.length) {
  console.error(`\n✖ Self-hosted font check FAILED (${failures.length}):\n`)
  for (const f of failures) console.error(`  • ${f}\n`)
  process.exit(1)
}

// Report the all-provider state explicitly rather than printing a bare "OK" that reads the
// same whether it verified four files or zero. A check whose green output does not say what
// it checked is indistinguishable from a check that did nothing.
if (refs.length === 0 && selfHosted.length === 0) {
  console.log('✓ Fonts OK — no self-hosted faces; all families route through the build-time provider.')
} else {
  console.log(`✓ Self-hosted fonts OK — ${refs.length} file(s) present and valid WOFF2.`)
}
