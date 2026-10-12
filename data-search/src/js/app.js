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

  /** 表示定義を読めないときは、画面の部品を作らずに理由だけを出す */
  function showFatal(message, detailId) {
    const box = document.createElement('div');
    box.className = 'fatal';
    box.innerHTML = '<h1 class="fatal__title">画面を準備できませんでした</h1><p class="fatal__text"></p><p class="fatal__id mono"></p>';
    box.querySelector('.fatal__text').textContent = message;
    box.querySelector('.fatal__id').textContent = detailId ? `問い合わせ番号 ${detailId}` : '';
    document.body.replaceChildren(box);
  }

  async function start() {
    watchIconFont();
    const bus = DS.core.createEventBus();
    const api = DS.api.createClient(DS.api.selectAdapter());

    // 表示定義（項目・表示名・表示順・検索・絞り込み）を最初に読み込み、論理項目の登録簿を組み立てる
    try {
      DS.domain.applyView(await api.call('get_view_config'));
    } catch (error) {
      showFatal(error.userMessage || String(error), error.detailId);
      return;
    }

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
    const source = DS.controllers.createSourceController({ store, api, toast, search, cache });
    const tags = DS.controllers.createTagController({ store, bus, toast, search });

    const manual = DS.views.createManualView(document.getElementById('manual-host'));
    const openPanel = (id) => store.merge('ui', { panel: id });
    const refresh = () => cache.refresh();
    const ctx = { store, bus, api, toast, search, cache, samples, tags, source };

    DS.views.createSidePanel({
      rail: document.getElementById('rail'),
      host: document.getElementById('sidepanel'),
      store, bus, ctx,
      openManual: manual.toggle,
    });
    const searchBar = DS.views.createSearchBar(document.getElementById('search-host'), { store, bus, search, openPanel, refresh });
    DS.views.createStatusChips(document.getElementById('status-host'), { store, bus, openPanel });
    DS.views.createTagBar(document.getElementById('tagbar'), { store, bus, tags, openPanel });
    DS.views.createResultsView(document.getElementById('results'), { store, bus, search, toast, openPanel, refresh });
    DS.views.createDetailView(document.getElementById('detail'), { store, bus, search, toast });

    // Esc：開いているものを手前から順に閉じる（入力中の Esc は入力欄が受け持つ）
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
      if (store.get().selection.open) search.closeDetail();
      else if (store.get().ui.panel) openPanel(null);
    });

    try {
      const info = await api.call('get_application_info');
      store.set({ appInfo: info });
      document.getElementById('app-version').textContent = `v${info.version}`;
    } catch (error) {
      toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
    }
    await Promise.all([cache.loadStatus(), source.load()]);
    await search.run({ page: 1 }); // 起動したらすぐ一覧を出す（入力は不要）
    searchBar.focus();

    DS.app = { store, bus, api, search, cache, samples, tags, source, manual }; // 確認用スクリプト（tests/ui-check.js）から使う
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
