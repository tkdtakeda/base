## 付録：画面側の修正ファイルの全文（4/4）

`src/js/views/search-bar.js`

```javascript
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
```

`src/js/views/side-panel.js`

```javascript
/* =========================================================
   左のアイコン列と、そこから開く脇のパネル
   パネルは登録簿（DS.panels）に register() するだけで増やせる。
     { id, order, icon, label, title, mount(container, ctx) → { update(state) } , badge?(state), watch?: [状態のキー] }
   watch に書いた状態が変わったときも描き直す（共通のキーは WATCHED）。
   最初は閉じておき、押したときに開く。開いたパネルは 1 つだけ。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.panels = DS.core.createRegistry('panels');

  function createSidePanel({ rail, host, store, bus, ctx, openManual }) {
    const { el, icon } = DS.util;
    const mounted = new Map();
    const buttons = new Map();

    const title = el('h2', { className: 'sidepanel__title' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '閉じる（Esc）', 'aria-label': 'パネルを閉じる' }, [icon('fa-xmark', '×')]);
    const body = el('div', { className: 'sidepanel__body' });
    host.append(el('div', { className: 'sidepanel__head' }, [title, closeButton]), body);
    closeButton.addEventListener('click', () => open(null));
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const panelId = store.get().ui.panel;
        open(null);
        const button = buttons.get(panelId);
        if (button) button.focus();
      }
    });
    DS.util.selectAllOnFocus(host);

    // ── アイコン列（作業の順に並べる） ──
    const top = el('div', { className: 'rail__group' });
    DS.panels.list().forEach((panel) => {
      const badge = el('span', { className: 'rail__badge', hidden: true });
      const button = el('button', {
        type: 'button',
        className: 'rail__btn',
        title: panel.title,
        'aria-controls': 'sidepanel',
        'aria-expanded': 'false',
      }, [icon(panel.icon, panel.fallback || panel.label.slice(0, 1)), el('span', { className: 'rail__label', text: panel.label }), badge]);
      button.addEventListener('click', () => open(store.get().ui.panel === panel.id ? null : panel.id));
      buttons.set(panel.id, button);
      top.appendChild(button);
    });
    const help = el('button', { type: 'button', className: 'rail__btn', title: '取扱説明書（F1）' }, [
      icon('fa-circle-question', '?'), el('span', { className: 'rail__label', text: '説明書' }),
    ]);
    help.addEventListener('click', openManual);
    rail.append(top, el('div', { className: 'rail__group' }, [help]));

    function open(panelId) {
      store.merge('ui', { panel: panelId });
    }

    function render(state) {
      const panelId = state.ui.panel;
      host.hidden = !panelId;
      buttons.forEach((button, id) => {
        button.classList.toggle('is-active', id === panelId);
        button.setAttribute('aria-expanded', String(id === panelId));
        const panel = DS.panels.get(id);
        const badgeNode = button.querySelector('.rail__badge');
        const badge = panel.badge ? panel.badge(state) : null;
        badgeNode.hidden = !badge;
        if (badge) {
          badgeNode.className = `rail__badge rail__badge--${badge.tone}`;
          badgeNode.textContent = badge.text || '';
          badgeNode.title = badge.title || '';
        }
      });
      if (!panelId) return;
      const panel = DS.panels.get(panelId);
      title.replaceChildren(icon(panel.icon, ''), el('span', { text: panel.title }));
      if (!mounted.has(panelId)) {
        const container = el('div', { className: 'sidepanel__content', dataset: { panel: panelId } });
        mounted.set(panelId, { container, view: panel.mount(container, ctx) });
      }
      const entry = mounted.get(panelId);
      if (body.firstChild !== entry.container) body.replaceChildren(entry.container);
      if (entry.view && entry.view.update) entry.view.update(state);
    }

    const WATCHED = DS.panels.list().reduce((keys, panel) => keys.concat(panel.watch || []),
      ['ui', 'cache', 'columns', 'samplesVersion', 'filters', 'search', 'tags']);
    bus.on('state', ({ state, changed }) => {
      if (changed.some((key) => WATCHED.includes(key))) render(state);
    });
    render(store.get());

    return { open };
  }

  DS.views.createSidePanel = createSidePanel;
})();
```

`src/js/views/source-editor.js`

