/* =========================================================
   1 件を決める列（schema.recordKey）と番号で探す列（schema.searchColumn）の確認・保存

     check(names)                選んだ列の組み合わせで 1 件に決まるかを数える（保存はしない）
     save(names, searchColumn)   確かめた組み合わせだけ保存できる → schema.local.json に保存
                                 → 列の並び・左端の固定・探す列が変わるため、画面を読み込み直す
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const RELOAD_WAIT_MS = 1200;

  const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);

  function createRecordController({ store, api, toast }) {
    const set = (patch) => store.merge('record', patch);

    async function check(names) {
      set({ status: 'checking', result: null, checked: null });
      try {
        const result = await api.call('check_record_key', { recordKey: names });
        set({ status: 'idle', result, checked: names.slice() });
        return result;
      } catch (error) {
        set({ status: 'idle' });
        toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
        return null;
      }
    }

    /** 確かめた組み合わせと同じときだけ保存できる（重なりがあっても保存はできる。画面で注意を出す） */
    function canSave(names) {
      const { result, checked, status } = store.get().record;
      return status === 'idle' && Boolean(result) && sameList(checked, names);
    }

    async function save(names, searchColumn) {
      if (!canSave(names)) return false;
      set({ status: 'saving' });
      try {
        const result = await api.call('update_record_settings', { recordKey: names, searchColumn: searchColumn || null });
        toast.show({ tone: 'success', message: `${result.message}画面を読み込み直します`, timeout: RELOAD_WAIT_MS + 1000 });
        // 列の並び・左端に固定する列・探す列が変わるため、表示定義から組み立て直す（選んだ列・幅・タグは残る）
        window.setTimeout(() => window.location.reload(), RELOAD_WAIT_MS);
        return true;
      } catch (error) {
        set({ status: 'idle' });
        toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
        return false;
      }
    }

    function reset() {
      set({ status: 'idle', result: null, checked: null });
    }

    return { check, canSave, save, reset };
  }

  DS.controllers.createRecordController = createRecordController;
})();
