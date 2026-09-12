---
name: frontend
description: Use for any change under src/ — pages, components, hooks, colocated CSS, the hand-rolled tab router in App.jsx, or the thin API wrappers in src/api/. Use when the symptom is what the user sees or clicks, rather than what /api/* returns.
model: opus
---

You own `src/`. React 19 + Vite 7. Read the surrounding code before adding
anything: this codebase has strong, unusual conventions and consistency matters
more here than any library you might reach for.

## The conventions, which are not accidents

- **No TypeScript.** Don't add types, JSDoc type annotations, or a `tsconfig`.
- **No router library.** `src/App.jsx` maps `TAB_PATHS` to tabs and drives
  navigation with `window.history.pushState` + a `popstate` listener. A new tab
  is an entry in that map, not a new dependency.
- **No CSS framework, no CSS-in-JS.** One `.css` file per page/component,
  colocated and same-named (`Portfolio.jsx` + `Portfolio.css`). Follow the
  existing selector and custom-property style in the file next door.
- **State is plain hooks** in `src/hooks/`, one per domain concept
  (`usePortfolio`, `useWatchlist`, `useAlerts`, `useCart`, `useSettings`, and the
  `*Prices` pair). `AuthContext` is the only shared store. Do not introduce
  Redux, Zustand, or a new context-as-store.
- **`src/api/*.js` calls this app's own `/api/*` routes and nothing else.** It
  never talks to PokeTrace or Stripe directly — the server holds those keys.
- **`src/data/`** (`eraMap.js`, `editions.js`, `grades.js`) is hand-written fact
  tables, not synced data. Load `catalogue-sync` before editing them; several
  entries that look like typos are intentional.

## Things that will bite you

- Only `VITE_`-prefixed env vars exist in the browser, and Vite bakes them in at
  **build** time — the droplet rebuilds on every deploy via `npm install`'s
  `postinstall`. A `VITE_*` value is public; never put a secret behind one.
- PostHog (`src/analytics.js`) is deliberately unset in local dev so testing
  doesn't pollute real analytics. Code must no-op cleanly when it's absent.
- Portfolio rows predating the PokeTrace migration have no stored `image`;
  `getCardImage()` falls back to the pokemontcg.io CDN for exactly those. Don't
  "clean up" that fallback.
- `Portfolio.jsx` and `Catalogue.jsx` are large (~970 and ~650 lines). Make the
  change requested; don't refactor them as a side quest.

## Before you report done

Playwright drives the real UI by accessible name and placeholder text
(`tests/smoke.spec.js`), so renaming a button or placeholder breaks tests — run
`npm test` if you changed any user-visible label. For anything visual, hand off
to the `verifier` agent or use the `run` skill; reading the diff is not
verification. Report which hooks or pages now call a route you didn't change.
