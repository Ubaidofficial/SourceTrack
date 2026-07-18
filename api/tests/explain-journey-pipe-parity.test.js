// D1c-2 ANTI-DRIFT — the coupling mitigation for REUSING the `journey` pipe.
// The explain-journey engine leg (attribution-engine.js getAttributionExplanation) does NOT have
// its own pipe: it reuses `journey.pipe`, which is owned by and serves the /journey route. That
// reuse is safe ONLY while journey.pipe keeps SELECTing every column the explain consumer reads.
// An edit to journey.pipe for the /journey route (dropping or renaming a column) would silently
// break explain. This test binds the two so such an edit fails LOUDLY here:
//   (1) extract the columns the ENGINE leg actually reads (the r.<col> list in the
//       _pipeRead('journey') row map)
//   (2) extract journey.pipe's SELECT column list
//   (3) assert every engine-read column is SELECTed by the pipe.
// Same spirit as analytics-channel-parity.test.js. TOKEN-FREE, NO network — pure source parity.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(join(__dirname, rel), 'utf8')

// (1) the columns the engine's journey leg reads from the pipe rows: r.event_type, r.timestamp, …
const engineSrc = read('../lib/attribution-engine.js')
const mapMatch = engineSrc.match(/_pipeRead\('journey'[\s\S]*?_jTb\.map\(r => \[([^\]]+)\]/)
assert.ok(mapMatch, "could not locate the _pipeRead('journey') row map in attribution-engine.js — did the journey leg move?")
const engineCols = [...mapMatch[1].matchAll(/r\.(\w+)/g)].map((m) => m[1])

// (2) journey.pipe's SELECT column list (the text between SELECT and FROM)
const pipeSrc = read('../../tinybird/pipes/journey.pipe')
const selectMatch = pipeSrc.match(/\bSELECT\b([\s\S]*?)\bFROM\b/i)
assert.ok(selectMatch, 'journey.pipe: SELECT … FROM block not found')
const selectText = selectMatch[1]

test('🔴 ANTI-DRIFT: journey.pipe SELECTs every column the explain-journey engine leg reads', () => {
  assert.ok(engineCols.length > 0, 'engine journey map produced no columns — regex/parse drift')
  for (const col of engineCols) {
    // typed columns are SELECTed bare (e.g. `event_type,`); assert each appears as a selected identifier.
    const re = new RegExp(`(^|[\\s,])${col}([\\s,]|$)`, 'm')
    assert.ok(
      re.test(selectText),
      `journey.pipe SELECT is missing '${col}'. The explain-journey leg REUSES this pipe and reads that column — restore it in journey.pipe, or give explain its own pipe.`
    )
  }
})

test('explain-journey leg reads exactly the 8 expected columns (contract pin)', () => {
  // If this changes, the reuse-coverage guarantee above must be re-checked against journey.pipe.
  const EXPECTED = ['event_type', 'timestamp', 'page_url', 'utm_source', 'utm_medium', 'utm_campaign', 'ai_source', 'conversion_value']
  assert.deepStrictEqual(engineCols, EXPECTED, 'the explain-journey column set/order changed — re-verify journey.pipe coverage and update this contract')
})
