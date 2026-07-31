// Volunteered-identity capture tests (V1 Named Contacts).
//
// The privacy contract is asymmetric and must be PROVEN in both directions:
//   1. email/name PERSIST from the volunteered identify() channel, and
//   2. email/name are STILL REDACTED on /conversion + /track props.
// The design deliberately adds NO scrubber carve-out (identify() is scrubber-free
// by construction), so (2) is the regression lock proving the guarantee is UNMOVED.

import test from 'node:test'
import assert from 'node:assert/strict'
import { redactPiiFromObject } from '../lib/utils.js'
import { normalizeVolunteeredName, persistVolunteeredIdentity } from '../lib/volunteered-identity.js'

// persistVolunteeredIdentity() now consults erasure suppression before writing, so every fake
// client here must be able to answer that lookup. Returning no rows = "not suppressed"; omit it
// and the lookup throws, the write fails CLOSED, and these tests fail for an unrelated reason.
const notSuppressed = {
  select: () => ({ eq: () => ({ contains: () => ({ limit: async () => ({ data: [], error: null }) }) }) })
}

// ── (1) PERSIST: the scrubber does NOT run on the identify channel ───────────
// The whole capture path depends on email/name reaching the identify handler
// intact. redactPiiFromObject is NOT imported or called by identify.js; this
// asserts the values survive an object shaped like the identify body.

test('identify body is NOT scrubbed here — email/name are preserved for capture', () => {
  // NOTE: this is the identify path, which does not call redactPiiFromObject.
  // We assert the capture helper accepts and returns them; the redaction test
  // below proves the OTHER paths still strip the same fields.
  const body = { site_key: 'sk', anonymous_id: 'v_1', email: 'Heidi@Sunnydale.example', name: '  Heidi Osei  ' }
  // The helper validates + normalizes without a DB by injecting a fake client.
  const writes = []
  const fakeSupabase = { from: () => ({ ...notSuppressed, upsert: async (row) => { writes.push(row); return { error: null } } }) }
  return persistVolunteeredIdentity({
    siteId: 's1', distinctId: body.anonymous_id, email: body.email, name: body.name, supabase: fakeSupabase
  }).then(res => {
    assert.equal(res.written, true)
    assert.equal(res.email, 'heidi@sunnydale.example', 'email lowercased + trimmed')
    assert.equal(res.name, 'Heidi Osei', 'name trimmed')
    assert.equal(writes.length, 1)
    assert.equal(writes[0].distinct_id, 'v_1')
    assert.equal(writes[0].source, 'identify')
  })
})

test('persist writes NOTHING when neither field is valid (no empty rows)', async () => {
  let called = false
  const fakeSupabase = { from: () => ({ ...notSuppressed, upsert: async () => { called = true; return { error: null } } }) }
  const res = await persistVolunteeredIdentity({
    siteId: 's1', distinctId: 'v_1', email: 'not-an-email', name: '   ', supabase: fakeSupabase
  })
  assert.equal(res.written, false)
  assert.equal(called, false, 'no upsert when nothing validated')
})

test('persist is a two-field allowlist — a traits blob or extra keys never reach the row', async () => {
  const writes = []
  const fakeSupabase = { from: () => ({ ...notSuppressed, upsert: async (row) => { writes.push(row); return { error: null } } }) }
  // Even if a caller passed extra fields, the helper only ever forwards email+name.
  await persistVolunteeredIdentity({
    siteId: 's1', distinctId: 'v_1', email: 'a@b.example', name: 'A B',
    traits: { ssn: '123', phone: '+15551234567' }, phone: '+15551234567', supabase: fakeSupabase
  })
  assert.equal(writes.length, 1)
  assert.deepEqual(Object.keys(writes[0]).sort(), ['distinct_id', 'email', 'last_seen_at', 'name', 'site_id', 'source'])
  assert.ok(!('traits' in writes[0]) && !('phone' in writes[0]), 'only the allowlisted fields are stored')
})

test('name is length-capped (abuse control)', () => {
  assert.equal(normalizeVolunteeredName('x'.repeat(500)).length, 128)
  assert.equal(normalizeVolunteeredName(''), null)
  assert.equal(normalizeVolunteeredName('   '), null)
  assert.equal(normalizeVolunteeredName(42), null)
})

// ── (2) REGRESSION: the scrubber still strips email/name everywhere ELSE ─────
// These are the /conversion (conversion.js:205-207) and /track (track.js:188-190)
// paths. The guarantee must be UNMOVED by Named Contacts.

test('REGRESSION: email/name STILL redacted on a conversion/track props object', () => {
  // Exactly the shape redactPiiFromObject sees on /api/conversion + /api/track.
  const props = {
    conversion_value: 99,
    email: 'buyer@shop.example',
    name: 'Buyer Name',
    first_name: 'Buyer',
    last_name: 'Name',
    customer_email: 'buyer@shop.example',
    utm_source: 'google'
  }
  const res = redactPiiFromObject(props)
  assert.equal(res.email, '[REDACTED]')
  assert.equal(res.name, '[REDACTED]')
  assert.equal(res.first_name, '[REDACTED]')
  assert.equal(res.last_name, '[REDACTED]')
  assert.equal(res.customer_email, '[REDACTED]')
  // Non-PII fields are untouched — the scrubber is unchanged, not widened.
  assert.equal(res.conversion_value, 99)
  assert.equal(res.utm_source, 'google')
})

test('REGRESSION: nested properties.email is still redacted (conversion props path)', () => {
  const body = { anonymous_id: 'v_1', properties: { email: 'buyer@shop.example', name: 'Buyer' } }
  const scrubbed = { ...body, properties: redactPiiFromObject(body.properties) }
  assert.equal(scrubbed.properties.email, '[REDACTED]')
  assert.equal(scrubbed.properties.name, '[REDACTED]')
})
