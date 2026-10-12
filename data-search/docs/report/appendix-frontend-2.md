## 付録：画面側の修正ファイルの全文（2/2）

`src/js/controllers/search-controller.js`

```javascript
/* =========================================================
   一覧・検索・絞り込み・詳細の操作。画面の部品はここを呼び、結果は状態（store）を通して受け取る。
   一覧は「絞り込み」と「番号の検索（任意）」の両方を満たすものを出す。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createSearchController({ store, bus, api, toast }) {
    let searchToken = 0;
    let detailToken = 0;

    const keywordOf = () => DS.util.normalize(store.get().query.keyword);
    const dataAvailable = () => {
      const status = store.get().cache.status;
      return Boolean(status && status.available);
    };

    /** 主要動作（CTA）が今できるか。できないときは理由と、代わりに勧める操作を返す */
    function readiness() {
      const state = store.get();
      const cacheStatus = state.cache.status;
      if (cacheStatus && !cacheStatus.available) {
        if (state.mode.capabilities.sampleData) {
          return { ok: false, reason: 'サンプルデータを読み込むと一覧が出ます', action: 'open-samples', actionLabel: 'サンプルを読み込む' };
        }
        return { ok: false, reason: '表示できるデータがありません。データを更新してください', action: 'refresh', actionLabel: 'データを更新する' };
      }
      if (state.search.status === 'loading') return { ok: false, reason: '読み込んでいます…', busy: true };
      const searching = state.search.request && state.search.request.keyword;
      if (!keywordOf()) {
        // 番号で探している途中に入力を空にしたら、番号の検索を外して一覧に戻せる
        if (searching) return { ok: true, label: '一覧に戻す', icon: 'fa-list' };
        const field = DS.domain.fields.get(state.query.searchType);
        return { ok: false, quiet: true, reason: `${field.listLabel}を入れると、一覧の中から探せます` };
      }
      return { ok: true };
    }

    function buildRequest(page) {
      const state = store.get();
      const request = {
        page,
        pageSize: state.mode.pageSize || 100,
        sortKey: state.sort.key,
        sortOrder: state.sort.order,
        filters: DS.domain.filters.compact(state.filters),
      };
      const keyword = keywordOf();
      if (keyword) Object.assign(request, { searchType: state.query.searchType, keyword, matchMode: state.query.matchMode });
      return request;
    }

    async function run(options) {
      if (!dataAvailable()) {
        store.set({ search: { status: 'idle', result: null, request: null, error: null } });
        return;
      }
      const request = buildRequest((options && options.page) || 1);
      const token = ++searchToken;
      store.set({ search: Object.assign({}, store.get().search, { status: 'loading', request, error: null }) });
      try {
        const result = await api.call('list_lots', request);
        if (token !== searchToken) return; // 古い結果は捨てる
        const patch = { search: { status: 'done', result, request, error: null } };
        if (request.keyword) patch.history = DS.controllers.pushHistory(store.get().history, request.searchType, result.keyword || request.keyword);
        store.set(patch);
        bus.emit('search:done', result);
        // 選んでいた行が結果に残っていなければ詳細を閉じる
        const selectedKey = store.get().selection.key;
        if (selectedKey && !result.items.some((item) => DS.domain.recordKey(item) === selectedKey)) closeDetail();
      } catch (error) {
        if (token !== searchToken) return;
        store.set({ search: { status: 'error', result: null, request, error } });
        toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
      }
    }

    function setQuery(patch) {
      store.merge('query', patch);
    }

    /** 番号の検索を外して一覧に戻す */
    function clearKeyword() {
      setQuery({ keyword: '' });
      return run({ page: 1 });
    }

    // ── 絞り込み ──
    function setFilter(fieldId, spec) {
      store.set({ filters: Object.assign({}, store.get().filters, { [fieldId]: spec }) });
      return run({ page: 1 });
    }

    function setFilters(filters) {
      store.set({ filters: Object.assign({}, filters) });
      return run({ page: 1 });
    }

    function clearFilter(fieldId) {
      const next = Object.assign({}, store.get().filters);
      delete next[fieldId];
      return setFilters(next);
    }

    /** 見出しを押したときの並べ替え：同じ列なら昇順⇔降順、別の列なら昇順から */
    function toggleSort(key) {
      const sort = store.get().sort;
      const next = sort.key === key ? { key, order: sort.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' };
      store.set({ sort: next });
      if (store.get().search.result) run({ page: 1 });
    }

    function goToPage(page) {
      const result = store.get().search.result;
      if (!result) return;
      const last = Math.max(1, Math.ceil(result.totalCount / result.pageSize));
      run({ page: Math.min(Math.max(1, page), last) });
    }

    /** 読み直し（データの更新のあと） */
    function rerun() {
      return run({ page: 1 });
    }

    // ── 詳細 ──
    async function select(item) {
      const key = DS.domain.recordKey(item);
      const token = ++detailToken;
      // 一覧の値ですぐに表示し（0.4 秒以内の反応）、最新の詳細で置き換える
      store.set({ selection: { key, item, status: 'loading', error: null, duplicated: false } });
      const payload = {};
      DS.domain.keyFields().forEach((field) => { payload[field.id] = item[field.id] == null ? null : item[field.id]; });
      try {
        const result = await api.call('get_lot_detail', payload);
        if (token !== detailToken) return;
        store.set({ selection: { key, item: result.item, status: 'done', error: null, duplicated: Boolean(result.duplicated) } });
      } catch (error) {
        if (token !== detailToken) return;
        store.set({ selection: { key, item, status: 'error', error, duplicated: false } });
      }
    }

    function closeDetail() {
      detailToken += 1;
      store.set({ selection: { key: null, item: null, status: 'idle', error: null, duplicated: false } });
    }

    return {
      readiness, run, setQuery, clearKeyword, setFilter, setFilters, clearFilter,
      toggleSort, goToPage, rerun, select, closeDetail,
    };
  }

  DS.controllers.createSearchController = createSearchController;
})();
```

