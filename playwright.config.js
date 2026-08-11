const { defineConfig, devices } = require('@playwright/test');
const { DB_PATH, PORT, JWT_SECRET } = require('./tests/test-env');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node tests/run-server.js',
    url: `http://localhost:${PORT}`,
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      JWT_SECRET,
      DB_PATH,
      APP_BASE_URL: `http://localhost:${PORT}`,
      // Explicitly blanked (not just omitted) so dotenv can't backfill the
      // real values from .env — sending live email from a test run would
      // hit the developer's actual Resend account. Missing key = sendEmail
      // logs a warning and no-ops, which is fine since the smoke test
      // approves the account itself via the admin route, not via inbox.
      RESEND_API_KEY: '',
      ADMIN_EMAIL: '',
    },
  },
});
