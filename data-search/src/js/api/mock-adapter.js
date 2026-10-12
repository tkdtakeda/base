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

      // 表示定義：config/sample の view・schema と python/tools/sample_columns.json から自動生成した js/sample/sample-view.js
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
          columnsVersion: DS.sampleView.columnsVersion,
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
