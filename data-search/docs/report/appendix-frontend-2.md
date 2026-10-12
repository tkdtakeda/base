## 付録：画面側の修正ファイルの全文（2/4）

`src/js/api/mock-adapter.js`

```javascript
/* =========================================================
   画面だけで試すモード（index.html を直接開いたとき）のアダプター。
   本物と同じ命令名・同じ入出力で、サンプルデータを検索する。
   入力の検証や検索の決まり（全角→半角、大文字小文字を区別しない、など）は Python 版にそろえる。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const STORAGE_KEY = 'mock:samples';
  const searchable = () => DS.domain.searchableFields().map((field) => field.id);
  const KEYWORD_MAX = 100;
  const PAGE_SIZE = 100;
  const MAX_PAGE_SIZE = 500;
  const LATENCY_MS = 60;
  const REFRESH_MS = 1400;
  const VALUE_LIST_LIMIT = 200;

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const nowIso = () => new Date().toISOString();
  const fail = (code, userMessage) => ({
    success: false,
    error: { code, userMessage, detailId: 'MOCK-' + Math.random().toString(16).slice(2, 8).toUpperCase() },
  });

  function createMockAdapter() {
    // 読み込んだパターンの id と時刻だけを保存し、データは種から作り直す（保存量を小さくする）
    let saved = DS.core.storage.read(STORAGE_KEY, { ids: [], loadedAt: null, refreshedAt: null });
    let rows = [];
    let effects = {};
    const countCache = new Map();

    function rebuild() {
      rows = [];
      effects = {};
      DS.sample.expand(saved.ids).forEach((id) => {
        const pattern = DS.sample.patterns.get(id);
        pattern.build().forEach((row) => rows.push(row));
        Object.assign(effects, pattern.effects || {});
      });
    }

    function persist() {
      return DS.core.storage.write(STORAGE_KEY, saved);
    }

    rebuild();

    // ── 一覧・検索・絞り込み（Python 版の lot_service と同じ決まり） ──
    function filterRows(payload) {
      const keyword = DS.util.normalize(payload.keyword).toLowerCase();
      const searchType = searchable().includes(payload.searchType) ? payload.searchType : null;
      const today = DS.domain.filters.todayIso();
      const filters = Object.entries(DS.domain.filters.compact(payload.filters));
      return rows.filter((row) => {
        if (keyword && searchType) {
          const value = String(row[searchType] == null ? '' : row[searchType]).toLowerCase();
          if (payload.matchMode === 'exact' ? value !== keyword : !value.includes(keyword)) return false;
        }
        return filters.every(([fieldId, spec]) =>
          DS.domain.filterTypes.get(spec.type).matches(row[fieldId], spec, today));
      });
    }

    function listRows(payload) {
      const started = performance.now();
      const keyword = DS.util.normalize(payload.keyword);
      if (keyword.length > KEYWORD_MAX) return fail('INVALID_REQUEST', `検索する番号は ${KEYWORD_MAX} 文字以内で入力してください。`);
      if (keyword && !searchable().includes(payload.searchType)) return fail('INVALID_REQUEST', '検索の条件が正しくありません。');
      if (rows.length === 0) return fail('CACHE_UNAVAILABLE', '検索できるデータがまだありません。左の「サンプル」から読み込んでください。');
      const page = Math.max(1, Number(payload.page) || 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(payload.pageSize) || PAGE_SIZE));
      const sortKey = DS.domain.fields.has(payload.sortKey) ? payload.sortKey : DS.domain.DEFAULT_SORT.key;
      const sortField = DS.domain.fields.get(sortKey);
      const direction = payload.sortOrder === 'desc' ? -1 : 1;
      const sortValue = (row) => (sortField.type === 'date' ? DS.domain.filters.normalizeDate(row[sortKey]) : row[sortKey]);
      const isBlank = (value) => value === null || value === undefined || String(value).trim() === '';
      const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

      const hits = filterRows(payload);
      hits.sort((a, b) => {
        const va = sortValue(a);
        const vb = sortValue(b);
        // 空欄は昇順・降順どちらでも最後
        return compare(isBlank(va), isBlank(vb)) ||
          compare(va || '', vb || '') * direction ||
          DS.domain.keyFields().reduce((result, field) => result || compare(a[field.id] || '', b[field.id] || ''), 0);
      });
      const items = hits.slice((page - 1) * pageSize, page * pageSize).map((row) => Object.assign({}, row));
      return {
        success: true,
        count: items.length,
        totalCount: hits.length,
        page,
        pageSize,
        items,
        keyword: keyword || null,
        today: DS.domain.filters.todayIso(),
        elapsedMs: Math.round((performance.now() - started) * 10) / 10,
      };
    }

    // ── 読み込み先（このモードでは画面の動きを試すための模擬。ファイルには届かず、保存もしない） ──
    let sourcePath = '\\\\example-server\\share\\sample.sqlite3';
    const SOURCE_STEPS = [['format', 'パスの書き方'], ['reach', '場所に届くか'], ['read', '読めるか'], ['sqlite', 'SQLite として開けるか'], ['table', 'テーブルと列'], ['rows', '件数']];
    function simulateCheck(path) {
      const value = DS.controllers.normalizeSourcePath(path);
      // 模擬の決まり：.sqlite3 / .sqlite / .db は ○、拡張子なしは「ファイルがない」、ほかは「SQLite ではない」
      let failAt = null;
      let failure = null;
      if (!value) [failAt, failure] = ['format', ['パスが空です。', '共有 SQLite のファイルのパスを入力してください。']];
      else if (!/\.[^\\/.]+$/.test(value)) [failAt, failure] = ['reach', ['フォルダはありますが、ファイルがありません。', 'ファイル名（拡張子を含む）を確認してください。']];
      else if (!/\.(sqlite3?|db)$/i.test(value)) [failAt, failure] = ['sqlite', ['SQLite のファイルではありません。', '指定したファイルが共有 SQLite（.sqlite3 / .db など）か確認してください。']];
      let failed = false;
      const steps = SOURCE_STEPS.map(([id, label]) => {
        if (failed) return { id, label, status: 'skip', message: '前の段階が × のため確かめていません。', action: '' };
        if (id === failAt) {
          failed = true;
          return { id, label, status: 'ng', message: failure[0], action: failure[1] };
        }
        return { id, label, status: 'ok', message: id === 'rows' ? `${rows.length.toLocaleString('ja-JP')} 件あります。（模擬）` : '問題ありません。（模擬）', action: '' };
      });
      return { success: true, ok: !failed, steps, rowCount: failed ? null : rows.length, modifiedAt: failed ? null : nowIso(), normalizedPath: value };
    }

    // ── 命令 ──
    const commands = {
      get_data_source: () => ({ success: true, sourcePath, editable: true, localFile: '（サンプルのモードでは保存しません）' }),
      test_data_source: (payload) => simulateCheck(payload.sourcePath == null ? sourcePath : payload.sourcePath),
      update_data_source(payload) {
        const result = simulateCheck(payload.sourcePath);
        if (!result.ok) return Object.assign(result, { saved: false, message: '接続テストで × があるため、保存していません。' });
        sourcePath = result.normalizedPath;
        return Object.assign(result, { saved: true, refreshed: true, message: '読み込み先を変更しました（サンプルのモードのため、データは変わりません）。' });
      },

      get_application_info: () => ({ id: 'data-search', name: 'Data Search', version: '0.1.0' }),

      // 表示定義：config/sample/view.sample.json から自動生成した js/sample/sample-view.js
      get_view_config: () => Object.assign({ success: true }, JSON.parse(JSON.stringify(DS.sampleView))),

      get_cache_status() {
        const available = rows.length > 0;
        const failed = available && effects.refreshFailure;
        return {
          available,
          lastRefreshSucceeded: !failed,
          sourceModifiedAt: available ? saved.loadedAt : null,
          cacheUpdatedAt: available ? saved.refreshedAt || saved.loadedAt : null,
          usingPreviousCache: Boolean(failed),
          message: !available
            ? 'サンプルデータがありません。左の「サンプル」から読み込んでください。'
            : failed
              ? '最新のデータを取得できなかったため、前回のデータを参照しています。'
              : '最新のキャッシュを参照しています。',
          rowCount: rows.length,
          sourceReachable: !failed,
          sourceHasUpdate: false,
          lastRefreshAt: saved.refreshedAt || saved.loadedAt,
          errorCode: failed ? 'SOURCE_UNAVAILABLE' : null,
          errorMessage: failed ? '共有データに接続できません。ネットワークと共有フォルダを確認してください。' : null,
        };
      },

      async refresh_cache() {
        await wait(REFRESH_MS);
        if (rows.length === 0) return fail('SOURCE_UNAVAILABLE', 'サンプルデータがありません。左の「サンプル」から読み込んでください。');
        if (effects.refreshFailure) {
          return fail('SOURCE_UNAVAILABLE', '共有データに接続できません。ネットワークと共有フォルダを確認してください。');
        }
        saved.refreshedAt = nowIso();
        persist();
        return {
          success: true,
          sourceModifiedAt: saved.loadedAt,
          cacheUpdatedAt: saved.refreshedAt,
          usingPreviousCache: false,
          rowCount: rows.length,
          message: 'キャッシュを更新しました。',
        };
      },

      search_lots(payload) {
        if (!DS.util.normalize(payload.keyword)) return fail('INVALID_REQUEST', '検索する番号を入力してください。');
        return listRows(payload);
      },

      list_lots: (payload) => listRows(payload),

      get_filter_values(payload) {
        const field = DS.domain.fields.get(payload.field);
        if (!field || field.filter !== 'values') return fail('INVALID_REQUEST', '検索の条件が正しくありません。');
        if (rows.length === 0) return fail('CACHE_UNAVAILABLE', '検索できるデータがまだありません。左の「サンプル」から読み込んでください。');
        const others = Object.assign({}, payload.filters || {});
        delete others[field.id];
        const counts = new Map();
        filterRows(Object.assign({}, payload, { filters: others })).forEach((row) => {
          const raw = row[field.id];
          const value = raw === null || raw === undefined || String(raw).trim() === '' ? null : String(raw);
          counts.set(value, (counts.get(value) || 0) + 1);
        });
        const values = Array.from(counts, ([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
        return { success: true, field: field.id, values: values.slice(0, VALUE_LIST_LIMIT), truncated: values.length > VALUE_LIST_LIMIT };
      },

      get_lot_detail(payload) {
        const keys = DS.domain.keyFields().map((field) => field.id);
        const found = rows.filter((row) => keys.every((id) => (row[id] || null) === (payload[id] || null)));
        if (found.length === 0) return fail('NOT_FOUND', '選んだデータが見つかりません。データが更新された可能性があります。もう一度検索してください。');
        return { success: true, item: Object.assign({}, found[0]), duplicated: found.length > 1 };
      },
    };

    return {
      mode: 'mock',
      label: 'サンプル',
      description: 'index.html を直接開いたため、ブラウザの中のサンプルデータを検索しています。実データは使っていません。',
      capabilities: { refresh: true, sampleData: true },
      async invoke(command, payload) {
        await wait(LATENCY_MS);
        return commands[command](payload);
      },

      // ── サンプルデータの管理（このモードだけの機能） ──
      samples: {
        loadedIds: () => DS.sample.expand(saved.ids),
        rowCount: () => rows.length,
        countOf: (id) => {
          const pattern = DS.sample.patterns.get(id);
          if (!pattern) return 0;
          if (!countCache.has(id)) countCache.set(id, pattern.build().length);
          return countCache.get(id);
        },
        load(id) {
          if (!DS.sample.patterns.has(id)) return { ok: false, reason: 'そのサンプルはありません' };
          const before = rows.length;
          saved = Object.assign({}, saved, {
            ids: DS.sample.expand(saved.ids.filter((x) => x !== id).concat(id)),
            loadedAt: nowIso(),
            refreshedAt: null,
          });
          rebuild();
          const stored = persist();
          return { ok: true, added: rows.length - before, total: rows.length, warning: stored.ok ? null : stored.reason };
        },
        /** サンプルだけを消す。元に戻すための控えを返す */
        clear() {
          const snapshot = Object.assign({}, saved);
          const removed = rows.length;
          saved = { ids: [], loadedAt: null, refreshedAt: null };
          rebuild();
          persist();
          return { snapshot, removed };
        },
        restore(snapshot) {
          saved = Object.assign({}, snapshot);
          rebuild();
          persist();
          return rows.length;
        },
      },
    };
  }

  DS.api.adapters.register({
    id: 'mock',
    order: 90,
    detect: () => true,
    create: createMockAdapter,
  });
})();
```

