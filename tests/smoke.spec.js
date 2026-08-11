const { test, expect } = require('@playwright/test');
const Database = require('better-sqlite3');
const { DB_PATH, TEST_USER_EMAIL, TEST_USER_PASSWORD } = require('./test-env');

// Exercises the real registration -> approval -> login path end to end, the
// same one every real user goes through. The only shortcut taken is reading
// the approval token straight from the DB instead of an inbox, since
// ADMIN_EMAIL/RESEND_API_KEY aren't configured for this run.
test.beforeAll(async ({ request }) => {
  const register = await request.post('/api/auth/register', {
    data: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
  });
  expect(register.ok()).toBeTruthy();

  const db = new Database(DB_PATH);
  const { approval_token } = db.prepare(
    "SELECT approval_token FROM users WHERE email = ? AND status = 'pending'"
  ).get(TEST_USER_EMAIL);
  db.close();
  expect(approval_token).toBeTruthy();

  const approve = await request.get(`/api/admin/approve/${approval_token}`);
  expect(approve.ok()).toBeTruthy();
});

test('sign in with an approved account reaches the app', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('you@example.com').fill(TEST_USER_EMAIL);
  await page.getByPlaceholder('Enter password').fill(TEST_USER_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('button', { name: 'Watchlist' })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeHidden();
});

test('a wrong password is rejected', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('you@example.com').fill(TEST_USER_EMAIL);
  await page.getByPlaceholder('Enter password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText('Invalid email or password')).toBeVisible();
});
