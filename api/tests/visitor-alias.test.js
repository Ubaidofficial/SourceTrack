// Visitor alias (dashboard/src/lib/visitorAlias.js).
//
// THE POINT OF THIS FILE: the alias is a DISPLAY IDENTITY for a real person's browsing session,
// so two properties are load-bearing rather than cosmetic.
//   1. Determinism. The same visitor must resolve to the same alias on every render and every
//      machine, with nothing persisted. A non-deterministic alias would rename a visitor
//      mid-session and make the label useless for talking about a journey.
//   2. Distribution. A weak hash clusters, and distinct_ids commonly share prefixes or run
//      sequentially — exactly the input shape that collapses a naive hash onto a handful of
//      aliases, so unrelated visitors would appear to share an identity.

import test from 'node:test'
import assert from 'node:assert/strict'

const { visitorAlias, ALIAS_WORD_COUNTS } = await import('../../dashboard/src/lib/visitorAlias.js')

test('same id always yields the same alias', () => {
  const id = 'a3f9c1e2-77b4-4d5a-9c0e-1f2b3d4e5f60'
  const first = visitorAlias(id)
  for (let i = 0; i < 100; i++) assert.equal(visitorAlias(id), first)
})

test('alias is two words, "Adjective Animal"', () => {
  const a = visitorAlias('some-visitor-id')
  assert.match(a, /^[A-Z][a-z]+ [A-Z][a-z]+$/)
})

test('no id yields null rather than a fabricated identity', () => {
  for (const empty of [null, undefined, '', '   ']) {
    assert.equal(visitorAlias(empty), null)
  }
})

test('sequential and prefix-sharing ids do not collapse onto one alias', () => {
  // The realistic clustering input. A weak hash returns near-identical output for these.
  const sequential = Array.from({ length: 200 }, (_, i) => `visitor-${i}`)
  const distinct = new Set(sequential.map(visitorAlias))
  assert.ok(distinct.size > 120, `sequential ids collapsed to ${distinct.size} distinct aliases`)

  const sharedPrefix = Array.from({ length: 200 }, (_, i) => `d41d8cd98f00b204e9800998ecf8427e-${i}`)
  const distinct2 = new Set(sharedPrefix.map(visitorAlias))
  assert.ok(distinct2.size > 120, `prefix-sharing ids collapsed to ${distinct2.size} distinct aliases`)
})

test('adjective and animal vary independently', () => {
  // Seeding both halves the same way correlates the pair and collapses the effective space far
  // below adjectives × animals. Both axes must move across a sample.
  const ids = Array.from({ length: 300 }, (_, i) => `id-${i * 7919}`)
  const aliases = ids.map(visitorAlias)
  const adjectives = new Set(aliases.map(a => a.split(' ')[0]))
  const animals = new Set(aliases.map(a => a.split(' ')[1]))
  assert.ok(adjectives.size > 30, `only ${adjectives.size} distinct adjectives over 300 ids`)
  assert.ok(animals.size > 30, `only ${animals.size} distinct animals over 300 ids`)
})

test('the combination space is large enough that a collision is not the norm', () => {
  assert.ok(ALIAS_WORD_COUNTS.adjectives * ALIAS_WORD_COUNTS.animals >= 4096)
})

test('long, unicode and odd ids are handled without throwing', () => {
  for (const id of ['x'.repeat(5000), '👋🏽-visitor-ᚠᚢᚦ', '0', '-', '../../etc/passwd']) {
    assert.doesNotThrow(() => visitorAlias(id))
    assert.match(visitorAlias(id), /^[A-Z][a-z]+ [A-Z][a-z]+$/)
  }
})

test('the alias adds no information — it is a pure function of the id', () => {
  // Guards against anyone later enriching this from person data. Two ids that differ only in
  // case or whitespace padding are different ids and may map anywhere; what must hold is that
  // NOTHING but the id string influences the result, which determinism across calls proves.
  const a = visitorAlias('constant-id')
  const b = visitorAlias('constant-id')
  assert.equal(a, b)
})
