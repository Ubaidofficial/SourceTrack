// AI-source canonicalization parity (KI-32). Before this, three files each classified AI sources
// their own way: channel-classifier.js (canonical, read side), ai-platform.js (ingest middleware,
// title-cased UTM -> 'Chatgpt'), and proxy.js (a third host map). Same source, up to three strings,
// three GROUP BY buckets. These tests pin that ALL ingest paths now emit the ONE canonical label,
// and that the two path-based special cases survive — the assertion whose absence let it drift.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { detectAIPlatform } from '../middleware/ai-platform.js'
import { detectAiPlatformFromReferrer, resolveAiSource, AI_UTM_SOURCES_MAP } from '../lib/channel-classifier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Run the ingest middleware and read the ai_source it stamps.
function midAi ({ referer, utm_source, ai_source } = {}) {
  const req = { headers: referer ? { referer } : {}, query: {}, body: {} }
  if (utm_source !== undefined) req.body.utm_source = utm_source
  if (ai_source !== undefined) req.body.ai_source = ai_source
  detectAIPlatform(req, {}, () => {})
  return req.ai_source
}

// ── 1. All three ingest paths emit the SAME canonical string for one source ──────────────────
test('referrer, UTM, and explicit paths all emit the identical canonical label for ChatGPT', () => {
  const viaReferrer = midAi({ referer: 'https://chatgpt.com/' })
  const viaUtm      = midAi({ utm_source: 'chatgpt' })
  const viaExplicit = midAi({ ai_source: 'chatgpt.com' })
  assert.equal(viaReferrer, 'ChatGPT')
  assert.equal(viaUtm, 'ChatGPT', "UTM used to title-case to 'Chatgpt'")
  assert.equal(viaExplicit, 'ChatGPT', 'explicit host value is canonicalized, not passed verbatim')
  assert.equal(viaReferrer, viaUtm)
  assert.equal(viaUtm, viaExplicit)
})

// ── 2. Cross-originator: proxy referrer == middleware referrer for the same host ──────────────
// Both call detectAiPlatformFromReferrer (proxy.js:105, ai-platform.js), so this is parity by
// construction — the test pins it so a future fork can't silently diverge again.
test('proxy and middleware classify the same referrer host identically', () => {
  for (const host of ['chatgpt.com', 'claude.ai', 'perplexity.ai', 'gemini.google.com', 'grok.com']) {
    const proxyLabel = detectAiPlatformFromReferrer(`https://${host}/`)   // proxy.js path
    const midLabel   = midAi({ referer: `https://${host}/` })             // middleware path
    assert.equal(proxyLabel, midLabel, `${host} must classify identically on both originators`)
    assert.ok(proxyLabel, `${host} classifies as AI`)
  }
})

// ── 3. The 6 UTM keys the title-case path got WRONG are now canonical ─────────────────────────
test('previously title-cased UTM keys now emit the canonical label', () => {
  assert.equal(midAi({ utm_source: 'openai' }), 'ChatGPT')      // was 'Openai'
  assert.equal(midAi({ utm_source: 'anthropic' }), 'Claude')    // was 'Anthropic'
  assert.equal(midAi({ utm_source: 'bard' }), 'Gemini')         // was 'Bard'
  assert.equal(midAi({ utm_source: 'xai' }), 'Grok')            // was 'Xai'
  assert.equal(midAi({ utm_source: 'deepseek' }), 'DeepSeek')   // was 'Deepseek'
  assert.equal(midAi({ utm_source: 'chatgpt' }), 'ChatGPT')     // was 'Chatgpt'
})

// ── 4. Coverage preserved: the 9 orphan UTM keys still resolve (naive import would drop them) ──
test('orphan UTM keys folded into the canonical map still resolve (incl. Meta AI)', () => {
  assert.equal(AI_UTM_SOURCES_MAP['meta-ai'], 'Meta AI')
  assert.equal(AI_UTM_SOURCES_MAP['meta.ai'], 'Meta AI')
  assert.equal(midAi({ utm_source: 'google-gemini' }), 'Gemini')
  assert.equal(midAi({ utm_source: 'microsoft-copilot' }), 'Copilot')
  assert.equal(midAi({ utm_source: 'deep-seek' }), 'DeepSeek')
})

// ── 5. Explicit branch is reject-unknown (no arbitrary value reaches ai_source) ───────────────
test('explicit ai_source is canonicalized or dropped to null — never trusted verbatim', () => {
  assert.equal(midAi({ ai_source: 'ChatGPT' }), 'ChatGPT', 'already-canonical passes through')
  assert.equal(midAi({ ai_source: 'chatgpt' }), 'ChatGPT', 'utm-key form resolves')
  assert.equal(resolveAiSource('totally-made-up'), null)
  assert.equal(midAi({ ai_source: 'totally-made-up' }), null, 'unknown value is rejected, not stored')
  assert.equal(midAi({ ai_source: 'https://evil.example.com' }), null)
})

// ── 6. bing narrowing: /search is organic Bing (NOT Copilot); /chat IS Copilot — both paths ───
test('bing.com/search does NOT classify as Copilot; bing.com/chat does — on both paths', () => {
  assert.equal(detectAiPlatformFromReferrer('https://bing.com/search?q=x'), null, 'organic Bing search is not AI')
  assert.equal(midAi({ referer: 'https://bing.com/search?q=x' }), null)
  assert.equal(detectAiPlatformFromReferrer('https://bing.com/chat'), 'Copilot')
  assert.equal(midAi({ referer: 'https://bing.com/chat' }), 'Copilot')
  assert.equal(midAi({ referer: 'https://x.com/i/grok' }), 'Grok', 'the other path case survives')
})

// ── 7. Source guard: the ingest files must NOT redefine AI maps; they import the single source ─
// NOTE: this is a regex-on-source assertion, so it is brittle to reformatting — a spurious failure
// here likely means the import line or a comment was rewrapped, not that the maps were re-forked.
// It's a cheap backstop against re-duplication; the behavioral tests above are the real guarantee.
test('ai-platform.js and proxy.js do not redefine AI maps — they import channel-classifier', () => {
  const MID = readFileSync(join(__dirname, '../middleware/ai-platform.js'), 'utf8')
  const PROXY = readFileSync(join(__dirname, '../routes/proxy.js'), 'utf8')
  for (const [name, src] of [['ai-platform.js', MID], ['proxy.js', PROXY]]) {
    assert.doesNotMatch(src, /AI_HOST_MAP\s*=|AI_DOMAINS\s*=|AI_UTM_SOURCES\s*=\s*new Set|charAt\(0\)\.toUpperCase/, `${name} must not fork the AI maps`)
    assert.match(src, /from '\.\.\/lib\/channel-classifier\.js'|from '\.\.\/\.\.\/lib\/channel-classifier\.js'/, `${name} imports the canonical source`)
  }
})
