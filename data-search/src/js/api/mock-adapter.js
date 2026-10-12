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