`src/js/domain/fields.js`

```javascript
/* =========================================================
   論理項目の登録簿。中身はソースコードに書かず、表示定義（view）から組み立てる。

     表示定義の出どころ
       Python 版・デスクトップ版 … get_view_config 命令（config/sample/view.sample.json ＋ config/local/view.local.json）
       画面だけで試すモード     … js/sample/sample-view.js（view.sample.json から自動生成）

   項目・表示名・表示順・検索できる項目・絞り込み・既定の並べ替えを変えるときは、view の JSON を直す。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.domain = DS.domain || {};

  const OTHER_GROUP = { id: '__other', label: 'その他', icon: 'fa-ellipsis', order: 9999 };

  let lists = { list: [], detail: [], searchable: [], key: [], filter: [] };

  /** 表示定義を当てはめる。起動時に 1 回、画面の部品を作る前に呼ぶ */
  function applyView(view) {
    const groups = DS.core.createRegistry('fieldGroups');
    const fields = DS.core.createRegistry('fields');
    (view.detailGroups || []).forEach((group, index) => groups.register(Object.assign({ order: (index + 1) * 10 }, group)));

    const columns = new Map((view.listColumns || []).map((column, index) => [column.field, Object.assign({ index }, column)]));
    const filters = new Map((view.filters || []).map((filter) => [filter.field, filter.type]));
    const options = view.fields || {};
    const recordKey = view.recordKey || [];
    let usesOther = false;

    view.logicalFields.forEach((id, index) => {
      const column = columns.get(id) || {};
      const option = options[id] || {};
      const group = option.group && groups.has(option.group) ? option.group : OTHER_GROUP.id;
      if (group === OTHER_GROUP.id) usesOther = true;
      fields.register({
        id,
        order: (index + 1) * 10,
        // label：詳細・絞り込みなどで使う名前（fields.<項目>.label）。listLabel：一覧の見出し・検索の種類（listColumns の label）
        label: option.label || column.label || id,
        listLabel: column.label || option.label || id,
        short: option.short || null,
        group,
        mono: Boolean(option.mono),
        copy: Boolean(option.copy),
        example: option.example || '',
        width: column.width || 120,
        badge: (option.badge || []).map((rule) => ({ pattern: new RegExp(rule.match), tone: rule.tone })),
        filter: filters.get(id) || null,
        type: (view.types || {})[id] || 'text',
        searchable: column.searchable === true,
        key: recordKey.includes(id),
      });
    });
    if (usesOther) groups.register(OTHER_GROUP);

    const pick = (ids) => ids.map((id) => fields.get(id)).filter(Boolean);
    lists = {
      // 一覧に出す列：listColumns の順。visible: false の列は一覧に出さない
      list: pick((view.listColumns || []).filter((column) => column.visible).map((column) => column.field)),
      detail: pick(view.detailFields || []),
      searchable: pick((view.listColumns || []).filter((column) => column.searchable).map((column) => column.field)),
      key: pick(recordKey),
      filter: pick((view.filters || []).map((filter) => filter.field)),
    };

    DS.domain.fieldGroups = groups;
    DS.domain.fields = fields;
    DS.domain.DEFAULT_SORT = { key: view.defaultSort.field, order: view.defaultSort.order };
  }

  DS.domain.applyView = applyView;
  DS.domain.listFields = () => lists.list;
  DS.domain.detailFields = () => lists.detail;
  DS.domain.searchableFields = () => lists.searchable;
  DS.domain.keyFields = () => lists.key;
  DS.domain.filterFields = () => lists.filter;

  /** 1 件を特定する鍵（schema の recordKey。例：ロット番号＋鋳造番号）を文字列にする */
  DS.domain.recordKey = (item) =>
    lists.key.map((field) => (item[field.id] == null ? '' : item[field.id])).join('\u001f');
})();
```

`src/js/domain/status-tones.js`

```javascript
/* =========================================================
   値の札（バッジ）。色だけで伝えず「アイコン＋文字＋色」で表す。
   どの値をどの色にするかは表示定義（view の fields.<項目>.badge）に書く。
   ここには「色の種類 → アイコン」の対応だけを置く（デザインの決まり）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  const TONES = {
    danger: { icon: 'fa-circle-xmark', fallback: '×' },
    warning: { icon: 'fa-circle-pause', fallback: '!' },
    success: { icon: 'fa-circle-check', fallback: '✓' },
    info: { icon: 'fa-clock', fallback: '…' },
    neutral: { icon: 'fa-circle', fallback: '・' },
  };

  function toneOf(field, value) {
    if (value === null || value === undefined || value === '') return 'neutral';
    const rule = (field.badge || []).find((item) => item.pattern.test(String(value)));
    return rule && TONES[rule.tone] ? rule.tone : 'neutral';
  }

  /** 札を作る。field.badge の決まりを上から順に当てはめ、どれにも当たらなければグレー */
  function badge(field, value) {
    const util = DS.util;
    const tone = toneOf(field, value);
    return util.el('span', { className: `badge badge--${tone}` }, [
      util.icon(TONES[tone].icon, TONES[tone].fallback),
      util.el('span', { text: value === null || value === undefined || value === '' ? '—' : String(value) }),
    ]);
  }

  DS.domain.badge = badge;
  DS.domain.hasBadge = (field) => Boolean(field && field.badge && field.badge.length);
})();
```

`src/js/panels/panels.js`

