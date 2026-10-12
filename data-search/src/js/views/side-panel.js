/* =========================================================
   左のアイコン列と、そこから開く脇のパネル
   パネルは登録簿（DS.panels）に register() するだけで増やせる。
     { id, order, icon, label, title, mount(container, ctx) → { update(state) } , badge?(state) }
   最初は閉じておき、押したときに開く。開いたパネルは 1 つだけ。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.panels = DS.core.createRegistry('panels');

  function createSidePanel({ rail, host, store, bus, ctx, openManual }) {
    const { el, icon } = DS.util;
    const mounted = new Map();
    const buttons = new Map();

    const title = el('h2', { className: 'sidepanel__title' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '閉じる（Esc）', 'aria-label': 'パネルを閉じる' }, [icon('fa-xmark', '×')]);
    const body = el('div', { className: 'sidepanel__body' });
    host.append(el('div', { className: 'sidepanel__head' }, [title, closeButton]), body);
    closeButton.addEventListener('click', () => open(null));
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const panelId = store.get().ui.panel;
        open(null);
        const button = buttons.get(panelId);
        if (button) button.focus();
      }
    });
    DS.util.selectAllOnFocus(host);

    // ── アイコン列（作業の順に並べる） ──
    const top = el('div', { className: 'rail__group' });
    DS.panels.list().forEach((panel) => {
      const badge = el('span', { className: 'rail__badge', hidden: true });
      const button = el('button', {
        type: 'button',
        className: 'rail__btn',
        title: panel.title,
        'aria-controls': 'sidepanel',
        'aria-expanded': 'false',
      }, [icon(panel.icon, panel.fallback || panel.label.slice(0, 1)), el('span', { className: 'rail__label', text: panel.label }), badge]);
      button.addEventListener('click', () => open(store.get().ui.panel === panel.id ? null : panel.id));
      buttons.set(panel.id, button);
      top.appendChild(button);
    });
    const help = el('button', { type: 'button', className: 'rail__btn', title: '取扱説明書（F1）' }, [
      icon('fa-circle-question', '?'), el('span', { className: 'rail__label', text: '説明書' }),
    ]);
    help.addEventListener('click', openManual);
    rail.append(top, el('div', { className: 'rail__group' }, [help]));

    function open(panelId) {
      store.merge('ui', { panel: panelId });
    }

    function render(state) {
      const panelId = state.ui.panel;
      host.hidden = !panelId;
      buttons.forEach((button, id) => {
        button.classList.toggle('is-active', id === panelId);
        button.setAttribute('aria-expanded', String(id === panelId));
        const panel = DS.panels.get(id);
        const badgeNode = button.querySelector('.rail__badge');
        const badge = panel.badge ? panel.badge(state) : null;
        badgeNode.hidden = !badge;
        if (badge) {
          badgeNode.className = `rail__badge rail__badge--${badge.tone}`;
          badgeNode.textContent = badge.text || '';
          badgeNode.title = badge.title || '';
        }
      });
      if (!panelId) return;
      const panel = DS.panels.get(panelId);
      title.replaceChildren(icon(panel.icon, ''), el('span', { text: panel.title }));
      if (!mounted.has(panelId)) {
        const container = el('div', { className: 'sidepanel__content', dataset: { panel: panelId } });
        mounted.set(panelId, { container, view: panel.mount(container, ctx) });
      }
      const entry = mounted.get(panelId);
      if (body.firstChild !== entry.container) body.replaceChildren(entry.container);
      if (entry.view && entry.view.update) entry.view.update(state);
    }

    const WATCHED = ['ui', 'cache', 'columns', 'samplesVersion'];
    bus.on('state', ({ state, changed }) => {
      if (changed.some((key) => WATCHED.includes(key))) render(state);
    });
    render(store.get());

    return { open };
  }

  DS.views.createSidePanel = createSidePanel;
})();
