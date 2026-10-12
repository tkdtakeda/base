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
