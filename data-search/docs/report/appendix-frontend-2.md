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
  const RECORD_KEY = 'mock:record'; // このモードで選んだ「固定列」（ブラウザにだけ保存する）
  const TYPES_KEY = 'mock:types';   // このモードで手動にした列の種類（ブラウザにだけ保存する）
  const KINDS = ['date', 'number', 'text'];
  const KEYWORD_MAX = 100;
  const RECORD_KEY_MAX = 3;
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
  const isBlank = (value) => value === null || value === undefined || String(value).trim() === '';
  const textOf = (value) => (isBlank(value) ? null : String(value));

  /**
   * 表示定義に、このモードで選んだ「固定列」を重ねる（Python 版の column_model と同じ決まり：
   * 固定列 → 探す列 を先頭に並べ、番号の列は text として扱う）
   */
  function viewWithRecord(base, record) {
    const view = JSON.parse(JSON.stringify(base));
    const ids = view.columns.map((column) => column.id);
    if (!record || !Array.isArray(record.recordKey) || !record.recordKey.length || !record.recordKey.every((id) => ids.includes(id))) return view;
    view.recordKey = record.recordKey.slice();
    view.searchColumn = ids.includes(record.searchColumn) ? record.searchColumn : record.recordKey[0];
    const lead = Array.from(new Set(view.recordKey.concat([view.searchColumn])));
    const byId = new Map(view.columns.map((column) => [column.id, column]));
    view.columns = lead.map((id) => Object.assign({}, byId.get(id), { role: true, kind: 'text' }))
      .concat(view.columns.filter((column) => !lead.includes(column.id)));
    view.columnsVersion = `${base.columnsVersion}-${lead.join('|')}`;
    view.ready = true;
    view.notices = [];
    return view;
  }

  /** 手動にした列の種類を重ねる（Python 版の column_model と同じく、手動が自動より優先） */
  function viewWithTypes(view, types) {
    const entries = Object.entries(types || {}).filter(([, kind]) => KINDS.includes(kind));
    if (!entries.length) return view;
    const manual = new Map(entries);
    view.columns = view.columns.map((column) => (manual.has(column.id)
      ? Object.assign({}, column, { kind: manual.get(column.id), manual: true })
      : column));
    view.columnsVersion = `${view.columnsVersion}-${entries.map(([id, kind]) => `${id}:${kind}`).join('|')}`;
    return view;
  }

  function currentView() {
    return viewWithTypes(viewWithRecord(DS.sampleView, DS.core.storage.read(RECORD_KEY, null)), DS.core.storage.read(TYPES_KEY, {}));
  }

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
    /** 絞り込みの列と種類を確かめる（どの列でも絞り込める。日付の列は日付の範囲、ほかは値から選ぶ） */
    function badFilter(filters) {
      return Object.entries(filters || {}).some(([fieldId, spec]) => {
        return !DS.domain.filters.allowed(DS.domain.fields.get(fieldId), spec);
      });
    }

    function filterRows(payload) {
      const keyword = DS.util.normalize(payload.keyword).toLowerCase();
      const searchField = DS.domain.searchField();
      const today = DS.domain.filters.todayIso();
      const filters = Object.entries(DS.domain.filters.compact(payload.filters));
      return rows.filter((row) => {
        if (keyword && searchField) {
          const value = String(row[searchField.id] == null ? '' : row[searchField.id]).toLowerCase();
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
      if (rows.length === 0) return fail('CACHE_UNAVAILABLE', '検索できるデータがまだありません。左の「サンプル」から読み込んでください。');
      if (badFilter(payload.filters)) return fail('INVALID_REQUEST', '検索の条件が正しくありません。');
      const page = Math.max(1, Number(payload.page) || 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(payload.pageSize) || PAGE_SIZE));
      const sortKey = DS.domain.fields.has(payload.sortKey) ? payload.sortKey : DS.domain.DEFAULT_SORT.key;
      const sortField = DS.domain.fields.get(sortKey);
      const direction = payload.sortOrder === 'desc' ? -1 : 1;
      const sortValue = (row) => (sortField.type === 'date' ? DS.domain.filters.normalizeDate(row[sortKey])
        : sortField.type === 'number' ? DS.domain.filters.toNumber(row[sortKey]) : row[sortKey]);
      const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

      const hits = filterRows(payload);
      hits.sort((a, b) => {
        const va = sortValue(a);
        const vb = sortValue(b);
        // 空欄は昇順・降順どちらでも最後。数値の列で数値として読めない値は、その手前
        const unreadable = (row, value) => sortField.type === 'number' && !isBlank(row[sortKey]) && value === null;
        return compare(isBlank(a[sortKey]), isBlank(b[sortKey])) ||
          compare(unreadable(a, va), unreadable(b, vb)) ||
          compare(va === null ? '' : va, vb === null ? '' : vb) * direction ||
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

      // 表示定義：config/sample の view・schema と python/tools/sample_columns.json から自動生成した js/sample/sample-view.js
      // ＋ このモードで選んだ「固定列」
      get_view_config: () => Object.assign({ success: true, recordSettingsFile: '（サンプルのモードではブラウザに保存）' }, currentView()),

      update_column_type(payload) {
        if (rows.length === 0) return fail('CACHE_UNAVAILABLE', '検索できるデータがまだありません。左の「サンプル」から読み込んでください。');
        const field = DS.domain.fields.get(payload.column);
        if (!field) return fail('INVALID_REQUEST', '種類を変える列が見つかりません。画面を読み込み直してください。');
        if (payload.kind !== 'auto' && !KINDS.includes(payload.kind)) return fail('INVALID_REQUEST', '種類は 自動・日付・数値・文字列 から選んでください。');
        const types = Object.assign({}, DS.core.storage.read(TYPES_KEY, {}));
        if (payload.kind === 'auto') delete types[field.id];
        else types[field.id] = payload.kind;
        const stored = DS.core.storage.write(TYPES_KEY, types);
        if (!stored.ok) return fail('SETTINGS_WRITE_FAILED', `保存できませんでした：${stored.reason}`);
        const kind = payload.kind === 'auto' ? field.autoKind : payload.kind;
        const label = DS.domain.KIND_LABELS[kind];
        return {
          success: true, saved: true, column: field.id, kind, manual: payload.kind !== 'auto', localFile: '（サンプルのモードではブラウザに保存）',
          message: `「${field.id}」の種類を${payload.kind === 'auto' ? `自動（${label}）` : label}にしました（サンプルのモードではブラウザにだけ保存します）。`,
        };
      },

      check_record_key(payload) {
        if (rows.length === 0) return fail('CACHE_UNAVAILABLE', '検索できるデータがまだありません。左の「サンプル」から読み込んでください。');
        const names = payload.recordKey;
        if (!Array.isArray(names) || names.length < 1 || names.length > RECORD_KEY_MAX || new Set(names).size !== names.length ||
          !names.every((id) => DS.domain.fields.has(id))) {
          return fail('INVALID_REQUEST', `固定列は、一覧にある列から重ならないように 1〜${RECORD_KEY_MAX} 個選んでください。`);
        }
        const groups = new Map();
        let blank = 0;
        rows.forEach((row) => {
          const values = names.map((id) => textOf(row[id]));
          if (values.every((value) => value === null)) blank += 1;
          const key = JSON.stringify(values);
          const entry = groups.get(key) || { values, count: 0 };
          entry.count += 1;
          groups.set(key, entry);
        });
        const duplicated = Array.from(groups.values()).filter((entry) => entry.count > 1).sort((a, b) => b.count - a.count);
        const top = duplicated[0];
        return {
          success: true,
          recordKey: names,
          rowCount: rows.length,
          duplicateGroups: duplicated.length,
          duplicateRows: duplicated.reduce((sum, entry) => sum + entry.count, 0),
          blankRows: blank,
          unique: duplicated.length === 0,
          example: top ? { values: Object.fromEntries(names.map((id, index) => [id, top.values[index]])), count: top.count } : null,
        };
      },

      update_record_settings(payload) {
        const checked = commands.check_record_key(payload);
        if (!checked.success) return checked;
        const searchColumn = payload.searchColumn;
        if (searchColumn != null && !DS.domain.fields.has(searchColumn)) return fail('INVALID_REQUEST', '番号で探す列は、一覧にある列から選んでください。');
        const stored = DS.core.storage.write(RECORD_KEY, { recordKey: payload.recordKey.slice(), searchColumn: searchColumn || null });
        if (!stored.ok) return fail('SETTINGS_WRITE_FAILED', `保存できませんでした：${stored.reason}`);
        return {
          success: true, saved: true, recordKey: payload.recordKey.slice(), searchColumn: searchColumn || payload.recordKey[0],
          localFile: '（サンプルのモードではブラウザに保存）', message: '固定列を保存しました（サンプルのモードではブラウザにだけ保存します）。',
        };
      },

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
          columnsVersion: currentView().columnsVersion,
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
        if (!field || !field.filters.includes('values')) return fail('INVALID_REQUEST', '検索の条件が正しくありません。');
        if (rows.length === 0) return fail('CACHE_UNAVAILABLE', '検索できるデータがまだありません。左の「サンプル」から読み込んでください。');
        if (badFilter(payload.filters)) return fail('INVALID_REQUEST', '検索の条件が正しくありません。');
        // match：その文字を含む値だけ（大文字小文字・全角半角を区別しない）
        const match = payload.match ? DS.util.normalize(payload.match).toLowerCase() : '';
        const others = Object.assign({}, payload.filters || {});
        delete others[field.id];
        const counts = new Map();
        filterRows(Object.assign({}, payload, { filters: others })).forEach((row) => {
          const value = textOf(row[field.id]);
          if (match && (value === null || !value.toLowerCase().includes(match))) return;
          counts.set(value, (counts.get(value) || 0) + 1);
        });
        const values = Array.from(counts, ([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
        return { success: true, field: field.id, values: values.slice(0, VALUE_LIST_LIMIT), truncated: values.length > VALUE_LIST_LIMIT, match: match || null };
      },

      get_lot_detail(payload) {
        if (!DS.domain.isReady()) return fail('KEY_NOT_READY', '固定列（レコードキー）が決まっていません。画面左の「データ」→「固定列」で選んでください。');
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

  /** 列の表示の既定：設定（view の hiddenColumns）で隠すとした列だけ隠す */
  function defaultColumns() {
    return { hidden: DS.domain.defaultHiddenColumns(), widths: {}, density: 'compact' };
  }

  /** 保存した列の設定を読み直す。以前の形（別名）は DB の列名に読み替え、知らない列（DB から消えた列）は捨てる。新しく増えた列は表示する */
  function restoreColumns(prefs) {
    const base = defaultColumns();
    if (!Array.isArray(prefs.hiddenColumns)) return base;
    const known = (id) => DS.domain.fields.has(id);
    const migrate = DS.domain.migrateId;
    const widths = {};
    Object.entries(prefs.columnWidths || {}).forEach(([id, width]) => { if (known(migrate(id)) && Number(width) > 0) widths[migrate(id)] = Number(width); });
    return {
      hidden: Array.from(new Set(prefs.hiddenColumns.map(migrate).filter(known))),
      widths,
      density: prefs.density === 'comfortable' ? 'comfortable' : 'compact',
    };
  }

  function createInitialState(mode) {
    const prefs = DS.core.storage.read(PREFS_KEY, {});
    return {
      mode,
      appInfo: null,
      cache: { status: null, refreshing: false, refreshStartedAt: null },
      source: { path: null, editable: false, localFile: '', loaded: false, loadError: null, status: 'idle', result: null, testedPath: null },
      query: {
        keyword: '',
        matchMode: prefs.matchMode === 'exact' ? 'exact' : 'partial',
      },
      sort: Object.assign({}, DS.domain.DEFAULT_SORT),
      filters: {},
      tags: { items: DS.controllers.loadTags(), activeId: null },
      search: { status: 'idle', result: null, request: null, error: null },
      selection: { key: null, item: null, status: 'idle', error: null, duplicated: false, open: false },
      record: { status: 'idle', result: null, checked: null },
      ui: { panel: null },
      columns: restoreColumns(prefs),
      history: migrateHistory(prefs.history || {}),
      samplesVersion: 0,
    };
  }

  /** 保存したい部分が変わったときだけ書き込む */
  function attachPrefsPersistence(store, bus) {
    const WATCHED = ['query', 'columns', 'history'];
    bus.on('state', ({ state, changed }) => {
      if (!changed.some((key) => WATCHED.includes(key))) return;
      const result = DS.core.storage.write(PREFS_KEY, {
        matchMode: state.query.matchMode,
        hiddenColumns: state.columns.hidden,
        columnWidths: state.columns.widths,
        density: state.columns.density,
        history: state.history,
      });
      if (!result.ok) bus.emit('prefs:failed', result.reason);
    });
  }

  /** 前に探した番号は「探した列（DB の列名）」ごとに持つ。以前の形（別名）で保存したものは読み替える */
  function migrateHistory(history) {
    const result = {};
    Object.entries(history).forEach(([id, list]) => {
      if (!Array.isArray(list)) return;
      const key = DS.domain.migrateId(id);
      result[key] = Array.from(new Set((result[key] || []).concat(list))).slice(0, HISTORY_MAX);
    });
    return result;
  }

  function pushHistory(history, columnId, keyword) {
    const list = (history[columnId] || []).filter((item) => item !== keyword);
    list.unshift(keyword);
    return Object.assign({}, history, { [columnId]: list.slice(0, HISTORY_MAX) });
  }

  DS.controllers.createInitialState = createInitialState;
  DS.controllers.attachPrefsPersistence = attachPrefsPersistence;
  DS.controllers.defaultColumns = defaultColumns;
  DS.controllers.pushHistory = pushHistory;
})();
```

`src/js/controllers/data-controller.js`

```javascript
/* =========================================================
   データ（キャッシュ）の状態と更新、サンプルデータの読み込み・削除
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  // ── キャッシュ ─────────────────────────────────────────
  function createCacheController({ store, api, toast, search }) {
    // データの更新で DB の列が増えた・減ったときは、表示定義から組み立て直すため画面を読み込み直す
    // （選んだ列・幅・タグ・検索の種類はブラウザに保存してあるので残る）
    let reloading = false;
    function reloadIfColumnsChanged(status) {
      const current = DS.domain.columnsVersion();
      if (reloading || !status.columnsVersion || !current || status.columnsVersion === current) return;
      reloading = true;
      toast.show({ tone: 'info', message: 'データの列が変わったため、画面を読み込み直します', timeout: 2000 });
      window.setTimeout(() => window.location.reload(), 1500);
    }

    async function loadStatus() {
      try {
        const status = await api.call('get_cache_status');
        store.merge('cache', { status });
        reloadIfColumnsChanged(status);
        return status;
      } catch (error) {
        store.merge('cache', { status: { available: false, message: error.userMessage, lastRefreshSucceeded: false } });
        return null;
      }
    }

    async function refresh() {
      if (store.get().cache.refreshing) return;
      store.merge('cache', { refreshing: true, refreshStartedAt: Date.now() });
      try {
        const result = await api.call('refresh_cache');
        toast.show({
          tone: 'success',
          message: `データを更新しました（${DS.util.formatNumber(result.rowCount)} 件）`,
        });
        await loadStatus();
        search.rerun();
      } catch (error) {
        toast.show({ tone: 'warning', message: error.userMessage, detailId: error.detailId });
        await loadStatus();
      } finally {
        store.merge('cache', { refreshing: false, refreshStartedAt: null });
      }
    }

    return { loadStatus, refresh };
  }

  // ── サンプルデータ（画面だけで試すモード） ─────────────────
  function createSampleController({ store, api, toast, search, cache }) {
    const samples = api.adapter.samples;
    const available = Boolean(samples);

    async function afterChange(demoQuery) {
      await cache.loadStatus();
      if (demoQuery) search.setQuery(demoQuery);
      await search.run({ page: 1 });
    }

    async function load(id) {
      if (!available) return;
      const pattern = DS.sample.patterns.get(id);
      const result = samples.load(id);
      if (!result.ok) {
        toast.show({ tone: 'danger', message: result.reason });
        return;
      }
      toast.show({
        tone: 'success',
        message: `「${pattern.title}」を読み込みました（全 ${DS.util.formatNumber(result.total)} 件）`,
      });
      if (result.warning) toast.show({ tone: 'warning', message: `次回は読み込み直しが必要です：${result.warning}` });
      store.set({ samplesVersion: Date.now() });
      await afterChange(pattern.demoQuery);
    }

    /** サンプルだけを消す。確認ダイアログではなく「元に戻す」を用意する */
    async function clear() {
      if (!available) return;
      const { snapshot, removed } = samples.clear();
      store.set({ samplesVersion: Date.now() });
      search.clearSelection();
      store.set({ search: { status: 'idle', result: null, request: null, error: null } });
      await afterChange(null);
      toast.show({
        tone: 'info',
        message: `サンプルデータ ${DS.util.formatNumber(removed)} 件を消しました`,
        actionLabel: '元に戻す',
        timeout: 10000,
        onAction: async () => {
          samples.restore(snapshot);
          store.set({ samplesVersion: Date.now() });
          await afterChange(null);
          toast.show({ tone: 'success', message: 'サンプルデータを元に戻しました' });
        },
      });
    }

    return { available, load, clear, loadedIds: () => (available ? samples.loadedIds() : []), countOf: (id) => (available ? samples.countOf(id) : 0) };
  }

  DS.controllers.createCacheController = createCacheController;
  DS.controllers.createSampleController = createSampleController;
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
      const field = DS.domain.searchField();
      // 固定列が DB にない：番号を入れていなければ、選び直すよう案内する（探す列があれば番号では探せる）
      const keyMissing = Boolean(cacheStatus && cacheStatus.available && !DS.domain.isReady());
      if (keyMissing && (!field || !keywordOf())) {
        return { ok: false, reason: '固定列が DB にありません。左の「データ」で選んでください', action: 'choose-key', actionLabel: '固定列を選ぶ' };
      }
      const searching = state.search.request && state.search.request.keyword;
      if (!keywordOf()) {
        // 番号で探している途中に入力を空にしたら、番号の検索を外して一覧に戻せる
        if (searching) return { ok: true, label: '一覧に戻す', icon: 'fa-list' };
        return { ok: false, quiet: true, reason: field ? `${field.listLabel}を入れると、一覧の中から探せます` : '' };
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
      // 探す列は設定で決まる（schema.searchColumn）。画面からは送らない
      if (keyword && DS.domain.searchField()) Object.assign(request, { keyword, matchMode: state.query.matchMode });
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
        if (request.keyword) patch.history = DS.controllers.pushHistory(store.get().history, DS.domain.searchField().id, result.keyword || request.keyword);
        store.set(patch);
        bus.emit('search:done', result);
        // 選んでいた行が結果に残っていなければ、選択を外して詳細を閉じる
        const selectedKey = store.get().selection.key;
        if (selectedKey && !result.items.some((item) => DS.domain.recordKey(item) === selectedKey)) clearSelection();
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

    // ── 選択と詳細 ──
    // 行を 1 回押す／↑↓ … 行を選ぶだけ（全項目が一覧に出ているため、表を狭くしない）
    // ダブルクリック／Enter … 詳細を開く。開いている間は、選んだ行に合わせて詳細も切り替える
    const EMPTY_SELECTION = { key: null, item: null, status: 'idle', error: null, duplicated: false, open: false };

    function highlight(item) {
      if (store.get().selection.open) return select(item);
      detailToken += 1;
      store.set({ selection: Object.assign({}, EMPTY_SELECTION, { key: DS.domain.recordKey(item), item }) });
      return Promise.resolve();
    }

    async function select(item) {
      const key = DS.domain.recordKey(item);
      if (!DS.domain.isReady()) {
        // 固定列がないと、詳細の 1 件を決められない
        store.set({ selection: Object.assign({}, EMPTY_SELECTION, { key, item }) });
        toast.show({ tone: 'warning', message: '詳細を開くには、左の「データ」で固定列を選んでください', actionLabel: '選ぶ', onAction: () => bus.emit('record:choose') });
        return;
      }
      const token = ++detailToken;
      // 一覧の値ですぐに表示し（0.4 秒以内の反応）、最新の詳細で置き換える
      store.set({ selection: { key, item, status: 'loading', error: null, duplicated: false, open: true } });
      const payload = {};
      DS.domain.keyFields().forEach((field) => { payload[field.id] = item[field.id] == null ? null : item[field.id]; });
      try {
        const result = await api.call('get_lot_detail', payload);
        if (token !== detailToken) return;
        store.set({ selection: { key, item: result.item, status: 'done', error: null, duplicated: Boolean(result.duplicated), open: true } });
      } catch (error) {
        if (token !== detailToken) return;
        store.set({ selection: { key, item, status: 'error', error, duplicated: false, open: true } });
      }
    }

    /** 詳細を閉じる（行の選択は残す） */
    function closeDetail() {
      detailToken += 1;
      store.set({ selection: Object.assign({}, store.get().selection, { open: false, status: 'idle' }) });
    }

    function clearSelection() {
      detailToken += 1;
      store.set({ selection: Object.assign({}, EMPTY_SELECTION) });
    }

    return {
      readiness, run, setQuery, clearKeyword, setFilter, setFilters, clearFilter,
      toggleSort, goToPage, rerun, highlight, select, closeDetail, clearSelection,
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
     save(path)    接続テストで × がない値だけ保存できる → config.local.json に保存 → データを更新
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

    /** 確かめた値と同じで、× がない（ok）ときだけ保存できる */
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
   列の登録簿。中身はソースコードに書かず、表示定義（get_view_config）から組み立てる。

     columns      … DB のテーブルの全列。id も見出しも DB の列名
                    並び：固定列 → 番号で探す列 → 別名のある列 → ほかの列（DB の順）
                    kind：date（日付）／ number（数値）／ text（文字列）。autoKind：自動にしたときの種類、manual：手動で決めたか
                    使える絞り込みは種類で決まる（KIND_FILTERS。先頭が既定）
     recordKey    … 固定列（一覧の左端に固定）。DB に足りなければ空（ready=false）
     searchColumn … 番号で探す列（上部バーの入力欄）
     aliases      … 別名（論理名）→ DB の列名。以前の形（論理名）で保存したタグ・表示の設定を読み替える
     hiddenColumns… 最初は隠しておく列。各自が「表示列」で変えられる
     notices      … 設定と DB の食い違い（「データ」パネルに出す）

   表示定義の出どころ
     Python 版・デスクトップ版 … get_view_config 命令（設定 ＋ キャッシュのテーブルの列）
     画面だけで試すモード     … js/sample/sample-view.js（公開サンプルとダミーの列一覧から自動生成）
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.domain = DS.domain || {};

  const SECTIONS = [
    { id: 'role', label: '主な項目', icon: 'fa-key' },
    { id: 'other', label: 'そのほかの項目', icon: 'fa-table-columns' },
  ];

  // 種類 → 使える絞り込み（先頭が既定）。Python 版の lot_service.FILTERS_BY_KIND と同じ
  const KIND_FILTERS = {
    date: ['date'],
    number: ['number', 'values'],
    text: ['values', 'text'],
  };
  const KIND_LABELS = { date: '日付', number: '数値', text: '文字列' };

  let lists = { list: [], key: [], search: null, sections: [], hidden: [] };
  let meta = { version: null, aliases: {}, notices: [], ready: false, settingsFile: '' };

  /** 表示定義を当てはめる。起動時に 1 回、画面の部品を作る前に呼ぶ */
  function applyView(view) {
    const fields = DS.core.createRegistry('fields');
    const options = view.fields || {};
    const recordKey = view.recordKey || [];
    const hiddenNames = new Set(view.hiddenColumns || []);

    (view.columns || []).forEach((column, index) => {
      const option = options[column.id] || {};
      const searchable = column.id === view.searchColumn;
      const key = recordKey.includes(column.id);
      const kind = KIND_FILTERS[column.kind] ? column.kind : 'text';
      fields.register({
        id: column.id,
        order: (index + 1) * 10,
        // 表示名は DB の列名。詳細・一覧の見出し・絞り込みのすべてで同じ
        label: column.label || column.id,
        listLabel: column.label || column.id,
        role: Boolean(column.role),
        // 番号の列（探す列・固定列）は、指定がなければ等幅で表示し、コピーできるようにする（0 と O を見分けやすく、転記しやすく）
        mono: option.mono === undefined ? searchable || key : Boolean(option.mono),
        copy: option.copy === undefined ? searchable || key : Boolean(option.copy),
        example: option.example || '',
        badge: (option.badge || []).map((rule) => ({ pattern: new RegExp(rule.match), tone: rule.tone })),
        type: kind,
        autoKind: KIND_FILTERS[column.autoKind] ? column.autoKind : kind,
        manual: Boolean(column.manual),
        // どの列でも絞り込める。使える絞り込みは種類で決まる（filter は既定）
        filters: KIND_FILTERS[kind].slice(),
        filter: KIND_FILTERS[kind][0],
        searchable,
        key,
      });
    });

    const all = fields.list();
    lists = {
      list: all,
      key: recordKey.map((id) => fields.get(id)).filter(Boolean),
      search: fields.get(view.searchColumn) || null,
      // 詳細は全項目。役割のある列を先にまとめる
      sections: SECTIONS.map((group) => ({ group, fields: all.filter((field) => (group.id === 'role') === field.role) }))
        .filter((section) => section.fields.length),
      hidden: all.filter((field) => hiddenNames.has(field.id)).map((field) => field.id),
    };
    meta = {
      version: view.columnsVersion || null,
      aliases: view.aliases || {},
      notices: view.notices || [],
      ready: Boolean(view.ready),
      settingsFile: view.recordSettingsFile || '',
    };

    DS.domain.fields = fields;
    const sort = view.defaultSort || {};
    DS.domain.DEFAULT_SORT = { key: sort.field || (all[0] && all[0].id) || null, order: sort.order === 'desc' ? 'desc' : 'asc' };
  }

  /** 以前の形（別名＝論理名）で保存した列の名前を、今の列の id（DB の列名）に読み替える。知らない名前はそのまま */
  function migrateId(id) {
    if (DS.domain.fields && DS.domain.fields.has(id)) return id;
    return Object.prototype.hasOwnProperty.call(meta.aliases, id) ? meta.aliases[id] : id;
  }

  DS.domain.applyView = applyView;
  DS.domain.KIND_LABELS = KIND_LABELS;
  DS.domain.migrateId = migrateId;
  DS.domain.listFields = () => lists.list;
  DS.domain.detailFields = () => lists.list;
  DS.domain.detailSections = () => lists.sections;
  /** 番号で探す列（決まっていなければ null） */
  DS.domain.searchField = () => lists.search;
  DS.domain.keyFields = () => lists.key;
  /** 絞り込める列（全列） */
  DS.domain.filterFields = () => lists.list;
  /** 設定で「最初は隠す」とした列の id */
  DS.domain.defaultHiddenColumns = () => lists.hidden.slice();
  /** 列の並びの印（データの更新や固定列の変更で、列の決まりが変わったかを見分ける） */
  DS.domain.columnsVersion = () => meta.version;
  /** 固定列がそろっているか（そろっていなければ詳細は開けない） */
  DS.domain.isReady = () => meta.ready && lists.key.length > 0;
  /** 設定と DB の食い違い [{ path, reason, action }] */
  DS.domain.columnNotices = () => meta.notices.slice();
  /** 固定列の保存先（画面に出すファイル名） */
  DS.domain.recordSettingsFile = () => meta.settingsFile;

  /** 1 件を特定する鍵（例：ロット番号＋BOX番号）を文字列にする。鍵が決まっていなければ行の中身全体 */
  DS.domain.recordKey = (item) => {
    const fields = lists.key.length ? lists.key : lists.list;
    return fields.map((field) => (item[field.id] == null ? '' : item[field.id])).join('\u001f');
  };
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
          <li>一覧には<strong>全列</strong>が DB の列名のまま出ます。左端のロット番号・BOX番号は横に動かしても残ります。</li>
          <li>行を押すと選び、<strong>ダブルクリック</strong>か <kbd>Enter</kbd> で右に<strong>詳細</strong>が出ます。<kbd>↑</kbd><kbd>↓</kbd> で行を移れます。</li>
          <li>番号が分かっているときは、上部バーに入れて <kbd>Enter</kbd>。今の絞り込みの中から探します。</li>
          <li>ほかの列の値で探すときは、一覧の見出しの<strong>漏斗（じょうご）</strong>のアイコンから絞り込みます。どの列でも使えます。</li>
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
      id: 'filters', group: 'search', order: 5, title: '絞り込む（どの列でも）',
      body: `
        <ul>
          <li>一覧の見出しの右にある<strong>漏斗（じょうご）</strong><span class="manual-icon">▼</span>を押すと、その列の絞り込みが列の真下に開きます（<kbd>Enter</kbd> でも開きます）。</li>
          <li>列の<strong>種類</strong>（日付・数値・文字列）で、使える絞り込みが決まります。種類は値から自動で決まり、小窓の上の「種類」で手動でも選べます（手動にすると「手動」の印。「自動」で戻せます。変えると画面を読み込み直します）。</li>
          <li><strong>値から選ぶ</strong>（文字列・数値）：値にチェックを付けるとすぐ一覧に反映されます。値の横の数は、ほかの条件を当てはめたときの件数です。値が多い列は、上の欄に打つとデータ全体から探します（<kbd>Enter</kbd> で値の一覧へ移り、<kbd>Space</kbd> で選べます）。</li>
          <li><strong>条件で絞る</strong>（文字列）：文字を入れ、「含む・で始まる・で終わる・含まない・で始まらない・で終わらない」から選びます。「記号・空白を無視する」が ON だと、<code>LOT2026-0012</code> と <code>LOT-2026-00012</code> を同じとみなします。「含む・含まない」は空白で区切ると複数の語で探せます（含む＝すべての語、含まない＝どの語も）。</li>
          <li><strong>範囲</strong>（数値）：「○以上」「○以下」を入れて <kbd>Enter</kbd>（片方だけでもよい）。数値として読めない値は入りません。</li>
          <li><strong>日付の範囲</strong>（日付）：「今日より前」「今日〜7 日後」などから選べます。「範囲を自分で決める」で日数や日付そのものも指定できます。</li>
          <li>1 つの列で有効な絞り込みは 1 つです（タブを切り替えて選ぶと入れ替わります）。有効なタブには青い点が付きます。</li>
          <li>列どうしは「かつ」、同じ列の中は「または」で絞り込みます。（空欄）も選べます。</li>
          <li>絞り込み中の列は、見出しの色が変わり、漏斗が青く塗りつぶされます。<kbd>Esc</kbd> か小窓の外を押すと閉じます。</li>
          <li>今かかっている条件は一覧の上に札で出ます。札を押すとその条件を直せ、× で外せます。</li>
          <li>左の <span class="manual-icon">▼</span>「絞り込み」では、今の条件をまとめて見たり、すべて解除したりできます。隠している列にも「条件を足す」から絞り込めます。</li>
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
          <li>上部バーの入力欄で探す列は 1 つです（入力欄の左に列名が出ます）。列名を押すと、探す列を変えられます。</li>
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
          <li>行をダブルクリック（または選んで <kbd>Enter</kbd>）すると右に詳細が出ます。「主な項目」「そのほかの項目」に分けて全項目が並びます。見出しを押すと開閉でき、開き方は次回も保たれます。</li>
          <li>詳細を開いたまま <kbd>↑</kbd><kbd>↓</kbd> で行を移ると、詳細も切り替わります。</li>
          <li>番号の横の <span class="manual-icon">⧉</span> でコピーできます。</li>
          <li>詳細は「固定列」（標準は「ロット番号＋BOX番号」）で決めています。左の「データ」で変えられます。</li>
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
          <li><strong>接続を確かめる</strong>で、書き方 → 場所 → 読めるか → SQLite か → テーブルと列 → 件数 の順に ○ △ × が出ます。× の段階には「対応」が出ます。</li>
          <li><strong>変更</strong>を押し、エクスプローラーでファイルを Shift＋右クリック →「パスとしてコピー」して貼り付け、<kbd>Enter</kbd> で確かめます。</li>
          <li>× がなければ「保存して更新」が押せます（もう一度 <kbd>Enter</kbd>）。保存すると、新しい読み込み先からデータを取り直します。</li>
          <li>△（固定列がない）は、保存したあと「固定列」で選び直せば使えます。</li>
        </ol>
        <p>確かめるだけなら、共有データには何も書き込みません。</p>`,
    },
    {
      id: 'record-key', group: 'data', order: 17, title: '固定列（レコードキー）・探す列を選ぶ',
      body: `
        <p>固定列（レコードキー）は、行を 1 件に決める列です。一覧の左端に固定され、見出しに鍵のアイコンが付きます。使わない列（例：BOX番号）を外したいときや、似た構成の別の DB で列名が違うときは、画面で選び直すだけで使えます（設定ファイルを手で直す必要はありません）。</p>
        <ol class="manual-steps">
          <li>一覧の左端の見出しにある鍵のアイコン（または左の「データ」→「固定列」）から、<strong>変更</strong>を押します。</li>
          <li>行を 1 件に決める列を 1〜3 つ、列名で入れます（候補から選べます。<kbd>Enter</kbd> で次の欄へ）。ふつうは「ロット番号＋BOX番号」のように 2 つです。</li>
          <li>「番号で探す列」は上部バーの入力欄で探す列です。空欄なら 1 つ目の列で探します。</li>
          <li><strong>確かめる</strong>で、その組み合わせで 1 件に決まるかを数えます。同じ組み合わせがあれば △ で例を出します（保存はできます）。</li>
          <li><strong>保存</strong>すると画面を読み込み直し、選んだ列が一覧の左端に固定されます。</li>
        </ol>
        <p>固定列が DB にないときは、右上の青いボタンが「固定列を選ぶ」に変わります。</p>`,
    },
    {
      id: 'columns', group: 'data', order: 20, title: '表示する列を選ぶ',
      body: `
        <ul>
          <li>左の「表示列」で、一覧に出す列を選べます。列名で探して絞り込み、「すべて表示」「すべて隠す」「既定に戻す」も使えます。</li>
          <li>一覧の上の「列を探す」に列名の一部を入れて <kbd>Enter</kbd> で、その列まで移動して光ります。</li>
          <li>見出しの右端をドラッグで幅を変えられます（ダブルクリックで元に戻す）。長い値はマウスを乗せると全文が出ます。</li>
          <li>選んだ列・幅・行の高さは自動で保存され、次に開いたときも同じになります。詳細にはいつもすべての項目が出ます。</li>
        </ul>`,
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
          <li>探す列が合っているか確かめてください。0 件の画面の「探す列を変える」から変えられます。ほかの列の値で探すときは、見出しの漏斗から絞り込めます。</li>
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
          <tr><td><kbd>Enter</kbd></td><td>検索する（日本語の変換中は除く）</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>入力を消す／絞り込みの小窓・詳細・パネル・説明書を閉じる</td></tr>
          <tr><td><kbd>Tab</kbd> → <kbd>Enter</kbd></td><td>見出しの漏斗に移って、その列の絞り込みを開く</td></tr>
          <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>一覧で行を移る（一覧を選んでいるとき）</td></tr>
          <tr><td><kbd>F1</kbd></td><td>この説明書を開く・閉じる</td></tr>
        </table>`,
    },
  ].forEach((chapter) => chapters.register(chapter));

  DS.manual = { groups, chapters };
})();
```

`src/js/panels/columns-panel.js`

```javascript
/* =========================================================
   脇のパネル「表示列」：一覧に出す列を選ぶ

   ・列は全部で数十列になるため、列名で探して絞り込める
   ・「すべて表示」「すべて隠す」「既定に戻す」（既定＝設定の hiddenColumns だけ隠す）
   ・固定列（左端に固定）は隠せない
   ・選んだ内容はブラウザに自動保存
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  function section(titleText, children) {
    return el('section', { className: 'pane-section' }, [el('h3', { className: 'pane-section__title', text: titleText })].concat(children));
  }

  function button(iconName, text) {
    return el('button', { type: 'button', className: 'btn btn--secondary btn--sm' }, [icon(iconName, ''), el('span', { text })]);
  }

  DS.panels.register({
    id: 'columns',
    order: 20,
    icon: 'fa-table-columns',
    label: '表示列',
    title: '一覧に表示する列',
    badge(state) {
      const hidden = state.columns.hidden.length;
      return hidden > 0 ? { tone: 'info', text: String(hidden), title: `${hidden} 列を隠しています` } : null;
    },
    mount(container, ctx) {
      const { store } = ctx;
      const checks = new Map();
      const finder = el('input', { type: 'search', className: 'input input--sm', placeholder: '列名で探す', 'aria-label': '列名で探す' });
      const count = el('p', { className: 'pane-note columns-panel__count', 'aria-live': 'polite' });
      const showAll = button('fa-eye', 'すべて表示');
      const hideAll = button('fa-eye-slash', 'すべて隠す');
      const reset = button('fa-arrow-rotate-left', '既定に戻す');
      const noMatch = el('p', { className: 'pane-note', hidden: true, text: '当てはまる列はありません。' });

      const sections = DS.domain.detailSections().map(({ group, fields }) => {
        const items = fields.map((field) => {
          const box = el('input', { type: 'checkbox', value: field.id, disabled: field.key });
          box.addEventListener('change', () => toggle(field.id, box.checked, box.parentElement));
          checks.set(field.id, box);
          return el('label', { className: 'check', title: field.key ? '固定列のため、いつも表示します' : field.label, dataset: { name: DS.util.foldForCompare(field.label) } },
            [box, el('span', { className: 'check__text', text: field.label }), field.key ? icon('fa-key', '鍵') : null]);
        });
        return section(group.label, [el('div', { className: 'check-list' }, items)]);
      });

      DS.util.selectAllOnFocus(container);
      container.append(
        el('p', { className: 'pane-note', text: 'チェックを外した列は一覧から隠れます（詳細にはすべて出ます）。選んだ内容は自動で保存されます。' }),
        finder,
        el('div', { className: 'source__actions' }, [showAll, hideAll, reset]),
        count,
        noMatch,
        ...sections,
      );

      const setHidden = (hidden) => store.merge('columns', { hidden });
      const hideable = () => DS.domain.listFields().filter((field) => !field.key).map((field) => field.id);
      // 絞り込み中は、見えている列だけを対象にする
      const shownIds = () => hideable().filter((id) => !checks.get(id).parentElement.hidden);

      function toggle(id, checked, row) {
        const hidden = new Set(store.get().columns.hidden);
        if (checked) hidden.delete(id);
        else hidden.add(id);
        setHidden(DS.domain.listFields().map((field) => field.id).filter((x) => hidden.has(x)));
        DS.util.flash(row);
      }

      showAll.addEventListener('click', () => {
        const targets = new Set(shownIds());
        setHidden(store.get().columns.hidden.filter((id) => !targets.has(id)));
        DS.util.flash(count);
      });
      hideAll.addEventListener('click', () => {
        const hidden = new Set(store.get().columns.hidden.concat(shownIds()));
        setHidden(DS.domain.listFields().map((field) => field.id).filter((id) => hidden.has(id)));
        DS.util.flash(count);
      });
      reset.addEventListener('click', () => {
        setHidden(DS.controllers.defaultColumns().hidden);
        DS.util.flash(count);
      });

      finder.addEventListener('input', () => {
        const needle = DS.util.foldForCompare(finder.value);
        let shown = 0;
        checks.forEach((box) => {
          const row = box.parentElement;
          row.hidden = Boolean(needle) && !row.dataset.name.includes(needle);
          if (!row.hidden) shown += 1;
        });
        sections.forEach((node) => { node.hidden = Array.from(node.querySelectorAll('.check')).every((row) => row.hidden); });
        noMatch.hidden = shown > 0;
        const label = needle ? '（探している列）' : '';
        showAll.lastChild.textContent = `すべて表示${label}`;
        hideAll.lastChild.textContent = `すべて隠す${label}`;
      });

      return {
        update(state) {
          const hidden = new Set(state.columns.hidden);
          checks.forEach((box, id) => { box.checked = !hidden.has(id); });
          const total = DS.domain.listFields().length;
          count.textContent = `表示 ${total - hidden.size} ／ ${total} 列`;
        },
      };
    },
  });
})();
```

`src/js/panels/panels.js`

```javascript
/* =========================================================
   脇のパネル（データ・サンプル）。表示列は columns-panel.js
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
    watch: ['source', 'record'],
    badge(state) {
      const view = DS.views.describeCache(state.cache);
      if (view.tone === 'warning' || view.tone === 'danger') return { tone: view.tone, text: '!', title: view.text };
      if (state.cache.status && state.cache.status.available && !DS.domain.isReady()) {
        return { tone: 'danger', text: '!', title: '固定列（レコードキー）を選んでください' };
      }
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
      const keyEditor = DS.views.createRecordKeyEditor(ctx);
      const keySection = section('固定列（レコードキー）', [keyEditor.element]);
      refreshButton.addEventListener('click', () => ctx.cache.refresh());
      ctx.bus.on('record:edit', () => window.setTimeout(() => keyEditor.startEditing(), 0));

      container.append(
        summary,
        configBox,
        section('読み込み先', [sourceEditor.element]),
        keySection,
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
          keyEditor.update(state);
          keySection.classList.toggle('is-alert', Boolean(status.available) && !DS.domain.isReady());

          // 設定の注意（ローカルの設定にある未知のキー・DB にない列など）は、ファイル名と項目を出す
          const warnings = (status.settingsWarnings || []).map((w) => ({ where: `${w.file} ／ ${w.path}`, reason: w.reason, action: w.action }))
            .concat(status.available ? DS.domain.columnNotices().map((n) => ({ where: n.path, reason: n.reason, action: n.action })) : []);
          configBox.hidden = warnings.length === 0;
          configBox.replaceChildren(...(warnings.length ? [section('設定の注意', warnings.map((w) =>
            el('div', { className: 'config-help__item' }, [
              el('p', { className: 'config-help__where mono', text: w.where }),
              el('p', { className: 'pane-note', text: w.reason }),
              el('p', { className: 'pane-note', text: `対応：${w.action}` }),
            ])))] : []));
        },
      };
    },
  });

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