```javascript
/* =========================================================
   「データ」パネルの「読み込み先」：今のパスの表示・接続テスト・変更

   ふだんは今のパスと 2 つのボタン（接続を確かめる／変更）だけ。
   変更では、貼り付け → Enter で確かめる → × がなければ「保存して更新」へ移る（Enter で押せる）。
   △（固定列がないなど）は、保存してから「固定列」で直せる。
   入力を変えたら、前の結果は使えない（もう一度確かめる）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  const MARKS = {
    ok: { icon: 'fa-circle-check', fallback: '○', label: '○' },
    warn: { icon: 'fa-triangle-exclamation', fallback: '△', label: '△' },
    ng: { icon: 'fa-circle-xmark', fallback: '×', label: '×' },
    skip: { icon: 'fa-circle-minus', fallback: '－', label: '－' },
  };

  function button(className, iconName, text) {
    const node = el('button', { type: 'button', className: `btn ${className}` });
    node.dataset.icon = iconName;
    node.replaceChildren(icon(iconName, ''), el('span', { text }));
    return node;
  }

  function setBusy(node, busy, busyText, text) {
    node.replaceChildren(icon(busy ? 'fa-spinner' : node.dataset.icon, '', busy ? 'fa-spin' : ''), el('span', { text: busy ? busyText : text }));
  }

  function renderSteps(result) {
    if (!result) return [];
    const warned = result.steps.some((step) => step.status === 'warn');
    const summary = result.ok
      ? el('p', { className: `source-result__summary ${warned ? 'is-warn' : 'is-ok'}` }, [icon(warned ? 'fa-triangle-exclamation' : 'fa-circle-check', warned ? '△' : '○'), el('span', {
        text: ` ${warned ? '× はありません（△ は保存してから直せます）' : 'すべて ○'}（${DS.util.formatNumber(result.rowCount)} 件・${DS.util.formatDateTime(result.modifiedAt)} 更新）` })])
      : el('p', { className: 'source-result__summary is-ng' }, [icon('fa-circle-xmark', '×'), el('span', { text: ' × があります。対応を見て直してください' })]);
    const list = el('ol', { className: 'source-steps' }, result.steps.map((step) => {
      const mark = MARKS[step.status] || MARKS.skip;
      return el('li', { className: `source-step source-step--${step.status}` }, [
        el('span', { className: 'source-step__mark', title: mark.label }, [icon(mark.icon, mark.fallback)]),
        el('div', {}, [
          el('strong', { className: 'source-step__label', text: step.label }),
          el('p', { className: 'source-step__text', text: step.message }),
          step.action ? el('p', { className: 'source-step__action', text: `対応：${step.action}` }) : null,
        ].filter(Boolean)),
      ]);
    }));
    return [summary, list];
  }

  function createSourceEditor(ctx) {
    const { source } = ctx;
    const root = el('div', { className: 'source' });
    const current = el('p', { className: 'source__path mono' });
    const checkButton = button('btn--secondary btn--sm', 'fa-plug-circle-check', '接続を確かめる');
    const editButton = button('btn--secondary btn--sm', 'fa-pen', '変更');
    const viewRow = el('div', { className: 'source__actions' }, [checkButton, editButton]);

    const input = el('input', { type: 'text', className: 'input source__input mono', spellcheck: 'false', autocomplete: 'off',
      placeholder: '例：\\\\server\\share\\data.sqlite3', 'aria-label': '読み込み先のパス' });
    const hint = el('p', { className: 'pane-note', text: 'エクスプローラーでファイルを Shift＋右クリック →「パスとしてコピー」して貼り付け。前後の " は自動で外します。' });
    const testButton = button('btn--secondary btn--sm', 'fa-plug-circle-check', '確かめる');
    const saveButton = button('btn--primary btn--sm', 'fa-floppy-disk', '保存して更新');
    const cancelButton = button('btn--ghost btn--sm', 'fa-xmark', 'やめる');
    const stale = el('p', { className: 'pane-note is-warning', hidden: true, text: '入力が変わりました。もう一度確かめてください。' });
    const editBox = el('div', { className: 'source__edit', hidden: true }, [
      input, hint, el('div', { className: 'source__actions' }, [testButton, saveButton, cancelButton]), stale,
    ]);
    const resultBox = el('div', { className: 'source-result', 'aria-live': 'polite' });
    const savedTo = el('p', { className: 'pane-note' });
    root.append(current, viewRow, editBox, resultBox, savedTo);

    let editing = false;
    function setEditing(on) {
      editing = on;
      editBox.hidden = !on;
      viewRow.hidden = on;
      source.reset();
      if (on) {
        input.value = ctx.store.get().source.path || '';
        input.focus();
      }
    }

    checkButton.addEventListener('click', () => source.test(null));
    editButton.addEventListener('click', () => setEditing(true));
    cancelButton.addEventListener('click', () => setEditing(false));
    testButton.addEventListener('click', async () => {
      const result = await source.test(input.value);
      input.value = source.normalizePath(input.value);
      if (result && result.ok) saveButton.focus();
    });
    saveButton.addEventListener('click', async () => {
      if (await source.save(input.value)) {
        setEditing(false);
        DS.util.flash(current);
      }
    });
    input.addEventListener('focus', () => window.setTimeout(() => { if (document.activeElement === input) input.select(); }, 0));
    input.addEventListener('paste', () => window.setTimeout(() => { input.value = source.normalizePath(input.value); }, 0));
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        testButton.click();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setEditing(false);
      }
    });
    input.addEventListener('input', () => update(ctx.store.get()));

    function update(state) {
      const info = state.source;
      current.textContent = info.path || (info.loaded ? '（未設定）' : '読み込み中…');
      editButton.hidden = !info.editable;
      checkButton.disabled = info.status !== 'idle' || !info.loaded;
      setBusy(checkButton, info.status === 'checking' && !editing, '確かめています…', '接続を確かめる');
      testButton.disabled = info.status !== 'idle';
      setBusy(testButton, info.status === 'checking' && editing, '確かめています…', '確かめる');
      saveButton.disabled = !source.canSave(input.value);
      setBusy(saveButton, info.status === 'saving', '保存して更新しています…', '保存して更新');
      const changed = editing && info.result && info.testedPath !== source.normalizePath(input.value);
      stale.hidden = !changed;
      resultBox.classList.toggle('is-stale', Boolean(changed));
      resultBox.replaceChildren(...renderSteps(info.result));
      savedTo.textContent = info.editable && info.localFile ? `保存先：${info.localFile}（dataSource.sourcePath）` : (info.loadError || '');
    }

    return { element: root, update };
  }

  DS.views.createSourceEditor = createSourceEditor;
})();
```

