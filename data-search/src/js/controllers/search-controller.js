/* =========================================================
   検索と詳細の操作。画面の部品はここを呼び、結果は状態（store）を通して受け取る。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createSearchController({ store, bus, api, toast }) {
    let searchToken = 0;
    let detailToken = 0;

    /** 主要動作（CTA）が今できるか。できないときは理由と、代わりに勧める操作を返す */
    function readiness() {
      const state = store.get();
      const cacheStatus = state.cache.status;
      if (cacheStatus && !cacheStatus.available) {
        if (state.mode.capabilities.sampleData) {
          return { ok: false, reason: 'サンプルデータを読み込むと検索できます', action: 'open-samples', actionLabel: 'サンプルを読み込む' };
        }
        return { ok: false, reason: '検索できるデータがありません。データを更新してください', action: 'refresh', actionLabel: 'データを更新する' };
      }
      if (state.search.status === 'loading') return { ok: false, reason: '検索しています…', busy: true };
      if (!DS.util.normalize(state.query.keyword)) {
        const field = DS.domain.fields.get(state.query.searchType);
        return { ok: false, reason: `${field.label}を入力してください` };
      }
      return { ok: true };
    }

    async function run(options) {
      const state = store.get();
      const page = (options && options.page) || 1;
      const keyword = DS.util.normalize(state.query.keyword);
      if (!keyword) return;
      const request = {
        searchType: state.query.searchType,
        keyword,
        matchMode: state.query.matchMode,
        page,
        pageSize: state.mode.pageSize || 100,
        sortKey: state.sort.key,
        sortOrder: state.sort.order,
      };
      const token = ++searchToken;
      store.set({ search: Object.assign({}, state.search, { status: 'loading', request, error: null }) });
      try {
        const result = await api.call('search_lots', request);
        if (token !== searchToken) return; // 古い結果は捨てる
        store.set({
          search: { status: 'done', result, request, error: null },
          history: DS.controllers.pushHistory(store.get().history, request.searchType, result.keyword || keyword),
        });
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

    /** 再検索（データの更新やサンプルの読み込みのあと） */
    function rerun() {
      const request = store.get().search.request;
      if (request && DS.util.normalize(store.get().query.keyword)) return run({ page: 1 });
      return Promise.resolve();
    }

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

    return { readiness, run, setQuery, toggleSort, goToPage, rerun, select, closeDetail };
  }

  DS.controllers.createSearchController = createSearchController;
})();
