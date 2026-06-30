// TEMP-DEBUG — drop-point diagnosis for dual-write events that never reach
// Tinybird on the DEPLOYED build (Supabase claims written, but no POST and no
// onError/normalize-fail log). REVERT this whole file + its call sites once the
// deploy pinpoints the dead step.
//
// Doubly safe so it can NEVER harm production:
//   1. Env-gated: silent unless TINYBIRD_TEMP_DEBUG === '1' (founder sets it for
//      the one debug deploy; tests never set it, so the suite is unaffected).
//   2. Bounded: at most MAX lines per process, then silent (no flood even if the
//      flag is on under real traffic).
// Logs event_type + buffer/batch sizes + error messages ONLY — never the body/PII.

let _n = 0
const MAX = 400

export function tempDebug (tag, msg) {
  if (process.env.TINYBIRD_TEMP_DEBUG !== '1') return
  if (_n++ >= MAX) return
  try { console.warn(`[TEMP-DEBUG ${tag}] ${msg}`) } catch (_) { /* logging must never throw */ }
}
