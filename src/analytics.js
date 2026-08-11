import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let enabled = false;

// No-op locally unless VITE_POSTHOG_KEY is set (it isn't, on purpose, in
// local dev) — otherwise every local test click would land in the real
// PostHog project. Pageviews are captured manually on tab change rather
// than PostHog's default autocapture, since this app navigates via
// history.pushState between tabs, not full page loads.
export function initAnalytics() {
  if (!POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
  });
  enabled = true;
}

export function trackPageview(tab) {
  if (!enabled) return;
  posthog.capture('$pageview', { tab });
}

export function identifyUser(user) {
  if (!enabled || !user) return;
  posthog.identify(user.id, { email: user.email });
}

export function resetAnalytics() {
  if (!enabled) return;
  posthog.reset();
}
