/* =========================================================
   上部バー右：どのデータを見ているか（出どころ）と、その鮮度
   押すと「データ」パネルが開き、詳しい根拠を確かめられる。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /** キャッシュの状態を「アイコン＋文字＋色」の 1 組にまとめる（パネルと共通で使う） */
  function describeCache(cacheState) {
    const status = cacheState.status;
    if (cacheState.refreshing) return { tone: 'info', icon: 'fa-rotate', spin: true, fallback: '…', text: '更新しています' };
    if (!status) return { tone: 'neutral', icon: 'fa-circle-notch', spin: true, fallback: '…', text: '確認しています' };
    if (!status.available) return { tone: 'danger', icon: 'fa-database', fallback: '×', text: 'データなし' };
    if (status.usingPreviousCache) return { tone: 'warning', icon: 'fa-triangle-exclamation', fallback: '!', text: '前回のデータを使用中' };
    if (status.sourceHasUpdate) return { tone: 'warning', icon: 'fa-cloud-arrow-down', fallback: '!', text: '新しい更新があります' };
    return { tone: 'success', icon: 'fa-circle-check', fallback: '✓', text: '最新' };
  }

  function createStatusChips(root, { store, bus, openPanel }) {
    const { el, icon } = DS.util;
    const mode = store.get().mode;

    const modeChip = el('span', {
      className: `chip chip--mode chip--mode-${mode.mode}`,
      title: mode.description,
    }, [icon(mode.mode === 'mock' ? 'fa-flask' : 'fa-database', ''), el('span', { text: mode.label })]);

    const cacheText = el('span', { className: 'chip__text' });
    const cacheSub = el('span', { className: 'chip__sub mono' });
    const cacheIcon = el('span', { className: 'chip__icon' });
    const cacheChip = el('button', {
      type: 'button',
      className: 'chip chip--status',
      title: 'データの状態を見る',
    }, [cacheIcon, cacheText, cacheSub]);
    cacheChip.addEventListener('click', () => openPanel('data'));

    root.append(modeChip, cacheChip);

    function render(state) {
      const view = describeCache(state.cache);
      cacheChip.className = `chip chip--status chip--${view.tone}`;
      cacheIcon.replaceChildren(icon(view.icon, view.fallback, view.spin ? 'fa-spin' : ''));
      cacheText.textContent = view.text;
      const status = state.cache.status;
      cacheSub.textContent = status && status.cacheUpdatedAt ? DS.util.formatDateTime(status.cacheUpdatedAt) + ' 時点' : '';
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.includes('cache')) render(state);
    });
    render(store.get());
  }

  DS.views.describeCache = describeCache;
  DS.views.createStatusChips = createStatusChips;
})();
