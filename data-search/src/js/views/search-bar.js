/* =========================================================
   上部バー：探す列・入力欄・一致のしかた・主要動作（CTA）
   番号で探す列は 1 つ（schema.searchColumn。「データ」→「固定列」で変えられる）。
   ほかの列は、一覧の見出しの漏斗（じょうご）から絞り込む。
   主要動作は右端の 1 つだけ。位置は固定し、状態に応じてラベルだけを変える。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createSearchBar(root, { store, bus, search, openPanel, refresh, chooseKey }) {
    const { el, icon } = DS.util;
    const field = DS.domain.searchField();

    // ── 探す列（押すと「データ」→「固定列」で変えられる） ──
    const columnButton = el('button', {
      type: 'button',
      className: 'search__column',
      title: field ? `「${field.listLabel}」で探します（押すと探す列を変えられます）` : '探す列が決まっていません（押して選ぶ）',
    }, [icon('fa-hashtag', '#'), el('span', { className: 'search__column-name mono', text: field ? field.listLabel : '探す列を選ぶ' })]);
    columnButton.addEventListener('click', chooseKey);

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
      el('div', { className: 'search__row' }, [columnButton, inputBox, matchGroup, cta]),
      hint,
    ]));

    // ── 操作 ──
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
      else if (ready.action === 'choose-key') chooseKey();
      else {
        DS.util.flash(hint);
        input.focus();
      }
    }

    // 「/」：入力欄へ
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && !event.ctrlKey && !event.altKey && !isTyping(event.target)) {
        event.preventDefault();
        input.focus();
      }
    });

    function isTyping(target) {
      return target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    }

    // ── 表示の更新 ──
    function render(state) {
      matchButtons.forEach((button) => button.setAttribute('aria-checked', String(button.dataset.match === state.query.matchMode)));
      if (input.value !== state.query.keyword) input.value = state.query.keyword;
      input.disabled = !field;
      input.placeholder = !field ? '探す列が決まっていません' : field.example ? `例：${field.example}` : `${field.listLabel}を入力`;
      inputLabel.textContent = field ? field.listLabel : '番号';
      clearButton.hidden = !state.query.keyword;
      columnButton.classList.toggle('is-missing', !field);

      const items = field ? (state.history[field.id] || []) : [];
      history.replaceChildren(...items.map((value) => el('option', { value })));

      const ready = search.readiness();
      cta.disabled = !ready.ok && !ready.action;
      cta.classList.toggle('is-busy', Boolean(ready.busy));
      const actionIcon = { 'open-samples': 'fa-flask', refresh: 'fa-rotate', 'choose-key': 'fa-key' }[ready.action];
      ctaIcon.replaceChildren(ready.busy
        ? icon('fa-spinner', '…', 'fa-spin')
        : icon(ready.icon || actionIcon || 'fa-magnifying-glass', ''));
      ctaLabel.textContent = ready.busy ? '読み込み中…' : ready.action ? ready.actionLabel : ready.label || '検索する';

      hint.replaceChildren(...(ready.ok
        ? [el('span', { text: 'Enter で検索' }), sep(), el('span', { text: '/ で入力欄へ' }), sep(), el('span', { text: 'ほかの列は見出しの漏斗で絞り込み' })]
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
