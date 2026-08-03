/**
 * Backend ingest guards for chat_lead_captured — api/routes/track.js
 *
 * The headline test is #6: track.js's custom_properties passthrough condition is
 * the HIGHEST-RISK line in this change. The provider allowlist above it only
 * decides which TYPED columns get populated — it does NOT stop the raw client
 * `properties` object from landing in the bag. If chat_lead_captured is ever
 * dropped from that condition, every field a chat callback could carry (email,
 * name, message text) flows straight through.
 *
 * This proves it FUNCTIONALLY, by injecting a dual-write transport and reading
 * the payload that would actually be written — not by grepping the source.
 */
import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'url'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
process.env.TINYBIRD_DUAL_WRITE = 'true'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')

const { track } = await import('../../api/routes/track.js')
const { setDualWriteTransport, drainDualWrite } = await import('../../tinybird/adapter/dual-write.js')

// ── Capture what would actually be written ──────────────────────────────────
// The transport receives the gzipped NDJSON body destined for Tinybird, so this
// observes the real bytes on the wire rather than an intermediate object.
let captured = []
setDualWriteTransport(async (body) => { captured.push(body) }, { maxBatch: 1, maxWaitMs: 1 })

function decodeRows(bodies) {
  return bodies.flatMap((b) => {
    const buf = Buffer.isBuffer(b) ? b : Buffer.from(b.data || b)
    let text
    try { text = zlib.gunzipSync(buf).toString('utf8') } catch (_) { text = buf.toString('utf8') }
    return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  })
}

function mockReq(propOverrides = {}, bodyOverrides = {}) {
  return {
    headers: { 'user-agent': 'Mozilla/5.0 (Test)' },
    body: {
      event: 'chat_lead_captured',
      anonymous_id: 'anon-123',
      session_id: 'sess-456',
      page_url: 'https://example.com/contact',
      properties: {
        event_type: 'chat_lead_captured',
        chat_provider: 'intercom',
        chat_detection_method: 'browser_embed_event',
        chat_event_type: 'user_email_supplied',
        page_url: 'https://example.com/contact',
        page_path: '/contact',
        ...propOverrides
      },
      ...bodyOverrides
    },
    site: {
      id: 'site-123', site_key: 'sk-test', excluded_paths: null, custom_url_params: null,
      last_seen_at: null, plan_name: 'starter', pv_limit: 5000
    }
  }
}

function mockRes() {
  return {
    _status: 200, _body: null,
    status(s) { this._status = s; return this },
    json(b) { this._body = b; return this }
  }
}

/** Run the route and return the rows it would actually write to Tinybird. */
async function ingest(req) {
  captured = []
  const res = mockRes()
  await track(req, res)
  await drainDualWrite()
  return { res, rows: decodeRows(captured) }
}

