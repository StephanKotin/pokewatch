const { test, expect } = require('@playwright/test');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const { DB_PATH } = require('./test-env');

// Covers the path that connects the two products: a guest buys something, then
// later gets a collector account on the same address, and the order follows
// them. The linking is deliberately *not* done at registration — an
// unverified address would let anyone claim a stranger's order and its
// shipping address — so the trigger under test here is admin approval.
//
// Checkout itself can't be driven end to end in this run: STRIPE_SECRET_KEY is
// blanked (see playwright.config.js), so the guest order is seeded straight
// into the DB in the paid state the webhook would have left it in. What is
// exercised for real is every path that runs after that.

// Serial, and not merely because the tests run in order: they share rows in one
// DB, and `fullyParallel: false` only stops parallelism *within* a file — files
// are still handed to separate workers, which runs this file's beforeAll once
// per worker and seeds the fixture twice.
test.describe.configure({ mode: 'serial' });

const BUYER_EMAIL = 'guest-buyer@pokewatch.local';
const BUYER_PASSWORD = 'guest-buyer-password';

let guestOrderId;
let pendingOrderId;

function db() {
  return new Database(DB_PATH);
}

test.beforeAll(async () => {
  const d = db();
  guestOrderId = crypto.randomUUID();
  pendingOrderId = crypto.randomUUID();

  // A paid guest order: email set by the webhook, user_id still NULL because
  // nobody was signed in when it was placed.
  d.prepare(
    `INSERT INTO orders (id, status, user_id, email, shipping_name, subtotal_cents, total_cents)
     VALUES (?, 'paid', NULL, ?, 'Guest Buyer', 1200, 1799)`
  ).run(guestOrderId, BUYER_EMAIL);
  d.prepare(
    `INSERT INTO order_items (order_id, product_id, name_snapshot, price_cents_snapshot, quantity)
     VALUES (?, NULL, 'Umbreon ex', 1200, 1)`
  ).run(guestOrderId);

  // An abandoned Stripe session on the same address. Must never surface as an
  // order to the customer, even once the account is linked.
  d.prepare(
    `INSERT INTO orders (id, status, user_id, email, subtotal_cents, total_cents)
     VALUES (?, 'pending', NULL, ?, 500, 500)`
  ).run(pendingOrderId, BUYER_EMAIL);
  d.close();
});

test('approving an account links the guest orders already on its email', async ({ request }) => {
  const register = await request.post('/api/auth/register', {
    data: { email: BUYER_EMAIL, password: BUYER_PASSWORD },
  });
  expect(register.ok()).toBeTruthy();

  const d = db();
  const { id: userId, approval_token: token } = d.prepare(
    "SELECT id, approval_token FROM users WHERE email = ? AND status = 'pending'"
  ).get(BUYER_EMAIL);
  d.close();

  // Registration alone must NOT link anything — the address is still just a
  // claim at this point.
  const beforeApproval = db();
  const unlinked = beforeApproval.prepare('SELECT user_id FROM orders WHERE id = ?').get(guestOrderId);
  beforeApproval.close();
  expect(unlinked.user_id).toBeNull();

  const approve = await request.get(`/api/admin/approve/${token}`);
  expect(approve.ok()).toBeTruthy();
  // The admin sees what the approval did, rather than it happening silently.
  // Two, not one: linkGuestOrders matches on email alone, so the abandoned
  // session is claimed as well as the paid order. That is deliberate — if that
  // session is ever completed, the webhook finds it already owned.
  expect(await approve.text()).toContain('linked 2 past orders');

  const after = db();
  const linked = after.prepare('SELECT user_id FROM orders WHERE id = ?').get(guestOrderId);
  const stillPending = after.prepare('SELECT user_id FROM orders WHERE id = ?').get(pendingOrderId);
  after.close();

  expect(linked.user_id).toBe(userId);
  // linkGuestOrders matches on email and ignores status, so the abandoned
  // session is linked too — it's excluded at read time, not at link time.
  expect(stillPending.user_id).toBe(userId);
});

