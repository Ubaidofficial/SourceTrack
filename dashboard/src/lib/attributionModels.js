// One-line summaries of what each attribution model actually does.
//
// SOURCE OF TRUTH: these are CONDENSATIONS of the long-form copy already shipping in
// components/ConversionExplanationModal.jsx ("How this model works"), which is itself written
// against the engine's real behavior. Nothing here is invented — the percentages, the half-life,
// the non-direct fallback and the AI lookback all come from that copy. If a model's semantics
// change, change the modal AND this map together; a summary that drifts from the long form is a
// §6 truth defect, not a copy nit.
//
// Deliberately short: this renders under the model selector, where the reader is deciding, not
// studying. The modal remains the full explanation.
export const MODEL_SUMMARY = {
  first_touch:
    '100% credit to the first source this visitor ever arrived from.',
  last_touch:
    '100% credit to the source on the page at the moment of conversion.',
  first_touch_non_direct:
    '100% credit to the earliest non-direct source; direct touches are skipped.',
  last_touch_non_direct:
    '100% credit to the latest non-direct source; direct touches are skipped.',
  linear:
    'Credit split equally across every touchpoint in the journey.',
  time_decay:
    'More credit the closer a touch is to the conversion (7-day half-life).',
  u_shaped:
    '40% to the first touch, 40% to the last, 20% split across the middle.',
  w_shaped:
    '30% each to the first, converting and last touch; 10% across the rest.',
  ai_platforms:
    'Credit to the most recent AI touchpoint seen before the conversion.'
}

// Multi-touch models spread credit; single-touch models give one touch everything. Mirrors
// MULTI_TOUCH_KEYS in ReportBuilder and the same split the explanation modal draws.
const MULTI_TOUCH = new Set(['linear', 'time_decay', 'u_shaped', 'w_shaped'])
export function isMultiTouchModel(key) {
  return MULTI_TOUCH.has(key)
}

export function modelSummary(key) {
  return MODEL_SUMMARY[key] || null
}