`src/js/views/status-chips.js`

```javascript
/* =========================================================
   上部バー右：どのデータを見ているか（出どころ）と、その鮮度
   押すと「データ」パネルが開き、詳しい根拠を確かめられる。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /** キャッシュの状態を「アイコン＋文字＋色」の 1 組にまとめる（パネルと共通で使う） */
  function describeCache(cacheState) {
    const status = cacheState.status;
    if (cacheState.refreshing) return { tone: 'info', icon: 'fa-rotate', spin: true, fallback: '…', text: '更新しています' };
    if (!status) return { tone: 'neutral', icon: 'fa-circle-notch', spin: true, fallback: '…', text: '確認しています' };
    if (!status.available) return { tone: 'danger', icon: 'fa-database', fallback: '×', text: 'データなし' };
    if (status.usingPreviousCache) return { tone: 'warning', icon: 'fa-triangle-exclamation', fallback: '!', text: '前回のデータを使用中' };
    if (status.sourceHasUpdate) return { tone: 'warning', icon: 'fa-cloud-arrow-down', fallback: '!', text: '新しい更新があります' };
    return { tone: 'success', icon: 'fa-circle-check', fallback: '✓', text: '最新' };
  }

  function createStatusChips(root, { store, bus, openPanel }) {
    const { el, icon } = DS.util;
    const mode = store.get().mode;

    const modeChip = el('span', {
      className: `chip chip--mode chip--mode-${mode.mode}`,
      title: mode.description,
    }, [icon(mode.mode === 'mock' ? 'fa-flask' : 'fa-database', ''), el('span', { text: mode.label })]);

    const cacheText = el('span', { className: 'chip__text' });
    const cacheSub = el('span', { className: 'chip__sub mono' });
    const cacheIcon = el('span', { className: 'chip__icon' });
    const cacheChip = el('button', {
      type: 'button',
      className: 'chip chip--status',
      title: 'データの状態を見る',
    }, [cacheIcon, cacheText, cacheSub]);
    cacheChip.addEventListener('click', () => openPanel('data'));

    root.append(modeChip, cacheChip);

    function render(state) {
      const view = describeCache(state.cache);
      cacheChip.className = `chip chip--status chip--${view.tone}`;
      cacheIcon.replaceChildren(icon(view.icon, view.fallback, view.spin ? 'fa-spin' : ''));
      cacheText.textContent = view.text;
      const status = state.cache.status;
      cacheSub.textContent = status && status.cacheUpdatedAt ? DS.util.formatDateTime(status.cacheUpdatedAt) + ' 時点' : '';
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.includes('cache')) render(state);
    });
    render(store.get());
  }

  DS.views.describeCache = describeCache;
  DS.views.createStatusChips = createStatusChips;
})();
```