test('chat_lead_captured backend ingest (track.js)', async (t) => {

  await t.test('1. Valid chat_lead_captured is accepted', async () => {
    const { res } = await ingest(mockReq())
    assert.strictEqual(res._status, 200)
    assert.strictEqual(res._body?.success, true)
  })

  await t.test('2. Provider allowlist: intercom and crisp accepted', async () => {
    for (const provider of ['intercom', 'crisp']) {
      const { rows } = await ingest(mockReq({
        chat_provider: provider,
        chat_event_type: provider === 'crisp' ? 'user_email_changed' : 'user_email_supplied'
      }))
      assert.ok(rows.length >= 1, `Expected a row for ${provider}`)
      assert.strictEqual(rows[0].chat_provider, provider)
    }
  })

  await t.test('3. Provider allowlist: unknown providers are stripped to null', async () => {
    // 'tawkto' included deliberately — Phase 2 must not slip in via the server.
    for (const bad of ['tawkto', 'tawk', 'drift', 'stripe', 'zendesk', '', 'INTERCOM; DROP']) {
      const { res, rows } = await ingest(mockReq({ chat_provider: bad }))
      assert.strictEqual(res._status, 200, 'Event still accepted')
      assert.strictEqual(rows[0].chat_provider, null, `Expected '${bad}' to be stripped to null`)
    }
  })

  await t.test('4. Casing and whitespace are normalized, not bypassed', async () => {
    const { rows } = await ingest(mockReq({ chat_provider: '  InTeRcOm  ' }))
    assert.strictEqual(rows[0].chat_provider, 'intercom')
  })

  await t.test('5. Invalid detection_method and event_type are stripped to null', async () => {
    const { rows } = await ingest(mockReq({
      chat_detection_method: 'server_webhook',
      chat_event_type: 'chat_started'   // the signal we deliberately rejected
    }))
    assert.strictEqual(rows[0].chat_detection_method, null)
    assert.strictEqual(rows[0].chat_event_type, null)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // THE HIGH-RISK LINE
  // ───────────────────────────────────────────────────────────────────────────
  await t.test('6. custom_properties passthrough is BLOCKED — raw bag never written', async () => {
    const { res, rows } = await ingest(mockReq({
      // Everything a hostile or modified tracker could try to smuggle through.
      email: 'visitor@example.com',
      name: 'Jane Doe',
      phone: '+15551234567',
      message: 'my card is 4111111111111111',
      transcript: ['hi', 'I need help with my account'],
      crisp_session_id: 'session_abc123',
      intercom_user_id: 'user_xyz'
    }))
    assert.strictEqual(res._status, 200)
    assert.ok(rows.length >= 1, 'Expected a written row')

    // The bag itself must not exist for this event type
    assert.strictEqual(rows[0].custom_properties, undefined,
      'custom_properties must NOT be present for chat_lead_captured — track.js passthrough condition')

    // And none of the smuggled values may appear anywhere in the written row
    for (const leak of [
      'visitor@example.com', 'Jane Doe', '+15551234567',
      '4111111111111111', 'I need help with my account',
      'session_abc123', 'user_xyz'
    ]) {
      assert.ok(!JSON.stringify(rows[0]).includes(leak),
        `Leaked value found in written row: ${leak}`)
    }

    // Only the fixed schema survived
    assert.strictEqual(rows[0].chat_provider, 'intercom')
    assert.strictEqual(rows[0].chat_detection_method, 'browser_embed_event')
    assert.strictEqual(rows[0].chat_event_type, 'user_email_supplied')
  })

  await t.test('7. CONTROL — the SAME payload DOES leak without the exclusion', async () => {
    // This is what makes test 6 meaningful. Identical smuggled fields, sent as a
    // normal custom event (which is NOT in the passthrough exclusion), are written
    // verbatim. So test 6 is measuring the exclusion, not some unrelated reason the
    // bag happens to be absent.
    //
    // Note precisely what the pre-existing PII sanitizer does and does not do: it
    // strips the literal `email` key, but message text, transcripts and provider
    // session ids all survive. The exclusion at track.js is therefore the ONLY
    // thing standing between a chat callback and stored visitor message content.
    const { rows } = await ingest(mockReq({}, {
      event: 'custom_event',
      properties: {
        email: 'visitor@example.com',
        message: 'my card is 4111111111111111',
        transcript: ['I need help with my account'],
        crisp_session_id: 'session_abc123'
      }
    }))
    const bag = rows[0]?.custom_properties
    assert.ok(bag, 'Control: custom_properties SHOULD exist for a normal custom event')
    assert.strictEqual(bag.message, 'my card is 4111111111111111',
      'Control: message text survives the PII sanitizer — the exclusion is load-bearing')
    assert.deepStrictEqual(bag.transcript, ['I need help with my account'])
    assert.strictEqual(bag.crisp_session_id, 'session_abc123')
    assert.strictEqual(bag.email, undefined, 'The sanitizer strips only the literal email key')
  })

  await t.test('8. page_path is validated, not trusted', async () => {
    const { rows } = await ingest(mockReq({ page_path: 'https://evil.com/../../etc/passwd?x=1' }))
    assert.ok(!String(rows[0].page_path || '').includes('evil.com'),
      'page_path must be validated by validatePathname')
  })

  await t.test('9. Missing properties object does not throw', async () => {
    const req = mockReq()
    delete req.body.properties
    const { res } = await ingest(req)
    assert.strictEqual(res._status, 200)
  })

  await t.test('10. chat_lead_captured does NOT auto-promote to a conversion', async () => {
    // Phase 1 is detect-only, mirroring booking_scheduled on main. Promotion is a
    // separate, reviewed decision — see the LEAD_TYPES note below.
    const { rows } = await ingest(mockReq())
    const conversions = rows.filter(r => r.event_type === '$conversion')
    assert.strictEqual(conversions.length, 0,
      'chat_lead_captured must not emit a $conversion in Phase 1')
  })
})

test('chat_lead_captured scope guards', async (t) => {

  await t.test('11. chat_lead_captured stays OUT of LEAD_TYPES', async () => {
    const { LEAD_TYPES, CUSTOMER_TYPES, classifyConversionType } =
      await import('../../api/lib/conversion-classifier.js')
    assert.ok(!LEAD_TYPES.includes('chat_lead_captured'),
      'Phase 1 is detect-only — mirrors booking_scheduled, which is also absent')
    assert.ok(!CUSTOMER_TYPES.includes('chat_lead_captured'))
    assert.strictEqual(classifyConversionType('chat_lead_captured'), 'other')
    // Guard the mirror itself: if booking ever joins, this reminder fires.
    assert.strictEqual(LEAD_TYPES.includes('booking_scheduled'), false,
      'booking_scheduled joined LEAD_TYPES — revisit whether chat should follow')
  })

  await t.test('12. api/routes/conversion.js is untouched by chat detection', () => {
    const src = fs.readFileSync(path.join(rootDir, 'api/routes/conversion.js'), 'utf8')
    for (const token of ['chat_lead_captured', 'chat_provider', 'chat_detection_method']) {
      assert.strictEqual(src.includes(token), false, `conversion.js must not reference ${token}`)
    }
  })

  await t.test('13. The passthrough condition names all three fixed-schema events', () => {
    // Belt on test 6: catches a refactor that drops the event name from the
    // condition while some other code path masks the functional symptom.
    const src = fs.readFileSync(path.join(rootDir, 'api/routes/track.js'), 'utf8')
    const condition = src.match(/\.\.\.\(\((req\.body\?\.event === '[^)]+)\)\s*\n?\s*\?\s*\{\}/)
    assert.ok(condition, 'Expected to locate the custom_properties passthrough condition')
    for (const evt of ['form_submit', 'booking_scheduled', 'chat_lead_captured']) {
      assert.ok(condition[1].includes(`'${evt}'`),
        `${evt} must be excluded from custom_properties passthrough`)
    }
  })
})

test.after(() => { setDualWriteTransport(null) })
