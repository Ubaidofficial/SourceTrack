// D1b-3 Item A — §11 ANTI-DRIFT PARITY: the analytics pipes' filter_channel SQL multiIf is a port of
// channelFromEvent (channel-classifier.js). The inline SQL classifier is a point-in-time snapshot and
// WILL drift from the JS truth — this test is the only thing that catches it.
//
// It binds three links so a break anywhere fails CI:
//   (1) pipeChannel (a faithful JS transcription of the SQL multiIf) === channelFromEvent over a
//       fixture set covering AI / paid / social / display / affiliate / email / sms / organic /
//       referral / direct + the 6 known divergence cases the stale clone got wrong.
//   (2) the actual summary.pipe SQL text carries the EXACT medium/source/host lists channelFromEvent
//       uses (extracted + compared) — catches a constant edited in one place but not the other.
//   (3) all 5 analytics pipes carry a BYTE-IDENTICAL filter_channel block.
//
// TWO DOCUMENTED MODELING CHOICES (see PR body):
//   - AI is classified from the STORED `ai_source` column (ingest already ran the full
//     detectAiPlatformFromEvent incl. URL parsing), not re-derived in SQL. Fixtures are ingest-
//     consistent: ai_source is set wherever channelFromEvent would detect AI.
//   - Same-domain referrer neutralization uses ClickHouse domain() ≈ isSameDomainReferrer. Fixtures
//     use clearly-external or exact-same-host referrers, where the two agree.

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { channelFromEvent } from '../lib/channel-classifier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pipeSrc = (p) => readFileSync(join(__dirname, `../../tinybird/pipes/${p}.pipe`), 'utf8')

