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

  /** 保存した列の設定を読み直す。知らない列（DB から消えた列）は捨てる。新しく増えた列は表示する */
  function restoreColumns(prefs) {
    const base = defaultColumns();
    if (!Array.isArray(prefs.hiddenColumns)) return base;
    const known = (id) => DS.domain.fields.has(id);
    const widths = {};
    Object.entries(prefs.columnWidths || {}).forEach(([id, width]) => { if (known(id) && Number(width) > 0) widths[id] = Number(width); });
    return {
      hidden: prefs.hiddenColumns.filter(known),
      widths,
      density: prefs.density === 'comfortable' ? 'comfortable' : 'compact',
    };
  }

  function createInitialState(mode) {
    const prefs = DS.core.storage.read(PREFS_KEY, {});
    const searchable = DS.domain.searchableFields().map((field) => field.id);
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
      selection: { key: null, item: null, status: 'idle', error: null, duplicated: false, open: false },
      ui: { panel: null },
      columns: restoreColumns(prefs),
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
        hiddenColumns: state.columns.hidden,
        columnWidths: state.columns.widths,
        density: state.columns.density,
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
  DS.controllers.defaultColumns = defaultColumns;
  DS.controllers.pushHistory = pushHistory;
})();
