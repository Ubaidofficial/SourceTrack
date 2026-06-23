/**
 * Canonical conversion classifier
 */

export const LEAD_TYPES = [
  'lead_created',
  'qualified',
  'opportunity',
  'form',
  'lead',
  'signup',
  'sign_up',
  'trial',
  'free_trial',
  'meeting',
  'book_demo',
  'schedule_meeting',
  'contact_form',
  'mql'
];

export const CUSTOMER_TYPES = [
  'closed_won',
  'purchase'
];

/**
 * Classifies a raw conversion type string into 'lead', 'customer', or 'other'.
 * @param {string|null|undefined} type
 * @returns {'lead' | 'customer' | 'other'}
 */
export function classifyConversionType(type) {
  if (!type || typeof type !== 'string') {
    return 'other';
  }
  const normalized = type.trim().toLowerCase();
  if (LEAD_TYPES.includes(normalized)) {
    return 'lead';
  }
  if (CUSTOMER_TYPES.includes(normalized)) {
    return 'customer';
  }
  return 'other';
}