// ── The exact lists the SQL multiIf uses (kept here as the transcription's constants) ──
const PAID_SEARCH_MED = ['cpc', 'ppc', 'paid', 'paid_search', 'paidsearch', 'sem']
const PAID_SOCIAL_MED = ['paid_social', 'paidsocial', 'social_paid']
const DISPLAY_MED = ['display', 'banner', 'gdn', 'expandable', 'retargeting']
const AFFILIATE_MED = ['affiliate', 'affiliates', 'partner', 'cpa', 'cps']
const EMAIL_MED = ['email', 'e-mail', 'newsletter', 'mailing', 'edm']
const SMS_MED = ['sms', 'text', 'mms']
const ORGANIC_HOSTS = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'ecosia.', 'kagi.', 'brave.', 'yandex.', 'baidu.']
const ORGANIC_SRC = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex', 'brave', 'ecosia']
const SOCIAL_HOSTS = ['facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'pinterest.com', 'reddit.com', 'youtube.com', 'snapchat.com', 'threads.net']
const SOCIAL_SRC = ['facebook', 'instagram', 'linkedin', 'twitter', 'x', 'tiktok', 'pinterest', 'reddit', 'youtube', 'snapchat']
const EMAIL_SRC = ['mailchimp', 'klaviyo', 'hubspot', 'sendgrid', 'customer.io', 'brevo', 'activecampaign', 'drip', 'omnisend', 'postmark', 'mailerlite']

// domain() ≈ registrable host (matches ClickHouse domain() for the fixtures used here).
const hostOf = (u) => { try { return new URL(u.includes('://') ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }

// pipeChannel — a FAITHFUL transcription of the SQL multiIf in the 5 pipes (same order, same lists).
function pipeChannel (props) {
  const med = String(props.utm_medium || '').toLowerCase().trim()
  const src = String(props.utm_source || '').toLowerCase().trim()
  const aiSource = String(props.ai_source || '')
  const nz = (props.referrer && props.page_url && hostOf(props.referrer) === hostOf(props.page_url))
  const ref = nz ? '' : String(props.referrer || '').toLowerCase()
  const set = (k) => props[k] != null && props[k] !== ''
  return (
    aiSource !== '' ? 'AI Search'
    : (set('gclid') || set('gbraid') || set('wbraid') || set('msclkid')) ? 'Paid Search'
    : PAID_SEARCH_MED.includes(med) ? 'Paid Search'
    : (set('fbclid') || set('ttclid') || set('li_fat_id') || set('li_fatid') || set('twclid') || set('snapclid') || set('pclid') || set('sccid')) ? 'Paid Social'
    : PAID_SOCIAL_MED.includes(med) ? 'Paid Social'
    : set('dclid') ? 'Display'
    : DISPLAY_MED.includes(med) ? 'Display'
    : AFFILIATE_MED.includes(med) ? 'Affiliate'
    : EMAIL_MED.includes(med) ? 'Email'
    : SMS_MED.includes(med) ? 'SMS'
    : ORGANIC_HOSTS.some(h => ref.includes(h)) ? 'Organic Search'
    : (ORGANIC_SRC.includes(src) && med === '') ? 'Organic Search'
    : SOCIAL_HOSTS.some(h => ref.includes(h)) ? 'Organic Social'
    : (SOCIAL_SRC.includes(src) && med === '') ? 'Organic Social'
    : EMAIL_SRC.includes(src) ? 'Email'
    : ref.length > 5 ? 'Referral'
    : (src === '' || src === 'direct') ? 'Direct'
    : 'Other Campaign'
  )
}

// ── (1) pipeChannel === channelFromEvent over all-branch fixtures + the 6 divergence cases ──
// Ingest-consistent: ai_source is set wherever channelFromEvent would detect AI (stored-column model).
const FIXTURES = [
  // the 6 divergence cases the stale clone got wrong:
  { name: 'gclid only', props: { gclid: 'x' } },
  { name: 'fbclid only', props: { fbclid: 'x' } },
  { name: 'medium=affiliate', props: { utm_medium: 'affiliate' } },
  { name: 'medium=display', props: { utm_medium: 'display' } },
  { name: 'medium=sms', props: { utm_medium: 'sms' } },
  { name: 'medium=paidsearch', props: { utm_medium: 'paidsearch' } },
  // required coverage:
  { name: 'AI (stored ai_source)', props: { ai_source: 'ChatGPT' } },
  { name: 'paid search cpc', props: { utm_medium: 'cpc' } },
  { name: 'msclkid', props: { msclkid: 'x' } },
  { name: 'paid social medium', props: { utm_medium: 'paid_social' } },
  { name: 'ttclid', props: { ttclid: 'x' } },
  { name: 'dclid display', props: { dclid: 'x' } },
  { name: 'sms medium', props: { utm_medium: 'text' } },
  { name: 'email medium', props: { utm_medium: 'newsletter' } },
  { name: 'organic search host', props: { referrer: 'https://www.google.com/search', page_url: 'https://shop.example.com/' } },
  { name: 'organic search source, no medium', props: { utm_source: 'bing' } },
  { name: 'organic social host', props: { referrer: 'https://facebook.com/', page_url: 'https://shop.example.com/' } },
  { name: 'organic social source', props: { utm_source: 'linkedin' } },
  { name: 'email source (ESP)', props: { utm_source: 'klaviyo' } },
  { name: 'referral (external)', props: { referrer: 'https://someblog.io/post', page_url: 'https://shop.example.com/' } },
  { name: 'direct (nothing)', props: {} },
  { name: 'direct (source=direct)', props: { utm_source: 'direct' } },
  { name: 'other campaign (tagged source)', props: { utm_source: 'partnerX' } },
  { name: 'same-domain internal referrer -> neutralized -> Direct', props: { referrer: 'https://shop.example.com/blog', page_url: 'https://shop.example.com/pricing' } }
]

test('🔴 PARITY: pipeChannel (SQL transcription) === channelFromEvent on every fixture', () => {
  for (const f of FIXTURES) {
    assert.strictEqual(pipeChannel(f.props), channelFromEvent(f.props), `channel mismatch: ${f.name}`)
  }
})

// ── (2) the summary.pipe SQL text carries the EXACT lists (binds SQL text -> the constants) ──
test('🔴 ANTI-DRIFT: summary.pipe filter_channel SQL contains the exact medium/source/host lists', () => {
  const sql = pipeSrc('summary')
  const hasList = (arr) => assert.ok(arr.every(v => sql.includes(`'${v}'`)), `summary.pipe missing a list value: ${arr.join(',')}`)
  for (const L of [PAID_SEARCH_MED, PAID_SOCIAL_MED, DISPLAY_MED, AFFILIATE_MED, EMAIL_MED, SMS_MED, ORGANIC_HOSTS, ORGANIC_SRC, SOCIAL_HOSTS, SOCIAL_SRC, EMAIL_SRC]) hasList(L)
  // the click-ID branches must be present (the click-ID-blind clone omitted them)
  for (const cid of ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid', 'ttclid', 'li_fat_id', 'li_fatid', 'twclid', 'snapclid', 'pclid', 'sccid', 'dclid']) {
    assert.ok(sql.includes(cid), `summary.pipe channel CASE missing click-ID column: ${cid}`)
  }
  // and the channels the stale clone lacked
  for (const ch of ['Display', 'Affiliate', 'SMS', 'Other Campaign']) assert.ok(sql.includes(`'${ch}'`), `summary.pipe missing channel: ${ch}`)
})

// ── (3) all 5 pipes carry a byte-identical filter_channel block ──
test('🔴 ANTI-DRIFT: the filter_channel block is byte-identical across all 5 analytics pipes', () => {
  const extract = (p) => {
    const s = pipeSrc(p)
    const a = s.indexOf('{% if defined(filter_channel) %}')
    const b = s.indexOf('{% end %}', a)
    assert.ok(a > 0 && b > a, `${p}: filter_channel block not found`)
    return s.slice(a, b)
  }
  const ref = extract('summary')
  for (const p of ['sources_ai', 'sources_ref', 'browsers', 'os']) {
    assert.strictEqual(extract(p), ref, `${p} filter_channel block diverged from summary`)
  }
})

// ── (4) KNOWN_ISSUES #13 — the SAME classifier in the 3 pipes test (3) never covered ──
// Test (3) compares the whole `{% if defined(filter_channel) %}` BLOCK, which only exists in — and is
// only shaped the same across — the 5 analytics pipes. Three other pipes carry their own copy of the
// classifier in a DIFFERENT wrapper, so they sat outside every assertion above and drifted to a stale,
// click-ID-blind clone (mis-classifying paid clicks as Organic Search / Organic Social):
//   session_report_pageviews / session_report_conversions — `COALESCE(multiIf(...), 'Other') = <one channel>`
//   seo_revenue_landing_pages                            — `multiIf(...) = 'Organic Search'` (organic-only filter)
// So this binds the multiIf EXPRESSION itself, which is wrapper-independent and therefore covers all 8.
// Deliberately NOT normalizing whitespace: byte-identity is the property that keeps 8 copies in step.
const CHANNEL_PIPES = ['summary', 'sources_ai', 'sources_ref', 'browsers', 'os',
  'session_report_pageviews', 'session_report_conversions', 'seo_revenue_landing_pages']

const extractMultiIf = (p) => {
  const s = pipeSrc(p)
  const a = s.indexOf("multiIf(\n          ai_source IS NOT NULL")
  assert.ok(a > 0, `${p}: canonical channel multiIf not found (stale clone or different indentation?)`)
  const end = s.indexOf("'Other Campaign'", a)
  assert.ok(end > a, `${p}: multiIf has no 'Other Campaign' fallback — not the canonical block`)
  return s.slice(a, end + "'Other Campaign'".length)
}

test('🔴 ANTI-DRIFT (KI #13): the channel multiIf is byte-identical across ALL 8 pipes that carry one', () => {
  const ref = extractMultiIf('summary')
  for (const p of CHANNEL_PIPES.slice(1)) {
    assert.strictEqual(extractMultiIf(p), ref,
      `${p}: channel multiIf diverged from summary.pipe — §11 forbids forking this logic`)
  }
})

test('🔴 ANTI-DRIFT (KI #13): every channel pipe carries all 13 click-ID branches', () => {
  for (const p of CHANNEL_PIPES) {
    const sql = extractMultiIf(p)
    for (const cid of ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid', 'ttclid', 'li_fat_id', 'li_fatid', 'twclid', 'snapclid', 'pclid', 'sccid', 'dclid']) {
      assert.ok(sql.includes(cid), `${p}: classifier is click-ID-blind — missing ${cid}`)
    }
    for (const ch of ['Display', 'Affiliate', 'SMS', 'Other Campaign']) {
      assert.ok(sql.includes(`'${ch}'`), `${p}: classifier missing channel ${ch}`)
    }
  }
})

// The SEO pipe is not a channel FILTER but an organic-only row filter: its contract is that a row is
// included iff the canonical classifier calls it Organic Search. Asserted separately because a
// byte-identical multiIf that is then compared to the WRONG channel would still pass test (4).
test("🔴 KI #13: seo_revenue_landing_pages gates on the canonical classifier = 'Organic Search'", () => {
  const src = pipeSrc('seo_revenue_landing_pages')
  // EXECUTABLE SQL ONLY. The DESCRIPTION above it quotes the old `referrer ILIKE '%google.%'` filter
  // verbatim to record what was wrong and why — scanning the whole file would make that history
  // impossible to write down, which is the opposite of what this repo wants.
  const sql = src.slice(src.indexOf('SQL >'))
  assert.ok(sql.length > 0, 'SQL section not found')
  assert.match(sql, /multiIf\([\s\S]*?'Other Campaign'\s*\)\s*=\s*'Organic Search'/,
    'the organic filter must be the canonical multiIf compared to Organic Search, not a hand-rolled host list')
  // The pre-fix filter matched a bare host list with no click-ID/medium guard, so an auto-tagged
  // Google Ads click (gclid + google.com referrer) counted as SEO revenue. That shape must be gone.
  assert.doesNotMatch(sql, /referrer ILIKE '%google\.%'/,
    'the click-ID-blind ILIKE host filter must be replaced, not kept alongside the classifier')
})
