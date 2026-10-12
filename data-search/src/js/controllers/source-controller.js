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
