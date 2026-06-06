import {
  isValidTimezone,
  getLocalDateString,
  getLocalMonthString,
  getLocalWeekString,
  getPaddedUtcDateRange
} from '../api/lib/utils.js';
import assert from 'assert';

console.log('--- STARTING QA TEST: TIMEZONE AND DATE BUCKETS ---');

function testTimezoneValidation() {
  console.log('\nRunning timezone validation tests...');

  // Valid timezones
  assert.strictEqual(isValidTimezone('UTC'), true, 'UTC should be valid');
  assert.strictEqual(isValidTimezone('America/New_York'), true, 'America/New_York should be valid');
  assert.strictEqual(isValidTimezone('Europe/London'), true, 'Europe/London should be valid');
  assert.strictEqual(isValidTimezone('Asia/Tokyo'), true, 'Asia/Tokyo should be valid');
  assert.strictEqual(isValidTimezone('Asia/Kolkata'), true, 'Asia/Kolkata should be valid');

  // Invalid timezones
  assert.strictEqual(isValidTimezone('America/Invalid_TZ'), false, 'Invalid timezone should be false');
  assert.strictEqual(isValidTimezone('Invalid/Name'), false, 'Non-existent timezone should be false');
  assert.strictEqual(isValidTimezone(''), false, 'Empty string timezone should be false');
  assert.strictEqual(isValidTimezone(null), false, 'Null timezone should be false');
  assert.strictEqual(isValidTimezone(undefined), false, 'Undefined timezone should be false');

  // Safety checks (prevent injection/malformed strings)
  assert.strictEqual(isValidTimezone('America/New_York; DROP TABLE sites'), false, 'Injection attempt should be false');
  assert.strictEqual(isValidTimezone('../etc/passwd'), false, 'Path traversal attempt should be false');
  assert.strictEqual(isValidTimezone('UTC+0'), false, 'Invalid characters in UTC+0 should be false');

  console.log('✅ Timezone validation tests passed!');
}

function testLocalDateString() {
  console.log('\nRunning local date string formatting tests...');

  // Date: Thursday, March 5th, 2026 at 23:00:00 UTC (1772751600000 ms)
  const d = new Date(1772751600000);

  // In New York (EST is UTC-5): Thursday, March 5th, 2026, 18:00:00 -> 2026-03-05
  assert.strictEqual(getLocalDateString(d, 'America/New_York'), '2026-03-05');

  // In Tokyo (JST is UTC+9): Friday, March 6th, 2026, 08:00:00 -> 2026-03-06
  assert.strictEqual(getLocalDateString(d, 'Asia/Tokyo'), '2026-03-06');

  // In London (GMT is UTC+0): Thursday, March 5th, 2026, 23:00:00 -> 2026-03-05
  assert.strictEqual(getLocalDateString(d, 'Europe/London'), '2026-03-05');

  // Fallback to UTC on invalid timezone
  assert.strictEqual(getLocalDateString(d, 'Invalid_TZ_Here'), '2026-03-05');

  console.log('✅ Local date string formatting tests passed!');
}

function testLocalMonthString() {
  console.log('\nRunning local month string formatting tests...');

  // Date: Thursday, March 5th, 2026 at 23:00:00 UTC
  const d1 = new Date(1772751600000);
  assert.strictEqual(getLocalMonthString(d1, 'America/New_York'), '2026-03');
  assert.strictEqual(getLocalMonthString(d1, 'Asia/Tokyo'), '2026-03');

  // Date: Wednesday, December 31st, 2025 at 23:00:00 UTC (1767222000000 ms)
  const d2 = new Date(1767222000000);
  // In New York (EST is UTC-5): Dec 31st, 2025 -> 2025-12
  assert.strictEqual(getLocalMonthString(d2, 'America/New_York'), '2025-12');
  // In Tokyo (JST is UTC+9): Jan 1st, 2026 -> 2026-01
  assert.strictEqual(getLocalMonthString(d2, 'Asia/Tokyo'), '2026-01');

  console.log('✅ Local month string formatting tests passed!');
}

function testLocalWeekString() {
  console.log('\nRunning local week string formatting tests...');

  // Thursday, March 5th, 2026 at 23:00:00 UTC. The Monday of this week is March 2nd, 2026.
  const d1 = new Date(1772751600000);
  assert.strictEqual(getLocalWeekString(d1, 'UTC'), '2026-03-02');
  assert.strictEqual(getLocalWeekString(d1, 'America/New_York'), '2026-03-02');

  // Sunday, March 8th, 2026 at 23:00:00 UTC. In UTC/EST, Monday of this week is March 2nd.
  const d2 = new Date(1773010800000);
  assert.strictEqual(getLocalWeekString(d2, 'UTC'), '2026-03-02');
  assert.strictEqual(getLocalWeekString(d2, 'America/New_York'), '2026-03-02');

  // But in Tokyo (JST is UTC+9), Sunday March 8th 23:00:00 UTC shifts to Monday, March 9th 08:00:00 JST.
  // The Monday of that JST week is March 9th.
  assert.strictEqual(getLocalWeekString(d2, 'Asia/Tokyo'), '2026-03-09');

  console.log('✅ Local week string formatting tests passed!');
}

function testPaddedUtcDateRange() {
  console.log('\nRunning padded UTC date range calculation tests...');

  const range = getPaddedUtcDateRange('2026-06-01', '2026-06-05');
  assert.deepStrictEqual(range, { from: '2026-05-31', to: '2026-06-06' });

  const rangeWrap = getPaddedUtcDateRange('2026-03-01', '2026-03-01');
  assert.deepStrictEqual(rangeWrap, { from: '2026-02-28', to: '2026-03-02' });

  console.log('✅ Padded UTC date range calculation tests passed!');
}

try {
  testTimezoneValidation();
  testLocalDateString();
  testLocalMonthString();
  testLocalWeekString();
  testPaddedUtcDateRange();
  console.log('\n🎉 ALL TIMEZONE QA UNIT TESTS PASSED SUCCESSFULLY! 🎉');
} catch (err) {
  console.error('\n❌ QA TEST FAILED:', err.stack || err.message);
  process.exit(1);
}
