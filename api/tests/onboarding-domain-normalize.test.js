// Source-fix for the duplicate-site bug (prod, 2026-07-14): onboarding treated "techrupt.pk" and
// "www.techrupt.pk" as different domains (exact .eq match) and created a second `sites` row. The fix
// canonicalizes on the way IN — strip a leading "www.", lowercase — so both collapse to one stored
// domain, matching the tracker Referer lookup and the sites_normalized_domain_uniq index. The
// canonicalizer also GUARDS the value that is interpolated into the PostgREST .or() existence check
// (which replaced a safe .eq() binding) against operator injection.

import test from 'node:test'
import assert from 'node:assert'
import { normalizeDomain } from '../routes/onboarding.js'

test('normalizeDomain: www/case/scheme/path all collapse to ONE bare canonical form', () => {
  for (const input of ['techrupt.pk', 'www.techrupt.pk', 'WWW.Techrupt.PK', 'https://techrupt.pk',
    'https://www.techrupt.pk/contact', 'http://WWW.techrupt.pk/', '  techrupt.pk  ']) {
    assert.strictEqual(normalizeDomain(input), 'techrupt.pk', `${JSON.stringify(input)} -> techrupt.pk`)
  }
  assert.strictEqual(normalizeDomain('www.shop.example.com'), 'shop.example.com', 'only the LEADING www is stripped')
  assert.strictEqual(normalizeDomain('blog.example.com'), 'blog.example.com', 'a non-www subdomain is preserved')
})

test('normalizeDomain: rejects empty and injection-shaped input (guards the .or() string filter, §6.5)', () => {
  assert.strictEqual(normalizeDomain(''), null)
  assert.strictEqual(normalizeDomain(null), null)
  assert.strictEqual(normalizeDomain('   '), null)
  // These would break out of `domain.eq.<x>` in the PostgREST .or() filter — must be rejected, not passed.
  assert.strictEqual(normalizeDomain('evil.com,domain.eq.other-site.com'), null, 'comma rejected')
  assert.strictEqual(normalizeDomain('foo.com;drop'), null, 'semicolon rejected')
  assert.strictEqual(normalizeDomain('a(b).com'), null, 'parens rejected')
  assert.strictEqual(normalizeDomain('has spaces'), null, 'spaces rejected')
})
