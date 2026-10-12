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
        return { ok: false, quiet: true, reason: `${field.label}を入れると、一覧の中から探せます` };
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