`src/js/controllers/app-state.js`

```javascript
/* =========================================================
   状態の初期値と、設定の自動保存（次に開いたときに元に戻す）
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.controllers = DS.controllers || {};

  const PREFS_KEY = 'prefs';
  const HISTORY_MAX = 8;

  function defaultVisibleColumns() {
    return DS.domain.listFields().map((field) => field.id);
  }

  function createInitialState(mode) {
    const prefs = DS.core.storage.read(PREFS_KEY, {});
    const searchable = DS.domain.searchableFields().map((field) => field.id);
    const knownColumns = (prefs.visibleColumns || []).filter((id) => DS.domain.fields.has(id));
    return {
      mode,
      appInfo: null,
      cache: { status: null, refreshing: false, refreshStartedAt: null },
      source: { path: null, editable: false, localFile: '', loaded: false, loadError: null, status: 'idle', result: null, testedPath: null },
      query: {
        searchType: searchable.includes(prefs.searchType) ? prefs.searchType : searchable[0],
        keyword: '',
        matchMode: prefs.matchMode === 'exact' ? 'exact' : 'partial',
      },
      sort: Object.assign({}, DS.domain.DEFAULT_SORT),
      filters: {},
      tags: { items: DS.controllers.loadTags(), activeId: null },
      search: { status: 'idle', result: null, request: null, error: null },
      selection: { key: null, item: null, status: 'idle', error: null, duplicated: false },
      ui: { panel: null },
      columns: { visible: knownColumns.length ? knownColumns : defaultVisibleColumns() },
      history: prefs.history || {},
      samplesVersion: 0,
    };
  }

  /** 保存したい部分が変わったときだけ書き込む */
  function attachPrefsPersistence(store, bus) {
    const WATCHED = ['query', 'columns', 'history'];
    bus.on('state', ({ state, changed }) => {
      if (!changed.some((key) => WATCHED.includes(key))) return;
      const result = DS.core.storage.write(PREFS_KEY, {
        searchType: state.query.searchType,
        matchMode: state.query.matchMode,
        visibleColumns: state.columns.visible,
        history: state.history,
      });
      if (!result.ok) bus.emit('prefs:failed', result.reason);
    });
  }

  function pushHistory(history, searchType, keyword) {
    const list = (history[searchType] || []).filter((item) => item !== keyword);
    list.unshift(keyword);
    return Object.assign({}, history, { [searchType]: list.slice(0, HISTORY_MAX) });
  }

  DS.controllers.createInitialState = createInitialState;
  DS.controllers.attachPrefsPersistence = attachPrefsPersistence;
  DS.controllers.defaultVisibleColumns = defaultVisibleColumns;
  DS.controllers.pushHistory = pushHistory;
})();
```

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

