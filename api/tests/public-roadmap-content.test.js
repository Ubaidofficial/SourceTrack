// Public roadmap content integrity — marketing/src/config/roadmap.json.
//
// This file is PUBLIC COPY, so each column is a §6 truthfulness claim rather than a status
// label: a customer reads "Shipped" as "I can use this today". The page itself is covered by
// the marketing CI build, but a build cannot tell you a claim became false — someone moving
// an item to `shipped` because its PR merged would build perfectly green and be wrong.
//
// So these tests pin the DISCIPLINE, not the wording:
//   · every shipped item carries the evidence that justified the promotion
//   · every building item carries a customer-facing reason it is not usable yet
//   · a column with no items has an empty state, so nobody pads it to balance the layout
//   · the internal evidence field is never the same string as the customer-facing note
//
// Two entries were demoted from shipped on 2026-07-30 (AI visibility: crawler pipes not
// deployed; MCP tools: the diagnostic read scopes never exercised by a real key). If a
// future change promotes either, these tests force the evidence to be written down at the
// same time.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROADMAP_PATH = join(__dirname, '..', '..', 'marketing', 'src', 'config', 'roadmap.json')
const roadmap = JSON.parse(readFileSync(ROADMAP_PATH, 'utf8'))

const columnFor = (key) => roadmap.columns.find((c) => c.key === key)

test('the three columns exist, in order, and nothing extra crept in', () => {
  assert.deepEqual(roadmap.columns.map((c) => c.key), ['shipped', 'building', 'soon'])
})

test('every column has a title and a description the page can render', () => {
  for (const column of roadmap.columns) {
    assert.ok(column.title, `${column.key}: title required`)
    assert.ok(column.description, `${column.key}: description required`)
    assert.ok(Array.isArray(column.items), `${column.key}: items must be an array`)
  }
})

test('every item has a title and a customer-facing description', () => {
  for (const column of roadmap.columns) {
    for (const item of column.items) {
      assert.ok(item.title, `${column.key}: an item is missing a title`)
      assert.ok(item.description, `${item.title}: description required`)
    }
  }
})

// ── the load-bearing invariants ──────────────────────────────────────────────

test('every SHIPPED item records the evidence that justified calling it shipped', () => {
  const shipped = columnFor('shipped')
  assert.ok(shipped.items.length > 0, 'shipped must not be empty — that would be its own false claim')
  for (const item of shipped.items) {
    assert.ok(
      typeof item.verified_note === 'string' && item.verified_note.length > 20,
      `${item.title}: a shipped claim needs verified_note stating what was checked ` +
      '(pipe deployed / migration applied / no dependency). Merging is not evidence.'
    )
  }
})

test('every BUILDING item tells the customer why it is not usable yet', () => {
  for (const item of columnFor('building').items) {
    assert.ok(
      typeof item.note === 'string' && item.note.length > 20,
      `${item.title}: a building item must carry a customer-facing note. Without it the ` +
      'column reads as a teaser rather than an honest status.'
    )
    assert.ok(
      typeof item.verified_note === 'string' && item.verified_note.length > 20,
      `${item.title}: record what was checked, so a future promotion has to re-check it.`
    )
  }
})

test('a column with no items has an empty state — never padded to balance the layout', () => {
  for (const column of roadmap.columns) {
    if (column.items.length === 0) {
      assert.ok(
        typeof column.empty_state === 'string' && column.empty_state.length > 20,
        `${column.key}: an empty column needs empty_state copy, not a filler item`
      )
    }
  }
})

test('internal evidence is never reused as customer-facing copy', () => {
  // verified_note is deliberately not rendered by roadmap.astro. If someone copies it into
  // `note` or `description`, internal specifics (row counts, table names) reach the public page.
  for (const column of roadmap.columns) {
    for (const item of column.items) {
      if (!item.verified_note) continue
      assert.notEqual(item.verified_note, item.description, `${item.title}: evidence leaked into description`)
      assert.notEqual(item.verified_note, item.note, `${item.title}: evidence leaked into note`)
    }
  }
})

test('the two demoted entries are still in Building, with their unblock condition named', () => {
  // Not pinning them to Building forever — pinning that IF they are there, the condition to
  // promote them is written down. Both were demoted on evidence; both name what would change it.
  const buildingTitles = columnFor('building').items.map((i) => i.title)
  for (const title of ['AI visibility', 'MCP diagnostic tools']) {
    if (!buildingTitles.includes(title)) continue
    const item = columnFor('building').items.find((i) => i.title === title)
    assert.match(
      item.verified_note,
      /Move to shipped/i,
      `${title}: verified_note must state the condition that would allow promotion`
    )
  }
})

test('verified_on is a real ISO date, so "last verified" on the page is not a guess', () => {
  assert.match(roadmap.verified_on, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(!Number.isNaN(Date.parse(roadmap.verified_on)))
})

test('no shipped item is ALSO listed as building or coming soon', () => {
  const seen = new Map()
  for (const column of roadmap.columns) {
    for (const item of column.items) {
      assert.ok(!seen.has(item.title), `${item.title}: appears in both ${seen.get(item.title)} and ${column.key}`)
      seen.set(item.title, column.key)
    }
  }
})
