/**
 * GBA-style dialogue box.
 *
 * Plain DOM pinned to the bottom of the viewport rather than drawn in the
 * canvas: the box is chrome, not world, and DOM gives real text wrapping and
 * selectable content for free.
 *
 * The typewriter reveal is not decoration — it is the thing that makes a
 * Pokémon textbox feel like a Pokémon textbox. Pressing the advance key while
 * text is still revealing snaps it to full, which is also the GBA behaviour.
 */

const CHAR_MS = 18;

export class TextBox {
  constructor(root) {
    this.root = root;
    this.pages = [];
    this.page = 0;
    this.revealTimer = null;
    this.revealed = 0;
    this.onDone = null;
    this.choices = null;
    this.choiceIndex = 0;

    this.el = document.createElement('div');
    this.el.className = 'textbox';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="tb-frame">
        <p class="tb-name" hidden></p>
        <p class="tb-text"></p>
        <span class="tb-more" hidden>▼</span>
        <ul class="tb-choices" hidden></ul>
      </div>`;
    root.appendChild(this.el);

    this.nameEl = this.el.querySelector('.tb-name');
    this.textEl = this.el.querySelector('.tb-text');
    this.moreEl = this.el.querySelector('.tb-more');
    this.choicesEl = this.el.querySelector('.tb-choices');
  }

  get open() {
    return !this.el.hidden;
  }

  /**
   * @param text  string, or array of pages
   * @param opts  { name, choices: [{label, value, onSelect}], onDone }
   */
  show(text, opts = {}) {
    this.pages = Array.isArray(text) ? [...text] : [text];
    this.page = 0;
    this.onDone = opts.onDone ?? null;
    this.choices = opts.choices ?? null;
    this.choiceIndex = 0;

    if (opts.name) {
      this.nameEl.textContent = opts.name;
      this.nameEl.hidden = false;
    } else {
      this.nameEl.hidden = true;
    }

    this.el.hidden = false;
    this.renderPage();
  }

  renderPage() {
    clearInterval(this.revealTimer);
    const full = this.pages[this.page] ?? '';
    this.full = full;
    this.revealed = 0;
    this.textEl.textContent = '';
    this.moreEl.hidden = true;
    this.choicesEl.hidden = true;

    this.revealTimer = setInterval(() => {
      this.revealed += 1;
      this.textEl.textContent = full.slice(0, this.revealed);
      if (this.revealed >= full.length) this.finishReveal();
    }, CHAR_MS);
  }

  finishReveal() {
    clearInterval(this.revealTimer);
    this.revealTimer = null;
    this.textEl.textContent = this.full;

    const lastPage = this.page >= this.pages.length - 1;
    if (!lastPage) {
      this.moreEl.hidden = false;
      return;
    }
    if (this.choices) this.renderChoices();
    else this.moreEl.hidden = false;
  }

  renderChoices() {
    this.choicesEl.innerHTML = this.choices
      .map(
        (c, i) =>
          `<li class="${i === this.choiceIndex ? 'sel' : ''}">${
            i === this.choiceIndex ? '▶' : '&nbsp;&nbsp;'
          } ${c.label}</li>`,
      )
      .join('');
    this.choicesEl.hidden = false;
  }

  moveChoice(delta) {
    if (!this.choices || this.choicesEl.hidden) return false;
    this.choiceIndex = (this.choiceIndex + delta + this.choices.length) % this.choices.length;
    this.renderChoices();
    return true;
  }

  /** The A button. @returns true if the box consumed the press. */
  advance() {
    if (!this.open) return false;

    // Still typing: snap to full instead of advancing, like the GBA does.
    if (this.revealTimer) {
      this.finishReveal();
      return true;
    }

    if (!this.choicesEl.hidden && this.choices) {
      const chosen = this.choices[this.choiceIndex];
      this.hide();
      chosen?.onSelect?.();
      this.onDone?.(chosen?.value ?? null);
      return true;
    }

    if (this.page < this.pages.length - 1) {
      this.page += 1;
      this.renderPage();
      return true;
    }

    this.hide();
    this.onDone?.(null);
    return true;
  }

  hide() {
    clearInterval(this.revealTimer);
    this.revealTimer = null;
    this.el.hidden = true;
    this.choicesEl.hidden = true;
  }
}

export default TextBox;
