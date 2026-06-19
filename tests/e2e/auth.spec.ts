import { test, expect } from '@playwright/test';

test.describe('Authentication Routes Smoke Check', () => {
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

  test('/login renders correctly', async ({ page }) => {
    await page.goto('/login');

    // Check page title and structure
    await expect(page).toHaveTitle(/SourceTrack/);

    // Verify essential elements exist on page
    const loginHeader = page.locator('h1, h2', { hasText: 'SourceTrack' });
    await expect(loginHeader.first()).toBeVisible();

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');
    const googleBtn = page.locator('button', { hasText: /Google/i });
    const forgotPwdLink = page.locator('a[href="/forgot-password"]');
    const signupLink = page.locator('a[href="/signup"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(googleBtn).toBeVisible();
    await expect(forgotPwdLink).toBeVisible();
    await expect(signupLink).toBeVisible();
  });

  test('/signup renders correctly', async ({ page }) => {
    await page.goto('/signup');

    await expect(page).toHaveTitle(/SourceTrack/);

    const signupHeader = page.locator('h1, h2', { hasText: 'SourceTrack' });
    await expect(signupHeader.first()).toBeVisible();

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');
    const loginLink = page.locator('a[href="/login"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(loginLink).toBeVisible();
  });

  test('/forgot-password renders correctly', async ({ page }) => {
    await page.goto('/forgot-password');

    await expect(page).toHaveTitle(/SourceTrack/);

    const emailInput = page.locator('input[type="email"]');
    const submitBtn = page.locator('button[type="submit"]');
    const loginLink = page.locator('a[href="/login"]');

    await expect(emailInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(loginLink).toBeVisible();
  });

  test('/reset-password without active session renders guard message', async ({ page }) => {
    await page.goto('/reset-password');

    await expect(page).toHaveTitle(/SourceTrack/);

    // Check that guard/alert message is present
    const guardMsg = page.locator('text=No active password reset session found. Please request a new link.');
    await expect(guardMsg).toBeVisible();

    const forgotLink = page.locator('a[href="/forgot-password"]');
    await expect(forgotLink).toBeVisible();
  });

  test('/auth/callback without token redirects to /login cleanly', async ({ page }) => {
    await page.goto('/auth/callback');

    // Should redirect client-side to login
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('Conditional login check', async ({ page }) => {
    const email = process.env.SOURCETRACK_TEST_USER_EMAIL;
    const password = process.env.SOURCETRACK_TEST_USER_PASSWORD;

    if (!email || !password) {
      console.log('SKIPPED — credentials not provided.');
      test.skip(true, 'Test credentials (SOURCETRACK_TEST_USER_EMAIL and SOURCETRACK_TEST_USER_PASSWORD) not provided.');
      return;
    }

    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Verify it navigates to /dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(page).toHaveURL(/.*\/dashboard/);
  });
});
