import { isPathExcluded } from '../api/lib/utils.js';
import assert from 'assert';

console.log('--- STARTING QA TEST: PATH EXCLUSIONS ---');

// Client-side helper copy to verify browser logic
function clientIsPathExcluded(path, patternsStr) {
  if (!patternsStr) return false;
  var patterns = patternsStr.split(',');
  for (var i = 0; i < patterns.length; i++) {
    var pat = patterns[i].trim();
    if (!pat) continue;
    if (pat.charAt(0) !== '/') pat = '/' + pat;
    if (pat.indexOf('*') !== -1) {
      var prefix = pat.replace(/\*/g, '');
      if (path.indexOf(prefix) === 0 || path === prefix.replace(/\/$/, '')) return true;
    } else if (path === pat) {
      return true;
    }
  }
  return false;
}

function runServerTests() {
  console.log('\nRunning server-side tests...');

  // Test Case 1: Empty patterns
  assert.strictEqual(isPathExcluded('/admin', []), false, 'Empty list should not exclude');
  assert.strictEqual(isPathExcluded('/admin', null), false, 'Null list should not exclude');

  // Test Case 2: Exact matches
  const exactPatterns = ['/admin', '/billing/invoice', 'checkout'];
  assert.strictEqual(isPathExcluded('/admin', exactPatterns), true, 'Exact match /admin should be excluded');
  assert.strictEqual(isPathExcluded('/admin/settings', exactPatterns), false, 'Subpath /admin/settings should NOT be excluded for exact pattern /admin');
  assert.strictEqual(isPathExcluded('/billing/invoice', exactPatterns), true, 'Exact match /billing/invoice should be excluded');
  assert.strictEqual(isPathExcluded('/checkout', exactPatterns), true, 'Exact match checkout without leading slash should be normalized and excluded');

  // Test Case 3: Wildcard patterns
  const wildcardPatterns = ['/admin/*', '/staging/*', 'hidden/*'];
  assert.strictEqual(isPathExcluded('/admin', wildcardPatterns), true, 'Wildcard /admin/* should match /admin');
  assert.strictEqual(isPathExcluded('/admin/dashboard', wildcardPatterns), true, 'Wildcard /admin/* should match subpath /admin/dashboard');
  assert.strictEqual(isPathExcluded('/admin/settings/security', wildcardPatterns), true, 'Wildcard /admin/* should match deeply nested subpath');
  assert.strictEqual(isPathExcluded('/administrator', wildcardPatterns), false, 'Wildcard /admin/* should NOT match /administrator');
  assert.strictEqual(isPathExcluded('/staging', wildcardPatterns), true, 'Wildcard /staging/* should match /staging');
  assert.strictEqual(isPathExcluded('/staging/index.html', wildcardPatterns), true, 'Wildcard /staging/* should match staging sub-file');
  assert.strictEqual(isPathExcluded('/hidden', wildcardPatterns), true, 'Normalized wildcard hidden/* should match /hidden');
  assert.strictEqual(isPathExcluded('/hidden/file', wildcardPatterns), true, 'Normalized wildcard hidden/* should match /hidden/file');

  // Test Case 4: URL inputs
  assert.strictEqual(isPathExcluded('https://example.com/admin/settings', wildcardPatterns), true, 'Full URL matching wildcard path should be excluded');
  assert.strictEqual(isPathExcluded('https://example.com/other', wildcardPatterns), false, 'Full URL not matching should not be excluded');

  console.log('✅ Server-side tests passed!');
}

function runClientTests() {
  console.log('\nRunning client-side tests...');

  // Test Case 1: Empty patterns
  assert.strictEqual(clientIsPathExcluded('/admin', ''), false);

  // Test Case 2: Exact matches
  const patterns = '/admin, /checkout, secret';
  assert.strictEqual(clientIsPathExcluded('/admin', patterns), true);
  assert.strictEqual(clientIsPathExcluded('/admin/settings', patterns), false);
  assert.strictEqual(clientIsPathExcluded('/checkout', patterns), true);
  assert.strictEqual(clientIsPathExcluded('/secret', patterns), true);

  // Test Case 3: Wildcards
  const wcPatterns = '/admin/*, /staging/*, test/*';
  assert.strictEqual(clientIsPathExcluded('/admin', wcPatterns), true);
  assert.strictEqual(clientIsPathExcluded('/admin/settings', wcPatterns), true);
  assert.strictEqual(clientIsPathExcluded('/staging/sub/page', wcPatterns), true);
  assert.strictEqual(clientIsPathExcluded('/test', wcPatterns), true);
  assert.strictEqual(clientIsPathExcluded('/test/nested', wcPatterns), true);
  assert.strictEqual(clientIsPathExcluded('/testing', wcPatterns), false);

  console.log('✅ Client-side tests passed!');
}

try {
  runServerTests();
  runClientTests();
  console.log('\n🎉 ALL PATH EXCLUSION TESTS PASSED SUCCESSFULLY! 🎉');
} catch (err) {
  console.error('\n❌ QA TEST FAILED:', err.message);
  process.exit(1);
}