```javascript
/* =========================================================
   脇のパネル（データ・表示列・サンプル）
   1 パネル＝1 つの register()。パネルを足すときはこのファイルか別ファイルで register() する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  function section(titleText, children, extraClass) {
    return el('section', { className: `pane-section${extraClass ? ' ' + extraClass : ''}` }, [
      el('h3', { className: 'pane-section__title', text: titleText }),
    ].concat(children));
  }

  // ── データ（キャッシュの状態と更新） ─────────────────────────
  DS.panels.register({
    id: 'data',
    order: 10,
    icon: 'fa-database',
    label: 'データ',
    title: 'データの状態と更新',
    badge(state) {
      const view = DS.views.describeCache(state.cache);
      if (view.tone === 'warning' || view.tone === 'danger') return { tone: view.tone, text: '!', title: view.text };
      return null;
    },
    mount(container, ctx) {
      const summary = el('div', { className: 'status-card' });
      const facts = el('dl', { className: 'facts' });
      const refreshButton = el('button', { type: 'button', className: 'btn btn--secondary btn--block' });
      const progress = el('p', { className: 'pane-note', 'aria-live': 'polite' });
      const sourceNote = el('p', { className: 'pane-note' });
      const configBox = el('div', { className: 'config-help', hidden: true });
      refreshButton.addEventListener('click', () => ctx.cache.refresh());

      container.append(
        summary,
        configBox,
        section('根拠', [facts]),
        section('共有データから更新', [
          el('p', { className: 'pane-note', text: '共有データを手元にコピーし、検証してから入れ替えます。失敗したときは前回のデータをそのまま使います。' }),
          refreshButton,
          progress,
        ]),
        section('このモードについて', [sourceNote]),
      );

      let timer = null;
      function tick(state) {
        const started = state.cache.refreshStartedAt;
        if (!started) {
          progress.textContent = '';
          return;
        }
        const seconds = Math.floor((Date.now() - started) / 1000);
        progress.textContent = seconds >= 5
          ? `コピーと検証をしています（${seconds} 秒）。共有フォルダが遠いと時間がかかります。中途半端なデータを残さないため、途中では止められません。`
          : `コピーと検証をしています（${seconds} 秒）`;
      }

      function fact(label, value, extraClass) {
        return [el('dt', { text: label }), el('dd', { className: extraClass || '', text: value })];
      }

      return {
        update(state) {
          const status = state.cache.status || {};
          const view = DS.views.describeCache(state.cache);
          summary.className = `status-card status-card--${view.tone}`;
          summary.replaceChildren(
            el('span', { className: 'status-card__icon' }, [icon(view.icon, view.fallback, view.spin ? 'fa-spin' : '')]),
            el('div', {}, [
              el('strong', { className: 'status-card__title', text: view.text }),
              el('p', { className: 'status-card__text', text: status.message || '' }),
            ]),
          );
          facts.replaceChildren(...[]
            .concat(fact('検索しているデータ', status.cacheUpdatedAt ? `${DS.util.formatDateTime(status.cacheUpdatedAt)} 時点` : '—', 'mono'))
            .concat(fact('共有データの更新日時', DS.util.formatDateTime(status.sourceModifiedAt), 'mono'))
            .concat(fact('件数', status.rowCount == null ? '—' : `${DS.util.formatNumber(status.rowCount)} 件`, 'mono'))
            .concat(fact('前回の更新', status.lastRefreshAt
              ? `${status.lastRefreshSucceeded === false ? '失敗' : '成功'}（${DS.util.formatAgo(status.lastRefreshAt)}）`
              : '—'))
            .concat(fact('共有データへの接続', status.sourceReachable === false ? 'できません' : status.sourceReachable ? 'できます' : '—'))
            .concat(status.errorMessage ? fact('失敗の理由', status.errorMessage, 'is-warning') : []));

          const refreshing = state.cache.refreshing;
          refreshButton.disabled = refreshing;
          refreshButton.replaceChildren(
            icon('fa-rotate', '', refreshing ? 'fa-spin' : ''),
            el('span', { text: refreshing ? '更新しています…' : 'データを更新する' }));
          window.clearInterval(timer);
          tick(state);
          if (refreshing) timer = window.setInterval(() => tick(ctx.store.get()), 1000);
          sourceNote.textContent = state.mode.description;

          // 設定の注意（ローカルの設定にある未知のキーなど）は、ファイル名と項目を出す
          const warnings = status.settingsWarnings || [];
          configBox.hidden = warnings.length === 0;
          configBox.replaceChildren(...(warnings.length ? [section('設定の注意', warnings.map((w) =>
            el('div', { className: 'config-help__item' }, [
              el('p', { className: 'config-help__where mono', text: `${w.file} ／ ${w.path}` }),
              el('p', { className: 'pane-note', text: w.reason }),
              el('p', { className: 'pane-note', text: `対応：${w.action}` }),
            ])))] : []));
        },
      };
    },
  });

  // ── 表示列 ─────────────────────────────────────────────
  DS.panels.register({
    id: 'columns',
    order: 20,
    icon: 'fa-table-columns',
    label: '表示列',
    title: '一覧に表示する列',
    badge(state) {
      const hidden = DS.domain.listFields().length - state.columns.visible.length;
      return hidden > 0 ? { tone: 'info', text: String(hidden), title: `${hidden} 列を隠しています` } : null;
    },
    mount(container, ctx) {
      const checks = new Map();
      // 選べるのは view の listColumns で visible: true の列だけ（visible: false の列は一覧に出さない）
      const groups = DS.domain.fieldGroups.list().map((group) => {
        const items = DS.domain.listFields().filter((field) => field.group === group.id).map((field) => {
          const box = el('input', { type: 'checkbox', value: field.id });
          box.addEventListener('change', () => toggle(field.id, box.checked, box.parentElement));
          checks.set(field.id, box);
          return el('label', { className: 'check' }, [box, el('span', { text: field.label })]);
        });
        return items.length ? section(group.label, [el('div', { className: 'check-list' }, items)]) : null;
      }).filter(Boolean);
      const reset = el('button', { type: 'button', className: 'btn btn--ghost btn--block' }, [icon('fa-arrow-rotate-left', ''), el('span', { text: 'すべて表示する（既定に戻す）' })]);
      reset.addEventListener('click', () => {
        ctx.store.set({ columns: { visible: DS.controllers.defaultVisibleColumns() } });
        DS.util.flash(container);
      });
      container.append(
        el('p', { className: 'pane-note', text: 'チェックを外した列は一覧から隠れます。詳細にはすべて表示されます。設定は自動で保存されます。' }),
        ...groups,
        reset,
      );

      function toggle(id, checked, row) {
        const order = DS.domain.listFields().map((field) => field.id);
        const current = new Set(ctx.store.get().columns.visible);
        if (checked) current.add(id);
        else current.delete(id);
        if (current.size === 0) {
          checks.get(id).checked = true;
          ctx.toast.show({ tone: 'warning', message: '少なくとも 1 列は表示してください' });
          return;
        }
        ctx.store.set({ columns: { visible: order.filter((x) => current.has(x)) } });
        DS.util.flash(row);
      }

      return {
        update(state) {
          checks.forEach((box, id) => { box.checked = state.columns.visible.includes(id); });
        },
      };
    },
  });

  // ── サンプル ───────────────────────────────────────────
  DS.panels.register({
    id: 'samples',
    order: 30,
    icon: 'fa-flask',
    label: 'サンプル',
    title: 'サンプルデータ',
    mount(container, ctx) {
      if (!ctx.samples.available) {
        container.append(el('div', { className: 'status-card status-card--neutral' }, [
          el('span', { className: 'status-card__icon' }, [icon('fa-ban', '×')]),
          el('div', {}, [
            el('strong', { className: 'status-card__title', text: 'このモードでは使えません' }),
            el('p', { className: 'status-card__text', text: 'サンプルデータは、index.html を直接開いて「画面だけで試す」ときに使えます。今は実際のデータを検索しています。' }),
          ]),
        ]));
        return null;
      }

      const rows = new Map();
      const sections = DS.sample.groups.list().map((group) => {
        const items = DS.sample.patterns.list().filter((pattern) => pattern.group === group.id).map((pattern) => {
          const state = el('span', { className: 'sample__state' });
          const button = el('button', { type: 'button', className: 'btn btn--secondary btn--sm' });
          button.addEventListener('click', () => ctx.samples.load(pattern.id));
          const count = ctx.samples.countOf(pattern.id);
          const node = el('li', { className: 'sample' }, [
            el('span', { className: 'sample__icon' }, [icon(pattern.icon, '')]),
            el('div', { className: 'sample__body' }, [
              el('strong', { className: 'sample__title', text: pattern.title }),
              el('span', { className: 'sample__desc', text: pattern.description }),
              el('span', { className: 'sample__meta' }, [
                count ? el('span', { className: 'mono', text: `${DS.util.formatNumber(count)} 件` }) : null,
                pattern.demoQuery ? el('span', { text: '読み込むと検索の例を実行します' }) : null,
                state,
              ]),
            ]),
            button,
          ]);
          rows.set(pattern.id, { node, button, state });
          return node;
        });
        return section(group.label, [el('ul', { className: 'sample-list' }, items)]);
      });

      const total = el('p', { className: 'pane-note mono' });
      const clear = el('button', { type: 'button', className: 'btn btn--danger-ghost btn--block' }, [icon('fa-trash-can', ''), el('span', { text: 'サンプルデータだけを消す' })]);
      clear.addEventListener('click', () => ctx.samples.clear());

      container.append(
        el('p', { className: 'pane-note', text: '目的に合わせて読み込むと、そのまま動きを確かめられます。毎回同じデータができます。' }),
        ...sections,
        section('片付け', [total, clear, el('p', { className: 'pane-note', text: '消したあと 10 秒間は「元に戻す」で戻せます。' })], 'pane-section--end'),
      );

      return {
        update() {
          const loaded = ctx.samples.loadedIds();
          rows.forEach((row, id) => {
            const isLoaded = loaded.includes(id);
            row.node.classList.toggle('is-loaded', isLoaded);
            row.state.replaceChildren(...(isLoaded ? [icon('fa-check', '✓'), el('span', { text: '読み込み済み' })] : []));
            row.button.textContent = isLoaded ? '読み直す' : '読み込む';
          });
          const rowsCount = ctx.store.get().cache.status ? ctx.store.get().cache.status.rowCount || 0 : 0;
          total.textContent = loaded.length ? `今あるサンプル：${DS.util.formatNumber(rowsCount)} 件` : '今あるサンプル：なし';
          clear.disabled = loaded.length === 0;
          clear.title = loaded.length === 0 ? '消すサンプルがありません' : '';
        },
      };
    },
  });
})();
```

