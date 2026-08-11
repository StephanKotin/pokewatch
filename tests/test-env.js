const path = require('path');

// Shared between playwright.config.js (which boots the server) and the specs
// (which register/approve a throwaway account against that same server).
module.exports = {
  DB_PATH: path.join(__dirname, '.tmp-test.db'),
  PORT: 4310,
  JWT_SECRET: 'playwright-smoke-test-secret-not-for-prod',
  TEST_USER_EMAIL: 'smoke-test@pokewatch.local',
  TEST_USER_PASSWORD: 'smoke-test-password',
};