test('a buyer sees their linked order, and never an abandoned session', async ({ request }) => {
  const login = await request.post('/api/auth/login', {
    data: { email: BUYER_EMAIL, password: BUYER_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();

  const res = await request.get('/api/orders', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const orders = await res.json();

  expect(orders).toHaveLength(1);
  expect(orders[0].id).toBe(guestOrderId);
  expect(orders[0].status).toBe('paid');
  expect(orders[0].total_cents).toBe(1799);
  expect(orders[0].items).toHaveLength(1);
  expect(orders[0].items[0].name_snapshot).toBe('Umbreon ex');
});

test('/api/orders requires a token and is scoped to the caller', async ({ request }) => {
  const anon = await request.get('/api/orders');
  expect(anon.status()).toBe(401);

  // A different account must not see the buyer's orders. There is no query
  // param that could widen this — the scope comes from the token.
  const other = 'other-shopper@pokewatch.local';
  await request.post('/api/auth/register', { data: { email: other, password: 'other-password' } });
  const d = db();
  const { approval_token } = d.prepare(
    "SELECT approval_token FROM users WHERE email = ? AND status = 'pending'"
  ).get(other);
  d.close();
  await request.get(`/api/admin/approve/${approval_token}`);

  const login = await request.post('/api/auth/login', {
    data: { email: other, password: 'other-password' },
  });
  const { token } = await login.json();
  const res = await request.get('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toHaveLength(0);
});

test('the Orders page renders the linked order in the real UI', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('you@example.com').fill(BUYER_EMAIL);
  await page.getByPlaceholder('Enter password').fill(BUYER_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('button', { name: 'Watchlist' })).toBeVisible();

  // A first-time account gets the welcome splash, whose overlay intercepts
  // pointer events on the whole header until it's dismissed. Matched loosely
  // because the label uses a typographic apostrophe (&rsquo;), not an ASCII one.
  await page.getByRole('button', { name: /Let.s Go/ }).click();

  await page.getByRole('button', { name: 'My Orders' }).click();

  // The item and the total Stripe actually charged, not the subtotal.
  await expect(page.getByText('Umbreon ex')).toBeVisible();
  await expect(page.getByText('$17.99')).toBeVisible();
  await expect(page.getByText('Paid')).toBeVisible();
  // The abandoned session must not be listed.
  await expect(page.getByText('$5.00')).toBeHidden();

  // Status labels have to track the vocabulary the server actually accepts
  // ('pending' | 'paid' | 'fulfilled' | 'cancelled'), not a plausible-looking
  // set. They didn't: 'fulfilled' — the normal state once an admin ships an
  // order — fell through to rendering the raw lowercase string.
  const d = db();
  d.prepare("UPDATE orders SET status = 'fulfilled' WHERE id = ?").run(guestOrderId);
  d.close();
  await page.reload();
  await expect(page.getByText('Shipped', { exact: true })).toBeVisible();
  await expect(page.getByText('fulfilled')).toBeHidden();
});

// The regression this guards is specific and nasty: src/api/*.js attaches the
// Authorization header to every request, and its handle401 deletes the token
// and reloads the page. If /api/checkout ever answered 401 for a stale token,
// a customer would be signed out mid-payment by a full page reload. 503 here
// is the unconfigured-store answer, and what matters is that it is not 401.
test('/api/checkout never 401s, whatever the token looks like', async ({ request }) => {
  for (const headers of [
    {},
    { Authorization: 'Bearer not-even-a-jwt' },
    { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJnaG9zdCJ9.bad-signature' },
    { Authorization: 'Basic whatever' },
  ]) {
    const res = await request.post('/api/checkout', {
      headers,
      data: { items: [{ productId: 'nope', quantity: 1 }] },
    });
    expect(res.status(), `unexpected status for headers ${JSON.stringify(headers)}`).not.toBe(401);
    expect(res.status()).toBe(503);
  }
});
