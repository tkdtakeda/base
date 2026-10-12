/* =========================================================
   データ（キャッシュ）の状態と更新、サンプルデータの読み込み・削除
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  // ── キャッシュ ─────────────────────────────────────────
  function createCacheController({ store, api, toast, search }) {
    async function loadStatus() {
      try {
        const status = await api.call('get_cache_status');
        store.merge('cache', { status });
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
      if (demoQuery) {
        search.setQuery(demoQuery);
        await search.run({ page: 1 });
      } else {
        await search.rerun();
      }
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
      search.closeDetail();
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
