/**
 * The bridge connection: roster fetch, SSE event feed, dispatch POST.
 *
 * Routing rule: an event carries `agent` only when the bridge itself dispatched
 * that session. Everything else is a session you drove yourself from the CLI or
 * the IDE, and is routed to the `operator` sprite — which is why the office is
 * alive even before you dispatch anything.
 */

const OPERATOR = 'operator';

export async function fetchRoster() {
  const res = await fetch('/api/roster');
  if (!res.ok) throw new Error(`roster failed: ${res.status}`);
  return res.json();
}

export async function dispatch(agent, prompt) {
  const res = await fetch('/api/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, prompt }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `dispatch failed: ${res.status}`);
  return body;
}

export async function fetchHistory(limit = 40) {
  const res = await fetch(`/api/history?limit=${limit}`);
  if (!res.ok) throw new Error(`history failed: ${res.status}`);
  return res.json();
}

export async function fetchSession(sessionId) {
  const res = await fetch(`/api/history/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`session failed: ${res.status}`);
  return res.json();
}

/** Continue a finished session at plan clearance — refine, don't restart. */
export async function followUp(sessionId, prompt) {
  const res = await fetch('/api/follow-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, prompt }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `follow-up failed: ${res.status}`);
  return body;
}

/** Escalate a read-only plan into a run that may write. The one gate that matters. */
export async function approve(sessionId) {
  const res = await fetch('/api/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `approve failed: ${res.status}`);
  return body;
}

export async function stopDispatch(sessionId) {
  const res = await fetch('/api/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `stop failed: ${res.status}`);
  return body;
}

export function ownerOf(event) {
  return event.agent ?? OPERATOR;
}

export { OPERATOR };

export function connectFeed({ onEvent, onStatus }) {
  const source = new EventSource('/api/events');

  source.onopen = () => onStatus?.('live');
  source.onerror = () => onStatus?.('reconnecting');
  source.onmessage = (message) => {
    let event;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    onEvent(event);
  };

  return () => source.close();
}