`src/js/sample/sample-view.js`

```javascript
/* =========================================================
   画面だけで試すモード用の表示定義（自動生成。手で直さない）
   元: config/sample/view.sample.json と schema.sample.json の論理情報
   作り直し: python python/tools/sync_sample_view.py
   ========================================================= */
(function () {
  'use strict';

  window.DS = window.DS || {};
  window.DS.sampleView = /*VIEW_JSON_START*/{
  "logicalFields": [
    "lotNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "material",
    "temper",
    "size",
    "customer",
    "deliveryDate",
    "process",
    "equipment",
    "status"
  ],
  "recordKey": [
    "lotNo",
    "castingNo"
  ],
  "types": {
    "deliveryDate": "date"
  },
  "listColumns": [
    {
      "field": "lotNo",
      "label": "ロット番号",
      "visible": true,
      "searchable": true,
      "width": 170
    },
    {
      "field": "inspectionNo",
      "label": "検査番号",
      "visible": true,
      "searchable": true,
      "width": 150
    },
    {
      "field": "castingNo",
      "label": "鋳造番号",
      "visible": true,
      "searchable": true,
      "width": 150
    },
    {
      "field": "orderNo",
      "label": "受注番号",
      "visible": true,
      "searchable": true,
      "width": 120
    },
    {
      "field": "material",
      "label": "材質",
      "visible": true,
      "searchable": false,
      "width": 90
    },
    {
      "field": "temper",
      "label": "質別",
      "visible": true,
      "searchable": false,
      "width": 70
    },
    {
      "field": "size",
      "label": "寸法",
      "visible": true,
      "searchable": false,
      "width": 150
    },
    {
      "field": "customer",
      "label": "得意先",
      "visible": true,
      "searchable": false,
      "width": 130
    },
    {
      "field": "deliveryDate",
      "label": "納期",
      "visible": true,
      "searchable": false,
      "width": 110
    },
    {
      "field": "process",
      "label": "工程",
      "visible": true,
      "searchable": false,
      "width": 100
    },
    {
      "field": "equipment",
      "label": "設備",
      "visible": true,
      "searchable": false,
      "width": 90
    },
    {
      "field": "status",
      "label": "状態",
      "visible": true,
      "searchable": false,
      "width": 110
    }
  ],
  "detailFields": [
    "lotNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "material",
    "temper",
    "size",
    "customer",
    "deliveryDate",
    "process",
    "equipment",
    "status"
  ],
  "detailGroups": [
    {
      "id": "id",
      "label": "識別番号",
      "icon": "fa-hashtag"
    },
    {
      "id": "product",
      "label": "製品",
      "icon": "fa-cube"
    },
    {
      "id": "trade",
      "label": "取引",
      "icon": "fa-handshake"
    },
    {
      "id": "mfg",
      "label": "製造",
      "icon": "fa-industry"
    }
  ],
  "fields": {
    "lotNo": {
      "label": "ロット番号",
      "short": "ロット",
      "group": "id",
      "mono": true,
      "copy": true,
      "example": "LOT-2026-00012"
    },
    "inspectionNo": {
      "label": "検査番号",
      "short": "検査",
      "group": "id",
      "mono": true,
      "copy": true,
      "example": "INS-26-000012"
    },
    "castingNo": {
      "label": "鋳造番号",
      "short": "鋳造",
      "group": "id",
      "mono": true,
      "copy": true,
      "example": "CST-41000012"
    },
    "orderNo": {
      "label": "受注番号",
      "short": "受注",
      "group": "id",
      "mono": true,
      "copy": true,
      "example": "ORD-00003"
    },
    "material": {
      "label": "材質",
      "group": "product"
    },
    "temper": {
      "label": "質別",
      "group": "product"
    },
    "size": {
      "label": "寸法",
      "group": "product",
      "mono": true
    },
    "customer": {
      "label": "得意先",
      "group": "trade"
    },
    "deliveryDate": {
      "label": "納期",
      "group": "trade",
      "mono": true
    },
    "process": {
      "label": "工程",
      "group": "mfg"
    },
    "equipment": {
      "label": "設備",
      "group": "mfg",
      "mono": true
    },
    "status": {
      "label": "状態",
      "group": "mfg",
      "badge": [
        {
          "match": "不適合|不良|NG|異常|廃棄",
          "tone": "danger"
        },
        {
          "match": "保留|停止|要確認|遅延",
          "tone": "warning"
        },
        {
          "match": "完了|済|合格|OK",
          "tone": "success"
        },
        {
          "match": "仕掛|待ち|中$|予定",
          "tone": "info"
        }
      ]
    }
  },
  "filters": [
    {
      "field": "material",
      "type": "values"
    },
    {
      "field": "temper",
      "type": "values"
    },
    {
      "field": "customer",
      "type": "values"
    },
    {
      "field": "deliveryDate",
      "type": "date"
    },
    {
      "field": "process",
      "type": "values"
    },
    {
      "field": "equipment",
      "type": "values"
    },
    {
      "field": "status",
      "type": "values"
    }
  ],
  "defaultSort": {
    "field": "deliveryDate",
    "order": "asc"
  }
}/*VIEW_JSON_END*/;
})();
```

