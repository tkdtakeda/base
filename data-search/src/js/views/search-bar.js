/* =========================================================
   上部バー：番号の種類・入力欄・一致のしかた・主要動作（CTA）
   主要動作は右端の 1 つだけ。位置は固定し、状態に応じてラベルだけを変える。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createSearchBar(root, { store, bus, search, openPanel, refresh }) {
    const { el, icon } = DS.util;
    const searchable = DS.domain.searchableFields();

    // ── 番号の種類（常に見えるボタン。Alt+1〜4 でも切り替え） ──
    const typeButtons = searchable.map((field, index) =>
      el('button', {
        type: 'button',
        className: 'seg__item',
        role: 'radio',
        dataset: { type: field.id },
        title: `${field.label}で検索（Alt+${index + 1}）`,
      }, [el('span', { text: field.label }), el('kbd', { className: 'seg__kbd', text: String(index + 1) })]));
    const typeGroup = el('div', { className: 'seg', role: 'radiogroup', 'aria-label': '番号の種類' }, typeButtons);

    // ── 入力欄 ──
    const input = el('input', {
      type: 'text',
      id: 'search-input',
      className: 'search__input mono',
      autocomplete: 'off',
      spellcheck: 'false',
      maxlength: '100',
      list: 'search-history',
      'aria-describedby': 'search-hint',
    });
    const history = el('datalist', { id: 'search-history' });
    const clearButton = el('button', { type: 'button', className: 'search__clear', title: '入力を消す（Esc）', 'aria-label': '入力を消す' }, [icon('fa-xmark', '×')]);
    const inputLabel = el('label', { className: 'sr-only', for: 'search-input' });
    const inputBox = el('div', { className: 'search__box' }, [
      icon('fa-magnifying-glass', '', 'search__icon'), inputLabel, input, clearButton, history,
    ]);

    // ── 一致のしかた ──
    const MATCH = [
      { id: 'partial', label: '部分一致', title: '入力した文字を含むものを探す' },
      { id: 'exact', label: '完全一致', title: '入力した文字と同じものだけを探す' },
    ];
    const matchButtons = MATCH.map((mode) =>
      el('button', { type: 'button', className: 'seg__item', role: 'radio', dataset: { match: mode.id }, title: mode.title, text: mode.label }));
    const matchGroup = el('div', { className: 'seg seg--compact', role: 'radiogroup', 'aria-label': '一致のしかた' }, matchButtons);

    // ── 主要動作 ──
    const ctaIcon = el('span', { className: 'cta__icon' });
    const ctaLabel = el('span', { className: 'cta__label' });
    const cta = el('button', { type: 'button', className: 'btn btn--primary btn--lg cta', id: 'cta' }, [ctaIcon, ctaLabel]);

    const hint = el('p', { className: 'search__hint', id: 'search-hint' });

    root.appendChild(el('div', { className: 'search' }, [
      el('div', { className: 'search__row' }, [typeGroup, inputBox, matchGroup, cta]),
      hint,
    ]));

    // ── 操作 ──
    function chooseType(type) {
      search.setQuery({ searchType: type });
      input.focus();
    }

    typeButtons.forEach((button) => button.addEventListener('click', () => chooseType(button.dataset.type)));
    matchButtons.forEach((button) => button.addEventListener('click', () => {
      search.setQuery({ matchMode: button.dataset.match });
      DS.util.flash(button);
      if (DS.util.normalize(store.get().query.keyword)) search.run({ page: 1 });
    }));

    input.addEventListener('input', () => search.setQuery({ keyword: input.value }));
    input.addEventListener('focus', () => window.setTimeout(() => { if (document.activeElement === input) input.select(); }, 0));
    input.addEventListener('keydown', (event) => {
      // 日本語の変換中の Enter では検索しない
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        doPrimary();
      } else if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        clearKeyword();
      }
    });
    clearButton.addEventListener('click', () => {
      clearKeyword();
      input.focus();
    });

    /** 入力を消す。番号で探していた途中なら、一覧に戻す */
    function clearKeyword() {
      input.value = '';
      const request = store.get().search.request;
      if (request && request.keyword) search.clearKeyword();
      else search.setQuery({ keyword: '' });
    }
    cta.addEventListener('click', doPrimary);

    function doPrimary() {
      const ready = search.readiness();
      if (ready.ok) search.run({ page: 1 });
      else if (ready.action === 'open-samples') openPanel('samples');
      else if (ready.action === 'refresh') refresh();
      else {
        DS.util.flash(hint);
        input.focus();
      }
    }

    // Alt+1〜4：種類の切り替え / 「/」：入力欄へ
    document.addEventListener('keydown', (event) => {
      if (event.altKey && !event.ctrlKey && /^[1-9]$/.test(event.key)) {
        const field = searchable[Number(event.key) - 1];
        if (field) {
          event.preventDefault();
          chooseType(field.id);
          DS.util.flash(typeButtons[Number(event.key) - 1]);
        }
      } else if (event.key === '/' && !event.ctrlKey && !event.altKey && !isTyping(event.target)) {
        event.preventDefault();
        input.focus();
      }
    });

    function isTyping(target) {
      return target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    }

    // ── 表示の更新 ──
    function render(state) {
      const field = DS.domain.fields.get(state.query.searchType);
      typeButtons.forEach((button) => button.setAttribute('aria-checked', String(button.dataset.type === state.query.searchType)));
      matchButtons.forEach((button) => button.setAttribute('aria-checked', String(button.dataset.match === state.query.matchMode)));
      if (input.value !== state.query.keyword) input.value = state.query.keyword;
      input.placeholder = `例：${field.example}`;
      inputLabel.textContent = field.label;
      clearButton.hidden = !state.query.keyword;

      const items = (state.history[state.query.searchType] || []);
      history.replaceChildren(...items.map((value) => el('option', { value })));

      const ready = search.readiness();
      cta.disabled = !ready.ok && !ready.action;
      cta.classList.toggle('is-busy', Boolean(ready.busy));
      ctaIcon.replaceChildren(ready.busy
        ? icon('fa-spinner', '…', 'fa-spin')
        : icon(ready.icon || (ready.action === 'open-samples' ? 'fa-flask' : ready.action === 'refresh' ? 'fa-rotate' : 'fa-magnifying-glass'), ''));
      ctaLabel.textContent = ready.busy ? '読み込み中…' : ready.action ? ready.actionLabel : ready.label || '検索する';

      hint.replaceChildren(...(ready.ok
        ? [el('span', { text: 'Enter で検索' }), sep(), el('span', { text: 'Alt+1〜4 で番号の種類を切り替え' }), sep(), el('span', { text: '/ で入力欄へ' })]
        : [icon('fa-circle-info', 'i'), el('span', { text: ready.reason })]));
      hint.classList.toggle('is-blocked', !ready.ok && !ready.busy && !ready.quiet);
    }

    function sep() {
      return el('span', { className: 'search__sep', 'aria-hidden': 'true', text: '·' });
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.some((key) => ['query', 'search', 'cache', 'history', 'mode'].includes(key))) render(state);
    });
    render(store.get());

    return { focus: () => input.focus() };
  }

  DS.views.createSearchBar = createSearchBar;
})();
