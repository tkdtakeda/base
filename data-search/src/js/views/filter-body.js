/* =========================================================
   1 つの列の絞り込みの中身（見出しの小窓と、脇のパネルの各列で共通）

     種類   … 自動（値から判定）／日付／数値／文字列 を選べる。手動にした列は「手動」の印。
              変えると schema.local.json に保存し、画面を読み込み直す（record-controller.js）
     タブ   … 列の種類で使える絞り込みが 2 つあるときだけ出す
              文字列：値から選ぶ／条件で絞る　数値：範囲／値から選ぶ　日付：日付の範囲（タブなし）
              1 つの列で有効な条件は 1 つ。条件のあるタブに印を付ける
     部品   … views/filter-editors.js に登録した部品を、タブごとに必要になってから作る
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  const TAB_LABELS = {
    values: { text: '値から選ぶ', icon: 'fa-list-check' },
    text: { text: '条件で絞る', icon: 'fa-font' },
    number: { text: '範囲', icon: 'fa-arrows-left-right' },
    date: { text: '日付の範囲', icon: 'fa-calendar-days' },
  };
  const KIND_ICONS = { date: 'fa-calendar-days', number: 'fa-hashtag', text: 'fa-font' };

  function createFilterBody(container, field, ctx) {
    const labels = DS.domain.KIND_LABELS;

    // ── 種類 ──
    const typeSelect = el('select', { className: 'input input--sm filter-body__type', 'aria-label': `${field.label}の種類`,
      title: '種類を変えると、この列の絞り込みは外れ、画面を読み込み直します' }, [
      el('option', { value: 'auto', text: `自動（${labels[field.autoKind]}）` }),
      ...['date', 'number', 'text'].map((kind) => el('option', { value: kind, text: labels[kind] })),
    ]);
    typeSelect.value = field.manual ? field.type : 'auto';
    typeSelect.addEventListener('change', () => ctx.record.setColumnType(field.id, typeSelect.value));
    const manualMark = el('span', { className: 'filter-body__manual', hidden: !field.manual, title: '手動で決めた種類です。「自動」で値からの判定に戻せます' },
      [icon('fa-hand-pointer', ''), el('span', { text: '手動' })]);
    const typeRow = el('div', { className: 'filter-body__typerow' }, [
      icon(KIND_ICONS[field.type], ''), el('span', { className: 'filter-body__typelabel', text: '種類' }), typeSelect, manualMark,
    ]);

    // ── タブ ──
    const tabs = field.filters.map((id) => {
      const button = el('button', { type: 'button', className: 'filter-tab', role: 'tab', 'aria-selected': 'false', dataset: { tab: id } },
        [icon(TAB_LABELS[id].icon, ''), el('span', { text: TAB_LABELS[id].text }), el('span', { className: 'filter-tab__dot', title: 'この絞り込みが有効です' })]);
      button.addEventListener('click', () => show(id, true));
      return button;
    });
    const tabList = el('div', { className: 'filter-tabs', role: 'tablist', 'aria-label': `${field.label}の絞り込み方`, hidden: tabs.length < 2 }, tabs);
    const tabNote = el('p', { className: 'pane-note', hidden: tabs.length < 2, text: '1 つの列で有効な絞り込みは 1 つです。別のタブで選ぶと入れ替わります。' });
    const host = el('div', { className: 'filter-body__editor' });
    container.append(typeRow, tabList, host, tabNote);

    const panes = new Map(); // タブ → { node, editor, loaded }
    let active = null;

    const specOf = (state) => {
      const spec = DS.domain.filters.compact(state.filters)[field.id];
      return spec || null;
    };

    function paneFor(id) {
      if (!panes.has(id)) {
        const node = el('div', { className: 'filter-body__pane', role: 'tabpanel' });
        host.appendChild(node);
        panes.set(id, { node, editor: DS.filterEditors.get(id).mount(node, field, ctx), loaded: false });
      }
      return panes.get(id);
    }

    function show(id, focus) {
      active = id;
      panes.forEach((pane, key) => { pane.node.hidden = key !== id; });
      const pane = paneFor(id);
      pane.node.hidden = false;
      tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === id)));
      const state = ctx.store.get();
      if (!pane.loaded) {
        pane.loaded = true;
        pane.editor.load(state);
      } else {
        pane.editor.draw(state);
      }
      if (focus) pane.editor.focus();
    }

    function marks(state) {
      const spec = specOf(state);
      tabs.forEach((tab) => tab.classList.toggle('has-filter', Boolean(spec && spec.type === tab.dataset.tab)));
    }

    // 最初は、条件のあるタブ（なければ既定のタブ）
    const initial = specOf(ctx.store.get());
    show(initial && field.filters.includes(initial.type) ? initial.type : field.filter, false);
    marks(ctx.store.get());

    return {
      /** 値の一覧などを取り直す（条件・検索・データが変わったとき） */
      load(state) {
        marks(state);
        panes.forEach((pane, key) => { pane.loaded = key === active; });
        paneFor(active).editor.load(state);
      },
      draw(state) {
        marks(state);
        paneFor(active).editor.draw(state);
      },
      focus() {
        paneFor(active).editor.focus();
      },
    };
  }

  DS.views.createFilterBody = createFilterBody;
})();
