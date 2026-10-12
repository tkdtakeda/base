/* =========================================================
   データ（キャッシュ）の状態と更新、サンプルデータの読み込み・削除
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  // ── キャッシュ ─────────────────────────────────────────
  function createCacheController({ store, api, toast, search }) {
    // データの更新で DB の列が増えた・減ったときは、表示定義から組み立て直すため画面を読み込み直す
    // （選んだ列・幅・タグ・検索の種類はブラウザに保存してあるので残る）
    let reloading = false;
    function reloadIfColumnsChanged(status) {
      const current = DS.domain.columnsVersion();
      if (reloading || !status.columnsVersion || !current || status.columnsVersion === current) return;
      reloading = true;
      toast.show({ tone: 'info', message: 'データの列が変わったため、画面を読み込み直します', timeout: 2000 });
      window.setTimeout(() => window.location.reload(), 1500);
    }

    async function loadStatus() {
      try {
        const status = await api.call('get_cache_status');
        store.merge('cache', { status });
        reloadIfColumnsChanged(status);
        return status;
      } catch (error) {
        store.merge('cache', { status: { available: false, message: error.userMessage, lastRefreshSucceeded: false } });
        return null;
      }
    }

    async function refresh() {
      if (store.get().cache.refreshing) return;
      store.merge('cache', { refreshing: true, refreshStartedAt: Date.now() });
      try {
        const result = await api.call('refresh_cache');
        toast.show({
          tone: 'success',
          message: `データを更新しました（${DS.util.formatNumber(result.rowCount)} 件）`,
        });
        await loadStatus();
        search.rerun();
      } catch (error) {
        toast.show({ tone: 'warning', message: error.userMessage, detailId: error.detailId });
        await loadStatus();
      } finally {
        store.merge('cache', { refreshing: false, refreshStartedAt: null });
      }
    }

    return { loadStatus, refresh };
  }

  // ── サンプルデータ（画面だけで試すモード） ─────────────────
  function createSampleController({ store, api, toast, search, cache }) {
    const samples = api.adapter.samples;
    const available = Boolean(samples);

    async function afterChange(demoQuery) {
      await cache.loadStatus();
      if (demoQuery) search.setQuery(demoQuery);
      await search.run({ page: 1 });
    }

    async function load(id) {
      if (!available) return;
      const pattern = DS.sample.patterns.get(id);
      const result = samples.load(id);
      if (!result.ok) {
        toast.show({ tone: 'danger', message: result.reason });
        return;
      }
      toast.show({
        tone: 'success',
        message: `「${pattern.title}」を読み込みました（全 ${DS.util.formatNumber(result.total)} 件）`,
      });
      if (result.warning) toast.show({ tone: 'warning', message: `次回は読み込み直しが必要です：${result.warning}` });
      store.set({ samplesVersion: Date.now() });
      await afterChange(pattern.demoQuery);
    }

    /** サンプルだけを消す。確認ダイアログではなく「元に戻す」を用意する */
    async function clear() {
      if (!available) return;
      const { snapshot, removed } = samples.clear();
      store.set({ samplesVersion: Date.now() });
      search.clearSelection();
      store.set({ search: { status: 'idle', result: null, request: null, error: null } });
      await afterChange(null);
      toast.show({
        tone: 'info',
        message: `サンプルデータ ${DS.util.formatNumber(removed)} 件を消しました`,
        actionLabel: '元に戻す',
        timeout: 10000,
        onAction: async () => {
          samples.restore(snapshot);
          store.set({ samplesVersion: Date.now() });
          await afterChange(null);
          toast.show({ tone: 'success', message: 'サンプルデータを元に戻しました' });
        },
      });
    }

    return { available, load, clear, loadedIds: () => (available ? samples.loadedIds() : []), countOf: (id) => (available ? samples.countOf(id) : 0) };
  }

  DS.controllers.createCacheController = createCacheController;
  DS.controllers.createSampleController = createSampleController;
})();