`src/js/views/detail-view.js`

```javascript
/* =========================================================
   選んだ行の詳細（メイン領域の右）。項目はまとまりごとに分けて表示する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /**
   * 別のツールへ渡す「送り先」の登録簿。登録すると詳細の下にボタンが出る。
   *   DS.handoffs.register({ id, order, label, icon, send(item) })   item は 12 項目の論理名のデータ
   */
  DS.handoffs = DS.core.createRegistry('handoffs');

  function createDetailView(root, { store, bus, search, toast }) {
    const { el, icon } = DS.util;

    const title = el('div', { className: 'detail__title' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '詳細を閉じる（Esc）', 'aria-label': '詳細を閉じる' }, [icon('fa-xmark', '×')]);
    const notice = el('div', { className: 'detail__notice' });
    const body = el('div', { className: 'detail__body' });
    const actions = el('div', { className: 'detail__actions' });
    root.append(el('div', { className: 'detail__head' }, [title, closeButton]), notice, body, actions);
    root.setAttribute('aria-label', '選んだデータの詳細');

    closeButton.addEventListener('click', () => search.closeDetail());
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') search.closeDetail();
    });

    async function copy(value, button) {
      try {
        await navigator.clipboard.writeText(value);
      } catch (error) {
        // file:// などでクリップボード API が使えないときの代わり
        const area = el('textarea', { style: 'position:fixed;opacity:0' });
        area.value = value;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      button.replaceChildren(icon('fa-check', '✓'));
      button.classList.add('is-done');
      window.setTimeout(() => {
        button.replaceChildren(icon('fa-copy', '⧉'));
        button.classList.remove('is-done');
      }, 1200);
      toast.show({ tone: 'success', message: `「${value}」をコピーしました`, timeout: 2000 });
    }

    function valueNode(field, value) {
      if (DS.domain.hasBadge(field)) return DS.domain.badge(field, value);
      if (value === null || value === undefined || value === '') return el('span', { className: 'muted', text: '—' });
      return el('span', { className: field.mono ? 'mono' : '', text: String(value) });
    }

    function render(state) {
      const selection = state.selection;
      root.hidden = !selection.key;
      if (!selection.key) return;
      const item = selection.item;

      // 見出し：1 件を特定する鍵の最初の項目（例：ロット番号）と、札を持つ項目（例：状態）
      const headField = DS.domain.keyFields()[0];
      const badgeField = DS.domain.detailFields().find((field) => DS.domain.hasBadge(field));
      title.replaceChildren(
        el('span', { className: 'detail__label', text: headField.label }),
        el('strong', { className: 'detail__lot mono', text: item[headField.id] || '—' }),
        badgeField ? DS.domain.badge(badgeField, item[badgeField.id]) : null,
      );

      const notices = [];
      if (selection.status === 'loading') notices.push(el('p', { className: 'inline-note' }, [icon('fa-spinner', '…', 'fa-spin'), el('span', { text: ' 最新の内容を確かめています' })]));
      if (selection.status === 'error') notices.push(el('p', { className: 'inline-note inline-note--danger' }, [icon('fa-circle-xmark', '×'), el('span', { text: ' ' + selection.error.userMessage })]));
      if (selection.duplicated) notices.push(el('p', { className: 'inline-note inline-note--warning' }, [icon('fa-triangle-exclamation', '!'), el('span', { text: ' 同じロット番号・鋳造番号のデータが複数あります。最初の 1 件を表示しています。' })]));
      notice.replaceChildren(...notices);

      // 詳細に出す項目と順番は view の detailFields。まとまりは fields.<項目>.group
      body.replaceChildren(...DS.domain.fieldGroups.list().flatMap((group) => {
        const rows = DS.domain.detailFields().filter((field) => field.group === group.id).flatMap((field) => {
          const value = item[field.id];
          const copyButton = field.copy && value
            ? el('button', { type: 'button', className: 'copy-btn', title: `${field.label}をコピー`, 'aria-label': `${field.label}をコピー` }, [icon('fa-copy', '⧉')])
            : null;
          if (copyButton) copyButton.addEventListener('click', () => copy(String(value), copyButton));
          return [
            el('dt', { text: field.label }),
            el('dd', {}, [valueNode(field, value), copyButton]),
          ];
        });
        if (rows.length === 0) return null;
        return el('section', { className: 'detail__group' }, [
          el('h3', { className: 'detail__group-title' }, [icon(group.icon, ''), el('span', { text: group.label })]),
          el('dl', { className: 'facts facts--detail' }, rows),
        ]);
      }));
      if (selection.status === 'done') DS.util.flash(title);

      const targets = DS.handoffs.list();
      actions.hidden = targets.length === 0;
      actions.replaceChildren(...targets.map((target) => {
        const button = el('button', { type: 'button', className: 'btn btn--secondary btn--block' }, [icon(target.icon || 'fa-share-from-square', ''), el('span', { text: target.label })]);
        button.addEventListener('click', () => target.send(Object.assign({}, item)));
        return button;
      }));
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.includes('selection')) render(state);
    });
    render(store.get());
  }

  DS.views.createDetailView = createDetailView;
})();
```

