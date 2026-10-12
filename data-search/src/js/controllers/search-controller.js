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
      // 1 件を決める列が DB にない：番号を入れていなければ、選び直すよう案内する（探す列があれば番号では探せる）
      const keyMissing = Boolean(cacheStatus && cacheStatus.available && !DS.domain.isReady());
      if (keyMissing && (!field || !keywordOf())) {
        return { ok: false, reason: '1 件を決める列が DB にありません。左の「データ」で選んでください', action: 'choose-key', actionLabel: '1 件を決める列を選ぶ' };
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
        // 1 件を決める列がないと、詳細の 1 件を決められない
        store.set({ selection: Object.assign({}, EMPTY_SELECTION, { key, item }) });
        toast.show({ tone: 'warning', message: '詳細を開くには、左の「データ」で 1 件を決める列を選んでください', actionLabel: '選ぶ', onAction: () => bus.emit('record:choose') });
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
