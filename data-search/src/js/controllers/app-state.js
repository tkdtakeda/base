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