`src/js/views/tag-bar.js`

```javascript
/* =========================================================
   タグの列（一覧のすぐ上・いつも見える）
   [すべて] [タグ…] [＋今の条件を保存]
   よく使う操作（タグを押す）は 1 クリック。名前の変更・並べ替え・削除は選んだタグの ⋮ の中。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createTagBar(root, { store, bus, tags, openPanel }) {
    const { el, icon } = DS.util;
    let editing = null; // { mode: 'save' } | { mode: 'rename', id }
    let menuFor = null;
    let pendingFocus = null;

    const list = el('div', { className: 'tagbar__list', role: 'toolbar', 'aria-label': '絞り込みタグ' });
    const tools = el('div', { className: 'tagbar__tools' });
    root.append(el('span', { className: 'tagbar__label' }, [icon('fa-tags', ''), el('span', { text: 'タグ' })]), list, tools);

    // Esc：開いているタグの操作メニューだけを閉じる（パネルや詳細は閉じない）
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuFor) {
        event.preventDefault();
        menuFor = null;
        render(store.get());
      }
    }, true);

    document.addEventListener('click', (event) => {
      if (menuFor && !event.target.closest('.tag-menu, .tag__more')) {
        menuFor = null;
        render(store.get());
      }
    });

    function chip(label, active, onClick, extra) {
      const button = el('button', {
        type: 'button',
        className: `tag${active ? ' is-active' : ''}`,
        'aria-pressed': String(active),
        title: active && extra && extra.title ? extra.title : label,
      }, [active ? icon('fa-check', '✓') : null, el('span', { className: 'tag__name', text: label })]);
      button.addEventListener('click', onClick);
      return button;
    }

    /** 名前を入れる欄（保存・名前の変更で共通） */
    function nameEditor(initial, onSubmit) {
      const input = el('input', {
        type: 'text',
        className: 'input input--sm tag-editor__input',
        maxlength: String(tags.NAME_MAX),
        placeholder: 'タグの名前（例：架空商事の仕掛品）',
        'aria-label': 'タグの名前',
      });
      input.value = initial || '';
      const message = el('span', { className: 'tag-editor__msg' });
      const ok = el('button', { type: 'button', className: 'btn btn--primary btn--sm' }, [icon('fa-check', '✓'), el('span', { text: '保存' })]);
      const cancel = el('button', { type: 'button', className: 'icon-btn', title: 'やめる（Esc）', 'aria-label': 'やめる' }, [icon('fa-xmark', '×')]);
      const submit = () => {
        const result = onSubmit(input.value);
        if (result && !result.ok) {
          message.textContent = result.reason;
          DS.util.flash(message);
          input.focus();
          return;
        }
        editing = null;
        render(store.get());
      };
      input.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          editing = null;
          render(store.get());
        }
      });
      ok.addEventListener('click', submit);
      cancel.addEventListener('click', () => {
        editing = null;
        render(store.get());
      });
      pendingFocus = input; // 画面に置いた直後に入力欄へ移す（打ち始めた文字を取りこぼさない）
      return el('div', { className: 'tag-editor' }, [input, ok, cancel, message]);
    }

    function menu(tag, index, count) {
      const item = (iconName, label, onClick, options) => {
        const button = el('button', { type: 'button', className: `tag-menu__item${options && options.danger ? ' is-danger' : ''}`, disabled: options && options.disabled }, [icon(iconName, ''), el('span', { text: label })]);
        button.addEventListener('click', () => {
          menuFor = null;
          onClick();
          render(store.get());
        });
        return button;
      };
      return el('div', { className: 'tag-menu', role: 'menu' }, [
        item('fa-pen', '名前を変える', () => { editing = { mode: 'rename', id: tag.id }; }),
        item('fa-arrow-left', '左へ動かす', () => tags.move(tag.id, -1), { disabled: index === 0 }),
        item('fa-arrow-right', '右へ動かす', () => tags.move(tag.id, 1), { disabled: index === count - 1 }),
        el('hr', { className: 'tag-menu__sep' }),
        item('fa-trash-can', 'このタグを消す', () => tags.remove(tag.id), { danger: true }),
      ]);
    }

    function render(state) {
      const activeId = state.tags.activeId;
      const items = state.tags.items;
      const modified = tags.isModified();
      const nodes = [chip('すべて', !activeId, () => tags.apply(null), { title: '絞り込みをしない' })];

      items.forEach((tag, index) => {
        if (editing && editing.mode === 'rename' && editing.id === tag.id) {
          nodes.push(nameEditor(tag.name, (name) => tags.rename(tag.id, name)));
          return;
        }
        const active = tag.id === activeId;
        const describe = Object.entries(tag.filters).map(([fieldId, spec]) => (DS.domain.fields.has(fieldId) && DS.domain.fields.get(fieldId).filter === spec.type
          ? `${DS.domain.fields.get(fieldId).label}：${DS.domain.filters.describe(fieldId, spec)}`
          : `${fieldId}：（今のデータにない列）`)).join(' / ');
        const group = el('span', { className: `tag-group${active ? ' is-active' : ''}` }, [
          chip(tag.name, active, () => tags.apply(tag.id), { title: describe }),
        ]);
        group.firstChild.title = describe;
        if (active) {
          if (modified) {
            const overwrite = el('button', { type: 'button', className: 'tag__overwrite', title: '今の条件でこのタグを上書きする' }, [
              el('span', { className: 'tag__modified' }, [icon('fa-circle', '●'), el('span', { text: '変更あり' })]),
              el('span', { text: '上書き保存' }),
            ]);
            overwrite.addEventListener('click', () => tags.overwrite(tag.id));
            group.appendChild(overwrite);
          }
          const more = el('button', { type: 'button', className: 'tag__more', title: 'このタグの操作', 'aria-label': 'このタグの操作', 'aria-haspopup': 'menu' }, [icon('fa-ellipsis-vertical', '⋮')]);
          more.addEventListener('click', (event) => {
            event.stopPropagation();
            menuFor = menuFor === tag.id ? null : tag.id;
            render(store.get());
          });
          group.appendChild(more);
          if (menuFor === tag.id) {
            const node = menu(tag, index, items.length);
            group.appendChild(node);
            // タグの列は横にスクロールするため、メニューは画面に固定し、⋮ の真下に出す
            window.requestAnimationFrame(() => {
              const rect = more.getBoundingClientRect();
              node.style.top = `${rect.bottom + 4}px`;
              node.style.left = `${Math.min(rect.left, window.innerWidth - node.offsetWidth - 8)}px`;
            });
          }
        }
        nodes.push(group);
      });

      if (editing && editing.mode === 'save') {
        nodes.push(nameEditor('', (name) => tags.save(name)));
      }
      list.replaceChildren(...nodes);
      if (pendingFocus) {
        pendingFocus.focus();
        pendingFocus.select();
        pendingFocus = null;
      }

      // 右側：保存ボタン（できないときは理由を文字で出す）
      const can = tags.canSave();
      const toolNodes = [];
      if (!editing || editing.mode !== 'save') {
        const save = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', disabled: !can.ok }, [icon('fa-plus', '+'), el('span', { text: '今の条件をタグにする' })]);
        save.addEventListener('click', () => {
          editing = { mode: 'save' };
          render(store.get());
        });
        if (!can.ok) toolNodes.push(el('span', { className: 'tagbar__hint', text: can.reason }));
        toolNodes.push(save);
      }
      const filterButton = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', title: '絞り込みのパネルを開く' }, [icon('fa-filter', ''), el('span', { text: '絞り込み' })]);
      filterButton.addEventListener('click', () => openPanel('filters'));
      toolNodes.push(filterButton);
      tools.replaceChildren(...toolNodes);
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.some((key) => ['tags', 'filters'].includes(key))) render(state);
    });
    render(store.get());
  }

  DS.views.createTagBar = createTagBar;
})();
```