`src/js/views/results-view.js`

```javascript
/* =========================================================
   検索結果（メイン領域）：要約・ページ送り・一覧・空のときの案内・出どころ
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createResultsView(root, { store, bus, search, openPanel, refresh }) {
    const { el, icon, escapeHtml, highlight, formatNumber } = DS.util;

    const summary = el('div', { className: 'results__summary', 'aria-live': 'polite' });
    const pager = el('div', { className: 'pager' });
    const head = el('div', { className: 'results__head' }, [summary, pager]);
    const tableWrap = el('div', { className: 'table-wrap', tabindex: '0', 'aria-label': '検索結果の一覧（↑↓ で行を移動）' });
    const empty = el('div', { className: 'empty' });
    const foot = el('div', { className: 'results__foot' });
    root.append(head, el('div', { className: 'results__body' }, [tableWrap, empty]), foot);

    let currentItems = [];

    // ── 一覧 ──
    function visibleFields(state) {
      return DS.domain.listFields().filter((field) => state.columns.visible.includes(field.id));
    }

    function headerCell(field, state) {
      const active = state.sort.key === field.id;
      const sortIcon = !active ? 'fa-sort' : state.sort.order === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
      const ariaSort = !active ? 'none' : state.sort.order === 'asc' ? 'ascending' : 'descending';
      const searched = state.search.request && state.search.request.searchType === field.id;
      return `<th scope="col" aria-sort="${ariaSort}" style="min-width:${field.width}px" class="${searched ? 'is-searched' : ''}">` +
        `<button type="button" class="th-btn" data-sort="${field.id}" title="${escapeHtml(field.listLabel)}で並べ替え">` +
        `<span>${escapeHtml(field.listLabel)}</span><i class="fa-solid ${sortIcon} th-btn__icon${active ? ' is-active' : ''}" aria-hidden="true"></i></button></th>`;
    }

    function cell(field, item, request) {
      const value = item[field.id];
      if (DS.domain.hasBadge(field)) return `<td>${DS.domain.badge(field, value).outerHTML}</td>`;
      const text = value === null || value === undefined || value === '' ? '<span class="muted">—</span>'
        : request && request.searchType === field.id ? highlight(value, request.keyword) : escapeHtml(value);
      return `<td class="${field.mono ? 'mono' : ''}${request && request.searchType === field.id ? ' is-searched' : ''}">${text}</td>`;
    }

    function renderTable(state) {
      const result = state.search.result;
      const request = state.search.request;
      const fields = visibleFields(state);
      currentItems = result ? result.items : [];
      const rows = currentItems.map((item, index) => {
        const key = DS.domain.recordKey(item);
        const selected = key === state.selection.key;
        return `<tr data-index="${index}" class="${selected ? 'is-selected' : ''}" aria-selected="${selected}">` +
          fields.map((field) => cell(field, item, request)).join('') + '</tr>';
      }).join('');
      tableWrap.innerHTML = `<table class="grid"><thead><tr>${fields.map((field) => headerCell(field, state)).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    }

    function renderSelection(state) {
      tableWrap.querySelectorAll('tbody tr').forEach((row) => {
        const item = currentItems[Number(row.dataset.index)];
        const selected = DS.domain.recordKey(item) === state.selection.key;
        row.classList.toggle('is-selected', selected);
        row.setAttribute('aria-selected', String(selected));
      });
    }

    tableWrap.addEventListener('click', (event) => {
      const sortButton = event.target.closest('[data-sort]');
      if (sortButton) {
        search.toggleSort(sortButton.dataset.sort);
        return;
      }
      const row = event.target.closest('tbody tr');
      if (row) search.select(currentItems[Number(row.dataset.index)]);
    });

    tableWrap.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key) || currentItems.length === 0) return;
      event.preventDefault();
      const selectedKey = store.get().selection.key;
      const index = currentItems.findIndex((item) => DS.domain.recordKey(item) === selectedKey);
      const next = index === -1 ? 0 : Math.min(currentItems.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
      search.select(currentItems[next]);
      const row = tableWrap.querySelector(`tbody tr[data-index="${next}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    });

    // ── 要約とページ送り ──
    function renderHead(state) {
      const result = state.search.result;
      const request = state.search.request;
      if (!result || !request) {
        summary.replaceChildren(el('span', { className: 'results__title', text: '検索結果' }));
        pager.replaceChildren();
        return;
      }
      const count = el('strong', { className: 'results__count mono', text: `${formatNumber(result.totalCount)} 件` });
      const title = request.keyword
        ? el('span', { className: 'results__title' }, [
          el('span', { text: `${DS.domain.fields.get(request.searchType).listLabel}が「` }),
          el('span', { className: 'mono', text: request.keyword }),
          el('span', { text: `」${request.matchMode === 'exact' ? 'と同じ' : 'を含む'}ロット` }),
        ])
        : el('span', { className: 'results__title', text: 'ロット一覧' });
      summary.replaceChildren(title, count, activeFilterChips(request));
      DS.util.flash(count);

      const pages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));
      const from = result.totalCount === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
      const to = (result.page - 1) * result.pageSize + result.count;
      const prev = el('button', { type: 'button', className: 'icon-btn', title: '前のページ', 'aria-label': '前のページ', disabled: result.page <= 1 }, [icon('fa-chevron-left', '<')]);
      const next = el('button', { type: 'button', className: 'icon-btn', title: '次のページ', 'aria-label': '次のページ', disabled: result.page >= pages }, [icon('fa-chevron-right', '>')]);
      prev.addEventListener('click', () => search.goToPage(result.page - 1));
      next.addEventListener('click', () => search.goToPage(result.page + 1));
      const parts = [el('span', { className: 'pager__range mono', text: result.totalCount ? `${formatNumber(from)}–${formatNumber(to)} 件目` : '' })];
      if (pages > 1) parts.push(prev, el('span', { className: 'pager__pages mono', text: `${result.page} / ${formatNumber(pages)} ページ` }), next);
      pager.replaceChildren(...parts);
    }

    /** 今かかっている絞り込みを札で出す。× で 1 つずつ外せる */
    function activeFilterChips(request) {
      const entries = Object.entries(request.filters || {});
      const nodes = entries.map(([fieldId, spec]) => {
        const field = DS.domain.fields.get(fieldId);
        const remove = el('button', { type: 'button', className: 'filter-chip__remove', title: `${field.label}の絞り込みを外す`, 'aria-label': `${field.label}の絞り込みを外す` }, [icon('fa-xmark', '×')]);
        remove.addEventListener('click', () => search.clearFilter(fieldId));
        const label = el('button', { type: 'button', className: 'filter-chip__label', title: '絞り込みのパネルで直す' }, [
          icon('fa-filter', ''),
          el('span', { text: `${field.label}：${DS.domain.filters.describe(fieldId, spec)}` }),
        ]);
        label.addEventListener('click', () => openPanel('filters'));
        return el('span', { className: 'filter-chip' }, [label, remove]);
      });
      return el('span', { className: 'filter-chips' }, nodes);
    }

    // ── 空のときの案内（次にすることを 1 つ示す） ──
    function emptyCard(iconName, title, text, actions) {
      return el('div', { className: 'empty__card' }, [
        el('span', { className: 'empty__icon' }, [icon(iconName, '')]),
        el('h2', { className: 'empty__title', text: title }),
        text ? el('p', { className: 'empty__text', text }) : null,
        actions && actions.length ? el('div', { className: 'empty__actions' }, actions) : null,
      ]);
    }

    function actionButton(label, iconName, onClick, primary) {
      const button = el('button', { type: 'button', className: `btn ${primary ? 'btn--primary' : 'btn--secondary'}` }, [icon(iconName, ''), el('span', { text: label })]);
      button.addEventListener('click', onClick);
      return button;
    }

    function renderEmpty(state) {
      const status = state.search.status;
      const result = state.search.result;
      const cacheStatus = state.cache.status;
      let card = null;

      if (cacheStatus && !cacheStatus.available) {
        card = state.mode.capabilities.sampleData
          ? emptyCard('fa-flask', 'まずはサンプルデータを読み込みます', '左の「サンプル」から目的に合うデータを選ぶと、そのまま検索を試せます。',
            [actionButton('サンプルを選ぶ', 'fa-flask', () => openPanel('samples'), false)])
          : emptyCard('fa-database', '検索できるデータがまだありません', cacheStatus.message,
            [actionButton('データを更新する', 'fa-rotate', refresh, false)]);
      } else if (status === 'error') {
        const error = state.search.error;
        card = emptyCard('fa-circle-xmark', '検索できませんでした', error.userMessage + (error.detailId ? `（問い合わせ番号 ${error.detailId}）` : ''),
          [actionButton('もう一度検索する', 'fa-rotate-right', () => search.run({ page: 1 }), false)]);
      } else if (!result) {
        card = status === 'loading' ? emptyCard('fa-spinner', '一覧を読み込んでいます', null) : null;
      } else if (result && result.totalCount === 0) {
        const request = state.search.request;
        const actions = [];
        const filterCount = Object.keys(request.filters || {}).length;
        if (filterCount) {
          actions.push(actionButton('絞り込みを外して探す', 'fa-filter-circle-xmark', () => search.setFilters({}), false));
        }
        if (!request.keyword) {
          card = emptyCard('fa-filter', '絞り込みに当てはまるロットはありません', '条件をゆるめるか、外してください。上の札の × で 1 つずつ外せます。', actions);
          empty.replaceChildren(card);
          empty.hidden = false;
          tableWrap.hidden = true;
          root.classList.toggle('is-loading', false);
          return;
        }
        const field = DS.domain.fields.get(request.searchType);
        if (request.matchMode === 'exact') {
          actions.push(actionButton('部分一致で探し直す', 'fa-magnifying-glass-plus', () => {
            search.setQuery({ matchMode: 'partial' });
            search.run({ page: 1 });
          }, false));
        }
        DS.domain.searchableFields().filter((other) => other.id !== request.searchType).forEach((other) => {
          actions.push(actionButton(`${other.listLabel}として探す`, 'fa-arrow-right-arrow-left', () => {
            search.setQuery({ searchType: other.id });
            search.run({ page: 1 });
          }, false));
        });
        card = emptyCard('fa-circle-question', '一致するロットはありません',
          `${field.listLabel}が「${request.keyword}」${request.matchMode === 'exact' ? 'と同じ' : 'を含む'}ロットは${filterCount ? '、今の絞り込みの中に' : ''}ありません。番号の種類や一致のしかたを確かめてください。`,
          actions);
      }
      empty.replaceChildren(...(card ? [card] : []));
      empty.hidden = !card;
      tableWrap.hidden = Boolean(card) || !result;
      root.classList.toggle('is-loading', status === 'loading');
    }

    // ── 出どころ ──
    function renderFoot(state) {
      const status = state.cache.status;
      const result = state.search.result;
      const parts = [el('span', {}, [icon(state.mode.mode === 'mock' ? 'fa-flask' : 'fa-database', ''), el('span', { text: ` ${state.mode.label}` })])];
      if (status && status.cacheUpdatedAt) parts.push(el('span', { className: 'mono', text: `${DS.util.formatDateTime(status.cacheUpdatedAt)} 時点のデータ` }));
      if (result && typeof result.elapsedMs === 'number') parts.push(el('span', { className: 'mono', text: `検索 ${result.elapsedMs} ms` }));
      const typed = DS.util.normalize(state.query.keyword);
      if (result && state.search.request && /[！-～　]/.test(state.query.keyword) && typed === state.search.request.keyword) {
        parts.push(el('span', { text: '全角の英数字・記号は半角にそろえて検索しました' }));
      }
      const request = state.search.request;
      if (result && request && Object.values(request.filters || {}).some((spec) => spec.type === 'date' && spec.mode === 'relative')) {
        parts.push(el('span', { className: 'mono', text: `日付は今日（${DS.domain.filters.slashOf(result.today)}）を基準に絞り込み` }));
      }
      if (status && status.usingPreviousCache) {
        parts.push(el('span', { className: 'is-warning' }, [icon('fa-triangle-exclamation', '!'), el('span', { text: ' 前回のデータを使用中' })]));
      }
      foot.replaceChildren(...parts.flatMap((part, index) => (index ? [el('span', { className: 'results__sep', text: '·' }), part] : [part])));
    }

    bus.on('state', ({ state, changed }) => {
      const tableKeys = ['search', 'columns', 'sort'];
      if (changed.some((key) => tableKeys.includes(key))) {
        renderTable(state);
        renderHead(state);
      } else if (changed.includes('selection')) {
        renderSelection(state);
      }
      if (changed.some((key) => ['search', 'cache', 'mode'].includes(key))) renderEmpty(state);
      if (changed.some((key) => ['search', 'cache', 'query'].includes(key))) renderFoot(state);
      if (changed.includes('columns')) DS.util.flash(tableWrap.querySelector('thead'));
    });

    bus.on('search:done', () => {
      tableWrap.scrollTop = 0;
    });

    const initial = store.get();
    renderTable(initial);
    renderHead(initial);
    renderEmpty(initial);
    renderFoot(initial);

    return { focusTable: () => tableWrap.focus() };
  }

  DS.views.createResultsView = createResultsView;
})();
```

`src/js/views/search-bar.js`

```javascript
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
        title: `${field.listLabel}で検索（Alt+${index + 1}）`,
      }, [el('span', { text: field.listLabel }), el('kbd', { className: 'seg__kbd', text: String(index + 1) })]));
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
      inputLabel.textContent = field.listLabel;
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

