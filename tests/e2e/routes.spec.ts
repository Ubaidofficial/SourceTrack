import { test, expect } from '@playwright/test';

test.describe('Dashboard Protected Routes and Redirects', () => {
  let uncaughtExceptions: Error[] = [];
  let failedRequests: string[] = [];

  test.beforeEach(({ page }) => {
    uncaughtExceptions = [];
    failedRequests = [];

    // Capture uncaught JS exceptions
    page.on('pageerror', (exception) => {
      uncaughtExceptions.push(exception);
    });

    // Capture failed JS/CSS asset requests
    page.on('requestfailed', (request) => {
      const url = request.url();
      const isStaticAsset = url.endsWith('.js') || url.endsWith('.css') || url.includes('/assets/');
      if (isStaticAsset) {
        failedRequests.push(`${url}: ${request.failure()?.errorText || 'Failed asset load'}`);
      }
    });
  });

  test.afterEach(() => {
    // Assert no console JS exceptions occurred
    expect(uncaughtExceptions, `Uncaught exceptions: ${uncaughtExceptions.map(e => e.message).join(', ')}`).toEqual([]);
    // Assert no static assets failed to load
    expect(failedRequests, `Failed asset requests: ${failedRequests.join(', ')}`).toEqual([]);
  });

  const protectedRoutes = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/onboarding', label: 'Onboarding' },
    { path: '/app/integrations', label: 'Integrations' },
    { path: '/settings', label: 'Settings' },
    { path: '/billing', label: 'Billing' },
    { path: '/setup', label: 'Setup / Tracking Doctor' },
  ];

  for (const route of protectedRoutes) {
    test(`Unauthenticated redirection for ${route.path}`, async ({ page }) => {
      await page.goto(route.path);

      // Page should redirect unauthenticated users to the /login route
      await page.waitForURL('**/login');
      await expect(page).toHaveURL(/.*\/login/);
    });
  }

  test('API Health check', async ({ request }) => {
    const apiBase = process.env.SOURCETRACK_API_URL || 'https://sourcetrack-api-staging.up.railway.app';
    const url = `${apiBase.replace(/\/+$/, '')}/api/health`;

    console.log(`Pinging API health endpoint: ${url}`);
    const response = await request.get(url);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.request_id).toBeDefined();
  });

  test('Conditional authenticated routes E2E verification', async ({ page }) => {
    const email = process.env.SOURCETRACK_TEST_USER_EMAIL;
    const password = process.env.SOURCETRACK_TEST_USER_PASSWORD;

    if (!email || !password) {
      console.log('SKIPPED — credentials not provided.');
      test.skip(true, 'Test credentials (SOURCETRACK_TEST_USER_EMAIL and SOURCETRACK_TEST_USER_PASSWORD) not provided.');
      return;
    }

    // Authenticate
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Verify successful login
    await page.waitForURL('**/dashboard');
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify reaching protected routes when logged in
    for (const route of protectedRoutes) {
      // Skip Onboarding check if they have completed it and it auto-redirects to Dashboard,
      // and skip Dashboard since we are already on it.
      if (route.path === '/onboarding' || route.path === '/dashboard') {
        continue;
      }

      await page.goto(route.path);
      // Verify we stay on the requested route and do not get bounced to login
      await expect(page).not.toHaveURL(/.*\/login/);

      // Verify standard app layout container is present
      const sidebar = page.locator('aside, nav, div', { hasText: /Sign out/i });
      await expect(sidebar.first()).toBeVisible();
    }
  });
});
