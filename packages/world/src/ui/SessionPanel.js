import { fetchHistory, fetchSession, approve, stopDispatch, followUp } from '../net/feed.js';
import { renderMarkdown } from './markdown.js';

/**
 * The side panel — the thing that makes a dispatch worth making.
 *
 * Before this existed the only output was a speech bubble clipped to 68
 * characters that vanished after nine seconds, so the actual answer (the plan,
 * the audit, the findings) was unreadable and the loop dead-ended. This shows
 * the full result, the tool timeline, cost and duration, and it is where a plan
 * gets approved.
 */

/**
 * Cost is ALWAYS shown as an estimate, and the phrasing is deliberate.
 *
 * The CLI reports `total_cost_usd` — tokens priced at API list rates — whether
 * you authenticate with an API key or a Claude subscription. On a subscription
 * that figure is not money charged; the usage draws against rate limits
 * instead. Labelling it "spend" implied a card charge that doesn't exist.
 *
 * "API-equivalent token cost" is true under both auth modes, so the label needs
 * no fragile sniffing of how the user happens to be signed in.
 */
const COST_TITLE =
  'Estimated API-equivalent token cost. On a Claude subscription this is not ' +
  'billed spend — usage draws against your rate limits instead.';

const fmtCost = (n) => (typeof n === 'number' ? `~$${n.toFixed(4)}` : '—');
const fmtDur = (ms) =>
  typeof ms !== 'number' ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/**
 * Colourise a unified diff. Classified per line, and the order matters: `+++`
 * and `---` file headers must be tested before `+`/`-` content lines or every
 * header renders as an added/removed line.
 */
function renderPatch(patch) {
  return patch
    .split('\n')
    .map((line) => {
      let cls = 'ctx';
      if (line.startsWith('diff --git') || line.startsWith('index ') ||
          line.startsWith('new file') || line.startsWith('deleted file')) cls = 'meta';
      else if (line.startsWith('+++') || line.startsWith('---')) cls = 'meta';
      else if (line.startsWith('@@')) cls = 'hunk';
      else if (line.startsWith('+')) cls = 'add';
      else if (line.startsWith('-')) cls = 'del';
      else if (line.startsWith('…')) cls = 'hunk';
      return `<span class="dl ${cls}">${esc(line) || '&nbsp;'}</span>`;
    })
    .join('\n');
}

export class SessionPanel {
  constructor(root) {
    this.root = root;
    this.selected = null;
    /** Live tool activity per session, merged with persisted history. */
    this.liveTimeline = new Map();
    this.sessions = [];
    this.totalCostUsd = 0;
    this.approveClearance = 'acceptEdits';
    this.render();
  }

  async refresh() {
    try {
      const data = await fetchHistory();
      this.sessions = data.sessions ?? [];
      this.totalCostUsd = data.totalCostUsd ?? 0;
      if (!this.selected && this.sessions.length) this.selected = this.sessions[0].sessionId;
      await this.loadDetail();
    } catch {
      /* bridge down; the world already surfaces that */
    }
    this.render();
  }

  async loadDetail() {
    if (!this.selected) {
      this.detail = null;
      return;
    }
    try {
      this.detail = await fetchSession(this.selected);
    } catch {
      this.detail = null;
    }
  }

  async select(sessionId) {
    this.selected = sessionId;
    await this.loadDetail();
    this.render();
  }

  /** Called for every feed event so the panel stays live, not poll-driven. */
  async onEvent(event) {
    if (typeof event.totalCostUsd === 'number') this.totalCostUsd = event.totalCostUsd;

    if (event.kind === 'tool_use' || event.kind === 'task_spawn') {
      if (!event.agent) return; // own-session traffic isn't a dispatch
      const list = this.liveTimeline.get(event.sessionId) ?? [];
      list.push({ ts: event.ts, tool: event.tool, summary: event.summary, isSidechain: event.isSidechain });
      this.liveTimeline.set(event.sessionId, list);
      if (event.sessionId === this.selected) this.render();
      return;
    }

    if (event.kind === 'dispatch_start') {
      this.liveTimeline.set(event.sessionId, []);
      this.selected = event.sessionId;
      await this.refresh();
      return;
    }

    if (event.kind === 'dispatch_result') {
      await this.refresh();
    }
  }

  /** Persisted timeline plus anything that arrived since the last fetch. */
  timelineFor(sessionId) {
    const persisted = this.detail?.sessionId === sessionId ? this.detail.timeline ?? [] : [];
    const live = this.liveTimeline.get(sessionId) ?? [];
    // The bridge persists the same entries it broadcasts, so prefer whichever
    // is longer rather than concatenating and double-counting.
    return live.length > persisted.length ? live : persisted;
  }

