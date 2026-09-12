/**
 * Tell the operator a run finished.
 *
 * Dispatches take 20 seconds to several minutes, so you will tab away — and
 * until this existed nothing called you back, which meant either babysitting
 * the tab or forgetting the run entirely.
 *
 * Three escalating channels, all cheap:
 *   1. the document title (always; visible in the tab strip)
 *   2. a favicon dot (always; visible when the tab is narrow)
 *   3. a desktop notification (only if you granted permission)
 */

const BASE_TITLE = 'Agent World';

let pending = 0;
let faviconEl = null;

/** Permission is requested on first dispatch, not at page load — asking cold is rude. */
export function primeNotifications() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function paintFavicon() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#1f2133';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#5a63a0';
  ctx.fillRect(6, 10, 20, 14);
  ctx.fillStyle = '#3ad6c0';
  ctx.fillRect(9, 13, 14, 6);

  if (pending > 0) {
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(size - 8, 8, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!faviconEl) {
    faviconEl = document.querySelector("link[rel='icon']") ?? document.createElement('link');
    faviconEl.rel = 'icon';
    document.head.appendChild(faviconEl);
  }
  faviconEl.href = canvas.toDataURL('image/png');
}

function paintTitle() {
  document.title = pending > 0 ? `(${pending}) ${BASE_TITLE}` : BASE_TITLE;
}

/** A run finished. Only counts as "unseen" if the tab isn't being looked at. */
export function notifyResult({ agent, status, phase, summary, changedFiles }) {
  const verb = status === 'ok' ? 'finished' : status === 'stopped' ? 'was stopped' : 'failed';
  const wrote = changedFiles ? ` · ${changedFiles} file${changedFiles === 1 ? '' : 's'} changed` : '';
  const body = `${phase} ${verb}${wrote}\n${(summary ?? '').slice(0, 140)}`;

  if (document.visibilityState !== 'visible') {
    pending += 1;
    paintTitle();
    paintFavicon();
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const n = new Notification(`${agent} ${verb}`, { body, tag: `world-${agent}`, silent: false });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch { /* some browsers throw without a service worker; title still updated */ }
  }
}

/** Clear the badge once the operator actually looks at the page. */
export function watchVisibility() {
  paintFavicon();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pending > 0) {
      pending = 0;
      paintTitle();
      paintFavicon();
    }
  });
}

export default { primeNotifications, notifyResult, watchVisibility };