`src/js/controllers/source-controller.js`

```javascript
/* =========================================================
   読み込み先（共有 SQLite のパス）の確認・接続テスト・変更

     load()        今の読み込み先を読む
     test(path)    接続テスト（コピーも書き込みもしない）。段階ごとの ○ × を state.source.result に入れる
     save(path)    接続テストがすべて ○ の値だけ保存できる → config.local.json に保存 → データを更新
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /** 貼り付けたパスを整える（前後の空白と、「パスとしてコピー」で付く引用符を外す）。バックエンドと同じ決まり */
  function normalizePath(text) {
    let value = String(text == null ? '' : text).trim();
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1).trim();
    }
    return value;
  }

  function createSourceController({ store, api, toast, search, cache }) {
    const set = (patch) => store.merge('source', patch);

    async function load() {
      try {
        const info = await api.call('get_data_source');
        set({ path: info.sourcePath, editable: info.editable !== false, localFile: info.localFile || '', loaded: true });
      } catch (error) {
        set({ editable: false, loaded: true, loadError: error.userMessage });
      }
    }

    async function test(path) {
      const value = path == null ? store.get().source.path : normalizePath(path);
      set({ status: 'checking', result: null, testedPath: null });
      try {
        const result = await api.call('test_data_source', { sourcePath: value });
        set({ status: 'idle', result, testedPath: result.normalizedPath });
        return result;
      } catch (error) {
        set({ status: 'idle' });
        toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
        return null;
      }
    }

    /** 確かめた値と同じで、すべて ○ のときだけ保存できる */
    function canSave(path) {
      const { result, testedPath, status } = store.get().source;
      return status === 'idle' && Boolean(result && result.ok) && testedPath === normalizePath(path);
    }

    async function save(path) {
      if (!canSave(path)) return false;
      set({ status: 'saving' });
      try {
        const result = await api.call('update_data_source', { sourcePath: normalizePath(path) });
        set({ status: 'idle', result, testedPath: result.normalizedPath });
        if (!result.saved) {
          toast.show({ tone: 'warning', message: result.message });
          return false;
        }
        toast.show({ tone: result.refreshed ? 'success' : 'warning', message: result.message });
        await load();
        await cache.loadStatus();
        search.rerun();
        return true;
      } catch (error) {
        set({ status: 'idle' });
        toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
        return false;
      }
    }

    function reset() {
      set({ result: null, testedPath: null });
    }

    return { load, test, save, canSave, reset, normalizePath };
  }

  DS.controllers.createSourceController = createSourceController;
  DS.controllers.normalizeSourcePath = normalizePath;
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

  const DEFAULT_GROUP_ICON = 'fa-layer-group';
  const OTHER_GROUP = { id: '__other', label: 'その他', icon: 'fa-ellipsis' };

  let lists = { list: [], detail: [], searchable: [], key: [], filter: [], sections: [] };

  /** 表示定義を当てはめる。起動時に 1 回、画面の部品を作る前に呼ぶ */
  function applyView(view) {
    const groups = DS.core.createRegistry('fieldGroups');
    const fields = DS.core.createRegistry('fields');
    const detailGroups = view.detailGroups || [];
    detailGroups.forEach((group, index) => groups.register({
      id: group.id, label: group.label, icon: group.icon || DEFAULT_GROUP_ICON, order: (index + 1) * 10, members: group.fields || null,
    }));
    groups.register(Object.assign({ order: 99990, members: null }, OTHER_GROUP));

    // まとまりへの所属：detailGroups[].fields を優先し、なければ fields.<項目>.group
    const membership = new Map();
    detailGroups.forEach((group) => (group.fields || []).forEach((id) => membership.set(id, group.id)));

    const columns = new Map((view.listColumns || []).map((column, index) => [column.field, Object.assign({ index }, column)]));
    const filters = new Map((view.filters || []).map((filter) => [filter.field, filter.type]));
    const options = view.fields || {};
    const recordKey = view.recordKey || [];

    view.logicalFields.forEach((id, index) => {
      const column = columns.get(id) || {};
      const option = options[id] || {};
      const groupId = membership.get(id) || (option.group && groups.has(option.group) ? option.group : OTHER_GROUP.id);
      const searchable = column.searchable === true;
      fields.register({
        id,
        order: (index + 1) * 10,
        // 表示名はすべての画面で同じ（詳細・一覧の見出し・検索の種類・絞り込み）。
        // 優先順：fields.<項目>.label（DB の列名から作った表示名を含む）→ listColumns の label → 論理名
        label: option.label || column.label || id,
        listLabel: option.label || column.label || id,
        short: option.short || null,
        group: groupId,
        // 番号で探せる項目は、指定がなければ等幅で表示し、コピーできるようにする（0 と O を見分けやすく、転記しやすく）
        mono: option.mono === undefined ? searchable : Boolean(option.mono),
        copy: option.copy === undefined ? searchable : Boolean(option.copy),
        example: option.example || '',
        width: column.width || 120,
        badge: (option.badge || []).map((rule) => ({ pattern: new RegExp(rule.match), tone: rule.tone })),
        filter: filters.get(id) || null,
        type: (view.types || {})[id] || 'text',
        searchable,
        key: recordKey.includes(id),
      });
    });

    const pick = (ids) => ids.map((id) => fields.get(id)).filter(Boolean);
    const detail = pick(view.detailFields || []);
    const detailSet = new Set(detail.map((field) => field.id));
    // 詳細の区切り：まとまりの順に、まとまりの fields の順（なければ detailFields の順）で並べる
    const sections = groups.list().map((group) => ({
      group,
      fields: group.members
        ? pick(group.members).filter((field) => detailSet.has(field.id))
        : detail.filter((field) => field.group === group.id),
    })).filter((section) => section.fields.length);

    lists = {
      // 一覧に出す列：listColumns の順。visible: false の列は一覧に出さない
      list: pick((view.listColumns || []).filter((column) => column.visible).map((column) => column.field)),
      detail,
      searchable: pick((view.listColumns || []).filter((column) => column.searchable).map((column) => column.field)),
      key: pick(recordKey),
      filter: pick((view.filters || []).map((filter) => filter.field)),
      sections,
    };

    DS.domain.fieldGroups = groups;
    DS.domain.fields = fields;
    DS.domain.DEFAULT_SORT = { key: view.defaultSort.field, order: view.defaultSort.order };
  }

  DS.domain.applyView = applyView;
  DS.domain.listFields = () => lists.list;
  DS.domain.detailFields = () => lists.detail;
  DS.domain.detailSections = () => lists.sections;
  DS.domain.searchableFields = () => lists.searchable;
  DS.domain.keyFields = () => lists.key;
  DS.domain.filterFields = () => lists.filter;

  /** 1 件を特定する鍵（schema の recordKey。例：ロット番号＋BOX番号）を文字列にする */
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

`src/js/manual/manual-content.js`

```javascript
/* =========================================================
   取扱説明書の章。機能を足したら、ここにも register() で章を足す。
   group は作業の順のまとまり。最初は「3 分で使う」を開く。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const groups = DS.core.createRegistry('manualGroups');
  const chapters = DS.core.createRegistry('manualChapters');

  [
    { id: 'start', label: 'はじめに', order: 10 },
    { id: 'search', label: '探す', order: 20 },
    { id: 'data', label: 'データと表示', order: 30 },
    { id: 'trouble', label: '困ったとき', order: 40 },
    { id: 'appendix', label: '付録', order: 50 },
  ].forEach((group) => groups.register(group));

  [
    {
      id: 'quick', group: 'start', order: 10, title: '3 分で使う',
      body: `
        <ol class="manual-steps">
          <li>開くと<strong>ロットの一覧</strong>が決まった順（標準は工場納期の近い順）に出ます。入力は要りません。1 ロットに BOX が複数あれば BOX ごとに 1 行です。</li>
          <li>一覧の上の<strong>タグ</strong>を押すと、保存しておいた絞り込みに切り替わります。</li>
          <li>ロットの行を押すと、右に<strong>詳細</strong>が出ます。<kbd>↑</kbd><kbd>↓</kbd> で行を移れます。</li>
          <li>番号が分かっているときは、上部バーに入れて <kbd>Enter</kbd>。今の絞り込みの中から探します。</li>
        </ol>
        <p>右上の青いボタンは、いつも「次にすること」を指します。データがないときは「サンプルを読み込む」「データを更新する」に変わります。</p>`,
    },
    {
      id: 'modes', group: 'start', order: 20, title: '3 つの起動方法',
      body: `
        <table class="manual-table">
          <tr><th>起動のしかた</th><th>上部バーの表示</th><th>検索するデータ</th></tr>
          <tr><td>index.html をダブルクリック</td><td>サンプル</td><td>ブラウザの中のサンプル（実データは使いません）</td></tr>
          <tr><td>start.bat をダブルクリック</td><td>Python 版</td><td>設定ファイルが指す共有データのコピー</td></tr>
          <tr><td>デスクトップ版（今後）</td><td>デスクトップ版</td><td>同上</td></tr>
        </table>
        <p>どのデータを見ているかは、上部バー右と一覧の下に必ず表示されます。</p>`,
    },
    {
      id: 'filters', group: 'search', order: 5, title: '絞り込む',
      body: `
        <ul>
          <li>一覧の上の「絞り込み」か、左の <span class="manual-icon">▼</span> で絞り込みのパネルが開きます。</li>
          <li>項目を開き、値にチェックを付けるとすぐ一覧に反映されます。値の横の数は、ほかの条件を当てはめたときの件数です。</li>
          <li>項目どうしは「かつ」、同じ項目の中は「または」で絞り込みます。（空欄）も選べます。</li>
          <li>日付の項目は「今日より前」「今日〜7 日後」などから選べます。「範囲を自分で決める」で日数や日付そのものも指定できます。</li>
          <li>今かかっている条件は一覧の見出しに札で出ます。札の × で 1 つずつ外せます。</li>
        </ul>`,
    },
    {
      id: 'tags', group: 'search', order: 6, title: 'タグ（絞り込みを保存して使い回す）',
      body: `
        <ul>
          <li>条件を選んだら、一覧の上の「今の条件をタグにする」で名前を付けて保存します。次回からはタグを押すだけです。</li>
          <li>日付を「今日から○日」で決めたタグは、毎日その日を基準に絞り込みます。日付そのもので決めたタグは、その日付のままです。</li>
          <li>タグを選んだあと条件を変えると「変更あり」と出ます。「上書き保存」でタグを今の条件にできます。</li>
          <li>名前の変更・並べ替え・削除は、選んだタグの <span class="manual-icon">⋮</span> から。消したあと 10 秒間は「元に戻す」で戻せます。</li>
          <li>タグはこの PC のブラウザに保存されます。絞り込みのパネルの下で、ファイルに書き出して、ほかの人に渡せます。</li>
        </ul>`,
    },
    {
      id: 'search', group: 'search', order: 10, title: '番号で探す',
      body: `
        <ul>
          <li><strong>部分一致</strong>：入力した文字を含むものを探します（例：「0012」で LOT-2026-00012 も見つかる）。</li>
          <li><strong>完全一致</strong>：入力した文字と同じものだけを探します。</li>
          <li>今の絞り込み（タグ）の中から探します。見つからないときは「絞り込みを外して探す」を押してください。</li>
          <li>大文字・小文字、全角・半角の違いは気にせず入力できます（全角の英数字は半角にそろえて探します）。</li>
          <li>入力を消す（× か <kbd>Esc</kbd>）と、一覧に戻ります。</li>
          <li>入力欄を選ぶと中身が全部選ばれるので、そのまま次の番号を打てます。<kbd>Esc</kbd> で消せます。</li>
          <li>入力欄では、前に探した番号が候補に出ます。</li>
        </ul>`,
    },
    {
      id: 'results', group: 'search', order: 20, title: '結果を見る・並べ替える',
      body: `
        <ul>
          <li>一覧の上に「何を・どう探したか」と件数が出ます。100 件を超えるとページに分かれ、右上の <span class="manual-icon">‹ ›</span> で移れます。</li>
          <li>見出しを押すと、その列で並べ替えます。もう一度押すと逆順になります。</li>
          <li>探した列は色が付き、一致した部分に印が付きます。</li>
          <li>一覧の下に、検索したデータの時点と、検索にかかった時間が出ます。</li>
        </ul>`,
    },
    {
      id: 'detail', group: 'search', order: 30, title: '詳細を見る・番号をコピーする',
      body: `
        <ul>
          <li>行を選ぶと右に詳細が出ます。設定したまとまりごとに並びます。見出しを押すと開閉でき、開き方は次回も保たれます。</li>
          <li>番号の横の <span class="manual-icon">⧉</span> でコピーできます。</li>
          <li>詳細は 1 件を特定する項目（標準は「ロット番号＋BOX番号」）で決めています。</li>
          <li><kbd>Esc</kbd> か右上の × で閉じます。</li>
        </ul>`,
    },
    {
      id: 'cache', group: 'data', order: 10, title: 'データの状態と更新',
      body: `
        <p>このツールは、共有データを手元に<strong>コピー（キャッシュ）</strong>してから検索します。共有データを直接書き換えることはありません。</p>
        <ul>
          <li>上部バー右の札で状態が分かります：<strong>最新</strong>／<strong>新しい更新があります</strong>／<strong>前回のデータを使用中</strong>／<strong>データなし</strong>。</li>
          <li>左の「データ」で、いつ時点のデータか・件数・前回の更新の結果を確かめられます。</li>
          <li>「データを更新する」で、コピー → 検証 → 入れ替え を行います。検証で問題が見つかったときは入れ替えず、前回のデータを使い続けます。</li>
        </ul>`,
    },
    {
      id: 'source', group: 'data', order: 15, title: '読み込み先を確かめる・変える',
      body: `
        <ol class="manual-steps">
          <li>左の「データ」→「読み込み先」に、今の共有データのパスが出ます。</li>
          <li><strong>接続を確かめる</strong>で、書き方 → 場所 → 読めるか → SQLite か → テーブルと列 → 件数 の順に ○ × が出ます。× の段階には「対応」が出ます。</li>
          <li><strong>変更</strong>を押し、エクスプローラーでファイルを Shift＋右クリック →「パスとしてコピー」して貼り付け、<kbd>Enter</kbd> で確かめます。</li>
          <li>すべて ○ なら「保存して更新」が押せます（もう一度 <kbd>Enter</kbd>）。保存すると、新しい読み込み先からデータを取り直します。</li>
        </ol>
        <p>確かめるだけなら、共有データには何も書き込みません。</p>`,
    },
    {
      id: 'columns', group: 'data', order: 20, title: '表示する列を選ぶ',
      body: `<p>左の「表示列」で、一覧に出す列を選べます。設定は自動で保存され、次に開いたときも同じになります。詳細にはいつもすべての項目が出ます。</p>`,
    },
    {
      id: 'samples', group: 'data', order: 30, title: 'サンプルデータで試す',
      body: `
        <p>index.html を直接開いたときは、左の「サンプル」から目的別のデータを読み込めます。読み込むと、そのデータに合った検索の例を実行します。</p>
        <ul>
          <li>基本の動き／入力の確認（日本語・記号、同じロット番号）／0 件・異常のとき／速さの確認</li>
          <li>「サンプルデータだけを消す」で片付けられます。消したあと 10 秒間は「元に戻す」で戻せます。</li>
        </ul>`,
    },
    {
      id: 'zero', group: 'trouble', order: 10, title: '0 件になったとき',
      body: `
        <ul>
          <li>番号の種類が合っているか確かめてください。0 件の画面から、ほかの種類で探し直せます。</li>
          <li>完全一致のときは「部分一致で探し直す」を試してください。</li>
          <li>上部バー右の札が「前回のデータを使用中」のときは、新しいデータがまだ入っていない可能性があります。</li>
        </ul>`,
    },
    {
      id: 'errors', group: 'trouble', order: 20, title: 'エラーが出たとき',
      body: `
        <ul>
          <li>メッセージに書かれた操作を試してください。</li>
          <li>続くときは、メッセージの<strong>問い合わせ番号</strong>を管理者に伝えてください。ログ（logs フォルダ）から原因を探せます。</li>
          <li>「検索サーバーに接続できません」と出たら、start.bat の黒いウィンドウが開いているか確かめてください。</li>
        </ul>`,
    },
    {
      id: 'keys', group: 'appendix', order: 10, title: 'キーボード操作',
      body: `
        <table class="manual-table">
          <tr><th>キー</th><th>動き</th></tr>
          <tr><td><kbd>/</kbd></td><td>入力欄へ移る</td></tr>
          <tr><td><kbd>Alt</kbd>+<kbd>1</kbd>〜<kbd>4</kbd></td><td>番号の種類を切り替える</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>検索する（日本語の変換中は除く）</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>入力を消す／詳細・パネル・説明書を閉じる</td></tr>
          <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>一覧で行を移る（一覧を選んでいるとき）</td></tr>
          <tr><td><kbd>F1</kbd></td><td>この説明書を開く・閉じる</td></tr>
        </table>`,
    },
  ].forEach((chapter) => chapters.register(chapter));

  DS.manual = { groups, chapters };
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
    watch: ['source'],
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
      const sourceEditor = DS.views.createSourceEditor(ctx);
      refreshButton.addEventListener('click', () => ctx.cache.refresh());

      container.append(
        summary,
        configBox,
        section('読み込み先', [sourceEditor.element]),
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
          sourceEditor.update(state);

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

