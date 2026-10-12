/* =========================================================
   起動：アダプターを選び、状態・操作・画面の部品を組み立てる
   依存の向き：画面の部品 → 操作（controllers） → API → アダプター
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /** アイコンのフォントが読めないときは文字の代替に切り替える */
  function watchIconFont() {
    if (!document.fonts || !document.fonts.load) return;
    document.fonts.load('900 16px "Font Awesome 6 Free"').then((faces) => {
      if (!faces.length) document.documentElement.classList.add('no-icons');
    }).catch(() => document.documentElement.classList.add('no-icons'));
  }

  async function start() {
    watchIconFont();
    const bus = DS.core.createEventBus();
    const api = DS.api.createClient(DS.api.selectAdapter());
    const mode = {
      mode: api.mode,
      label: api.adapter.label,
      description: api.adapter.description,
      capabilities: api.capabilities,
    };
    const store = DS.core.createStore(DS.controllers.createInitialState(mode), bus);
    DS.controllers.attachPrefsPersistence(store, bus);
    document.documentElement.dataset.mode = api.mode;

    const toast = DS.views.createToast(document.getElementById('toast-host'));
    bus.on('prefs:failed', (reason) => toast.show({ tone: 'warning', message: `設定を保存できませんでした：${reason}` }));

    const search = DS.controllers.createSearchController({ store, bus, api, toast });
    const cache = DS.controllers.createCacheController({ store, api, toast, search });
    const samples = DS.controllers.createSampleController({ store, api, toast, search, cache });

    const manual = DS.views.createManualView(document.getElementById('manual-host'));
    const openPanel = (id) => store.merge('ui', { panel: id });
    const refresh = () => cache.refresh();
    const ctx = { store, bus, api, toast, search, cache, samples };

    DS.views.createSidePanel({
      rail: document.getElementById('rail'),
      host: document.getElementById('sidepanel'),
      store, bus, ctx,
      openManual: manual.toggle,
    });
    const searchBar = DS.views.createSearchBar(document.getElementById('search-host'), { store, bus, search, openPanel, refresh });
    DS.views.createStatusChips(document.getElementById('status-host'), { store, bus, openPanel });
    DS.views.createResultsView(document.getElementById('results'), { store, bus, search, openPanel, refresh });
    DS.views.createDetailView(document.getElementById('detail'), { store, bus, search, toast });

    // Esc：開いているものを手前から順に閉じる（入力中の Esc は入力欄が受け持つ）
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
      if (store.get().selection.key) search.closeDetail();
      else if (store.get().ui.panel) openPanel(null);
    });

    try {
      const info = await api.call('get_application_info');
      store.set({ appInfo: info });
      document.getElementById('app-version').textContent = `v${info.version}`;
    } catch (error) {
      toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
    }
    await cache.loadStatus();
    searchBar.focus();

    DS.app = { store, bus, api, search, cache, samples, manual }; // 確認用スクリプト（tests/ui-check.js）から使う
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
