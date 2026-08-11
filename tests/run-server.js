// Playwright's webServer.command is the one point guaranteed to run exactly
// once per test run — unlike playwright.config.js, which gets require()'d
// again in each worker process. Deleting the previous run's DB here (instead
// of at config load time) avoids racing a delete against the already-running
// server's open connection.
const fs = require('fs');
const { DB_PATH } = require('./test-env');

fs.rmSync(DB_PATH, { force: true });
require('../server.js');
