/* =========================================================
   画面だけで試すモード（index.html を直接開いたとき）のアダプター。
   本物と同じ命令名・同じ入出力で、サンプルデータを検索する。
   入力の検証や検索の決まり（全角→半角、大文字小文字を区別しない、など）は Python 版にそろえる。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const STORAGE_KEY = 'mock:samples';
  const SEARCHABLE = ['lotNo', 'inspectionNo', 'castingNo', 'orderNo'];
  const KEYWORD_MAX = 100;
  const PAGE_SIZE = 100;
  const MAX_PAGE_SIZE = 500;
  const LATENCY_MS = 60;
  const REFRESH_MS = 1400;

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

    // ── 命令 ──
    const commands = {
      get_application_info: () => ({ id: 'data-search', name: 'Data Search', version: '0.1.0' }),

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
        const started = performance.now();
        if (!SEARCHABLE.includes(payload.searchType)) return fail('INVALID_REQUEST', '検索の条件が正しくありません。');
        const keyword = DS.util.normalize(payload.keyword);
        if (!keyword) return fail('INVALID_REQUEST', '検索する番号を入力してください。');
        if (keyword.length > KEYWORD_MAX) return fail('INVALID_REQUEST', `検索する番号は ${KEYWORD_MAX} 文字以内で入力してください。`);
        if (rows.length === 0) return fail('CACHE_UNAVAILABLE', '検索できるデータがまだありません。左の「サンプル」から読み込んでください。');
        const matchMode = payload.matchMode === 'exact' ? 'exact' : 'partial';
        const page = Math.max(1, Number(payload.page) || 1);
        const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(payload.pageSize) || PAGE_SIZE));
        const sortKey = DS.domain.fields.has(payload.sortKey) ? payload.sortKey : 'lotNo';
        const direction = payload.sortOrder === 'desc' ? -1 : 1;

        const needle = keyword.toLowerCase();
        const hits = rows.filter((row) => {
          const value = String(row[payload.searchType] == null ? '' : row[payload.searchType]).toLowerCase();
          return matchMode === 'exact' ? value === needle : value.includes(needle);
        });
        const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
        hits.sort((a, b) =>
          compare(a[sortKey] || '', b[sortKey] || '') * direction ||
          compare(a.lotNo, b.lotNo) ||
          compare(a.castingNo || '', b.castingNo || ''));
        const items = hits.slice((page - 1) * pageSize, page * pageSize).map((row) => Object.assign({}, row));
        return {
          success: true,
          count: items.length,
          totalCount: hits.length,
          page,
          pageSize,
          items,
          keyword,
          elapsedMs: Math.round((performance.now() - started) * 10) / 10,
        };
      },

      get_lot_detail(payload) {
        const found = rows.filter((row) => row.lotNo === payload.lotNo && (row.castingNo || null) === (payload.castingNo || null));
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
