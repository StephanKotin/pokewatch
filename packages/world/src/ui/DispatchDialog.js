import { dispatch, stopDispatch } from '../net/feed.js';
import { primeNotifications } from './notify.js';

/**
 * The dispatch dialog is plain DOM overlaid on the canvas, not Phaser text.
 * Text input, selection, paste and IME are solved problems in the browser and
 * genuinely painful inside a canvas — this is the boring, correct choice.
 */

let open = null;

/**
 * @param agent    roster entry
 * @param scene    WorldScene
 * @param runningSessionId  set when this agent already has a live dispatch — the
 *                          dialog then offers a brake instead of a second run.
 */
export function openDispatchDialog(agent, scene, runningSessionId = null) {
  closeDispatchDialog();

  const busy = Boolean(runningSessionId);

  const root = document.createElement('div');
  root.className = 'dialog-backdrop';
  root.innerHTML = `
    <div class="dialog" role="dialog" aria-label="Dispatch ${agent.name}">
      <header>
        <span class="dot" data-agent="${agent.name}"></span>
        <h2>${agent.name}</h2>
        <span class="model">${agent.model}</span>
        <button class="close" aria-label="Close">×</button>
      </header>
      <p class="desc">${escapeHtml(agent.description)}</p>
      <div class="clearance ${agent.clearance === 'plan' ? 'safe' : 'hot'}">
        ${agent.clearance === 'plan'
          ? 'PLAN — reads and reasons, cannot edit files'
          : 'ACCEPT EDITS — this agent can write to the repo'}
      </div>
      ${busy
        ? `<div class="busy">Already working. A dispatch bills for as long as it
             runs, so stop it rather than leaving it.</div>
           <footer>
             <span class="hint">session ${escapeHtml(runningSessionId.slice(0, 8))}</span>
             <button class="stop">Stop dispatch</button>
           </footer>`
        : `<textarea placeholder="What should ${agent.name} do?" rows="4"></textarea>
           <footer>
             <span class="hint">⌘↵ to dispatch</span>
             <button class="send">Dispatch</button>
           </footer>`}
      <p class="error" hidden></p>
    </div>`;

  const textarea = root.querySelector('textarea');
  const sendBtn = root.querySelector('.send');
  const stopBtn = root.querySelector('.stop');
  const errorEl = root.querySelector('.error');

  const fail = (err, btn, label) => {
    console.error('[world] dispatch dialog error:', err);
    errorEl.textContent = err?.message || String(err) || 'unknown error';
    errorEl.hidden = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = label;
    }
  };

  const send = async () => {
    const prompt = textarea.value.trim();
    if (!prompt) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Dispatching…';
    // Ask for notification permission at the moment it becomes useful, rather
    // than cold on page load.
    primeNotifications();
    try {
      const res = await dispatch(agent.name, prompt);
      scene.claimSession(res.sessionId, agent.name);
      closeDispatchDialog();
    } catch (err) {
      fail(err, sendBtn, 'Dispatch');
    }
  };

  const stop = async () => {
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping…';
    try {
      await stopDispatch(runningSessionId);
      closeDispatchDialog();
    } catch (err) {
      fail(err, stopBtn, 'Stop dispatch');
    }
  };

  // Phaser installs global pointer listeners and calls preventDefault() on
  // them, which suppresses the browser's synthesized `click` on DOM elements
  // layered over the canvas — the Dispatch button silently did nothing on a
  // real mouse click while a scripted .click() worked. Keep pointer events
  // inside the overlay so Phaser's input manager never sees them.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  sendBtn?.addEventListener('click', send);
  stopBtn?.addEventListener('click', stop);
  root.querySelector('.close').addEventListener('click', closeDispatchDialog);
  root.addEventListener('click', (e) => {
    if (e.target === root) closeDispatchDialog();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDispatchDialog();
  });
  textarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  });

  document.body.appendChild(root);
  (textarea ?? stopBtn)?.focus();
  open = root;
}

export function closeDispatchDialog() {
  open?.remove();
  open = null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