  render() {
    const detail = this.detail;
    const runs = detail?.runs ?? [];
    const last = runs[runs.length - 1] ?? null;
    const timeline = detail ? this.timelineFor(detail.sessionId) : [];

    const canApprove =
      last && last.status === 'ok' && last.clearance !== this.approveClearance;
    const isRunning = last?.status === 'running';

    this.root.innerHTML = `
      <div class="panel-head">
        <h1>Agent World</h1>
        <span class="total" title="${esc(COST_TITLE)}">
          ${fmtCost(this.totalCostUsd)} est.
        </span>
      </div>

      <div class="panel-body">
        <section class="sessions">
          <h2>Dispatches <span class="count">${this.sessions.length}</span></h2>
          ${this.sessions.length === 0
            ? '<p class="empty">No dispatches yet. Click an agent in the world.</p>'
            : `<ul>${this.sessions.map((s) => this.renderRow(s)).join('')}</ul>`}
        </section>

        ${detail ? this.renderDetail(detail, runs, last, timeline, { canApprove, isRunning }) : ''}
      </div>`;

    this.root.querySelectorAll('[data-session]').forEach((el) => {
      el.addEventListener('click', () => this.select(el.dataset.session));
    });

    const approveBtn = this.root.querySelector('.approve');
    approveBtn?.addEventListener('click', () => this.doApprove(approveBtn));

    const stopBtn = this.root.querySelector('.panel-stop');
    stopBtn?.addEventListener('click', () => this.doStop(stopBtn));

    const fuBtn = this.root.querySelector('.fu-send');
    const fuText = this.root.querySelector('.fu-text');
    fuBtn?.addEventListener('click', () => this.doFollowUp(fuBtn, fuText));
    fuText?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.doFollowUp(fuBtn, fuText);
    });
    // A re-render mid-typing would wipe the box; keep the draft across renders.
    if (fuText && this.draft) fuText.value = this.draft;
    fuText?.addEventListener('input', () => { this.draft = fuText.value; });
  }

  renderRow(s) {
    const last = s.runs?.[s.runs.length - 1];
    const status = last?.status ?? 'unknown';
    const phases = (s.runs ?? []).map((r) => r.phase[0].toUpperCase()).join('');
    return `
      <li data-session="${esc(s.sessionId)}"
          class="${s.sessionId === this.selected ? 'active' : ''} status-${esc(status)}">
        <span class="dot" data-agent="${esc(s.agent)}"></span>
        <span class="who">${esc(s.agent)}</span>
        <span class="phases" title="run phases">${esc(phases)}</span>
        <span class="when">${fmtTime(last?.startedAt ?? s.runs?.[0]?.startedAt)}</span>
      </li>`;
  }

  renderDetail(detail, runs, last, timeline, { canApprove, isRunning }) {
    return `
      <section class="detail">
        <header>
          <span class="dot" data-agent="${esc(detail.agent)}"></span>
          <h2>${esc(detail.agent)}</h2>
          <span class="badge status-${esc(last?.status)}">${esc(last?.status ?? '—')}</span>
          ${last?.clearance ? `<span class="badge clr">${esc(last.clearance)}</span>` : ''}
        </header>

        <dl class="stats">
          <div title="${esc(COST_TITLE)}"><dt>cost est.</dt><dd>${fmtCost(last?.costUsd)}</dd></div>
          <div><dt>duration</dt><dd>${fmtDur(last?.durationMs)}</dd></div>
          <div><dt>turns</dt><dd>${last?.numTurns ?? '—'}</dd></div>
          <div><dt>runs</dt><dd>${runs.length}</dd></div>
        </dl>

        ${this.renderTurns(runs)}

        <h3>Activity <span class="count">${timeline.length}${detail.truncated ? '+' : ''}</span></h3>
        ${timeline.length === 0
          ? '<p class="empty">No tool calls recorded.</p>'
          : `<ol class="timeline">${timeline
              .slice(-60)
              .map(
                (t) => `<li class="${t.isSidechain ? 'sidechain' : ''}">
                  <span class="t">${fmtTime(t.ts)}</span>
                  <span class="tool">${esc(t.tool)}</span>
                  <span class="sum">${esc(t.summary)}</span>
                </li>`,
              )
              .join('')}</ol>`}

        ${this.renderChanges(last)}

        <h3>Result</h3>
        <div class="result md ${last?.status === 'error' ? 'bad' : ''}">${
          isRunning
            ? '<span class="working">working…</span>'
            : last?.result
              ? renderMarkdown(last.result)
              : '—'
        }</div>

        ${isRunning
          ? ''
          : `<h3>Reply</h3>
             <div class="followup">
               <textarea class="fu-text" rows="2"
                 placeholder="Refine the plan — e.g. &quot;good, but don't touch the cron job&quot;"></textarea>
               <div class="fu-row">
                 <span class="hint">⌘↵ to send · stays at plan clearance</span>
                 <button class="fu-send" data-for="${esc(detail.sessionId)}">Send</button>
               </div>
             </div>`}

        <footer class="actions">
          ${isRunning
            ? `<button class="panel-stop" data-for="${esc(detail.sessionId)}">Stop</button>`
            : ''}
          ${canApprove
            ? `<button class="approve" data-for="${esc(detail.sessionId)}">
                 Approve &amp; execute — ${esc(detail.agent)}
               </button>
               <span class="approve-note">re-runs this session with
               <strong>${esc(this.approveClearance)}</strong> — it can write to the repo</span>`
            : ''}
          <p class="panel-error" hidden></p>
        </footer>
      </section>`;
  }

  /**
   * Approve escalates clearance to one that can write to the repo, so it acts
   * on the session the button was RENDERED for, never on `this.selected`.
   *
   * Those can differ: a `dispatch_start` arriving between render and click
   * re-selects the panel, which would otherwise move the button under the
   * cursor and escalate a session the user never looked at.
   */
  /**
   * The session as a conversation: every run is a turn, oldest first, with the
   * current one last. A session is no longer one prompt and one answer — it is
   * plan → follow-up → follow-up → approve, and the earlier turns are the
   * context you need to judge the latest.
   *
   * Only the final turn's result is shown in full (below, in Result); earlier
   * turns collapse to their prompt and outcome.
   */
  renderTurns(runs) {
    if (runs.length === 0) return '';

    const PHASE_LABEL = { plan: 'plan', 'follow-up': 'follow-up', approve: 'approve' };

    const turns = runs
      .map((run, i) => {
        const isLast = i === runs.length - 1;
        return `<li class="turn phase-${esc(run.phase)} ${isLast ? 'current' : ''}">
          <span class="turn-phase">${esc(PHASE_LABEL[run.phase] ?? run.phase)}</span>
          <span class="turn-prompt">${esc(run.prompt ?? '')}</span>
          ${!isLast && run.result
            ? `<span class="turn-result">${esc(run.result.slice(0, 150))}</span>`
            : ''}
        </li>`;
      })
      .join('');

    return `<h3>Conversation <span class="count">${runs.length} turn${runs.length === 1 ? '' : 's'}</span></h3>
      <ol class="turns">${turns}</ol>`;
  }

  /**
   * What the run did to the working tree, measured by the bridge.
   *
   * This is the independent account. The Result section is the agent narrating
   * its own work; this section is what actually changed on disk. When an
   * approve run can write to a repo with real user data, those must not be the
   * same source.
   */
  renderChanges(run) {
    if (!run || run.status === 'running') return '';

    const changes = run.changes;
    if (!changes) {
      return `<h3>Working tree</h3>
        <p class="empty">Not measured for this run.</p>`;
    }

    const { files, added, removed } = changes.totals;

    if (files === 0) {
      return `<h3>Working tree</h3>
        <p class="no-changes">✓ nothing changed while this run was in flight</p>`;
    }

    // Honest framing: this is measured over the run's time window, so a file
    // you edited yourself mid-run lands here too. During a plan run the agent
    // provably cannot write, which makes any entry external by definition.
    const caveat = run.phase === 'plan'
      ? `<p class="chg-note warn">Plan clearance cannot write — anything listed here
         changed from outside this run.</p>`
      : `<p class="chg-note">Measured over this run's time window, so your own
         concurrent edits appear here too.</p>`;

    const rows = changes.changed
      .map(
        (f) => `<li class="chg-${esc(f.change)}">
          <span class="mark">${f.change === 'added' ? 'A' : f.change === 'deleted' ? 'D' : 'M'}</span>
          <span class="path">${esc(f.path)}</span>
          <span class="counts"><span class="plus">+${f.added}</span><span class="minus">−${f.removed}</span></span>
        </li>`,
      )
      .join('');

    return `
      <h3>Working tree
        <span class="count">${files} file${files === 1 ? '' : 's'}</span>
        <span class="plus">+${added}</span><span class="minus">−${removed}</span>
      </h3>
      ${caveat}
      <ul class="changed">${rows}</ul>
      ${changes.patch
        ? `<details class="patch">
             <summary>View diff${changes.truncated ? ' (truncated)' : ''}</summary>
             <pre>${renderPatch(changes.patch)}</pre>
           </details>`
        : ''}`;
  }

  async doApprove(btn) {
    const sessionId = btn.dataset.for;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Approving…';
    try {
      await approve(sessionId);
    } catch (err) {
      this.showError(err.message);
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async doFollowUp(btn, textarea) {
    const prompt = textarea?.value.trim();
    if (!prompt) return;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await followUp(btn.dataset.for, prompt);
      this.draft = '';
    } catch (err) {
      this.showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  }

  async doStop(btn) {
    const sessionId = btn.dataset.for;
    btn.disabled = true;
    btn.textContent = 'Stopping…';
    try {
      await stopDispatch(sessionId);
    } catch (err) {
      this.showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Stop';
    }
  }

  showError(message) {
    const el = this.root.querySelector('.panel-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }
}

export default SessionPanel;
