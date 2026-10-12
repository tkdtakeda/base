/* =========================================================
   見出しの漏斗（じょうご）から開く、列ごとの絞り込みの小窓（Excel のフィルターと同じ考え方）

     開く   … 見出しの漏斗のボタン（Enter でも開く）。列の真下に出す
     中身   … 列の種類の部品（views/filter-editors.js）。値から選ぶ／日付の範囲
     反映   … 選んだらすぐ一覧に反映する（「適用」ボタンは置かない）
     閉じる … Esc・小窓の外を押す・× ・「閉じる」。閉じたら漏斗のボタンへ戻る
   一度に開く小窓は 1 つだけ。開いている間も一覧は操作できる（モーダルにしない）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const GAP = 4;
  const EDGE = 8;

  const KIND_TEXT = {
    values: { icon: 'fa-list-check', text: '値から選ぶ（同じ列の中は「または」）' },
    date: { icon: 'fa-calendar-days', text: '日付の範囲で絞り込む' },
  };

  function createColumnFilter({ store, bus, ctx }) {
    const { el, icon } = DS.util;

    const title = el('h2', { className: 'col-filter__title' });
    const kind = el('p', { className: 'col-filter__kind' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '閉じる（Esc）', 'aria-label': '絞り込みを閉じる' }, [icon('fa-xmark', '×')]);
    const body = el('div', { className: 'col-filter__body' });
    const clearButton = el('button', { type: 'button', className: 'btn btn--ghost btn--sm' }, [icon('fa-filter-circle-xmark', ''), el('span', { text: 'この列の絞り込みを解除' })]);
    const doneButton = el('button', { type: 'button', className: 'btn btn--secondary btn--sm' }, [icon('fa-check', '✓'), el('span', { text: '閉じる' })]);
    const pop = el('div', { className: 'col-filter', role: 'dialog', 'aria-modal': 'false', hidden: true }, [
      el('div', { className: 'col-filter__head' }, [el('div', { className: 'col-filter__heading' }, [title, kind]), closeButton]),
      body,
      el('div', { className: 'col-filter__foot' }, [clearButton, doneButton]),
    ]);
    document.body.appendChild(pop);
    DS.util.selectAllOnFocus(pop);

    let current = null; // { field, editor, signature }

    function findAnchor(fieldId) {
      return document.querySelector(`.grid thead th[data-field="${CSS.escape(fieldId)}"]`);
    }

    function place(anchor) {
      const rect = anchor.getBoundingClientRect();
      pop.style.maxHeight = '';
      const width = pop.offsetWidth;
      const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE));
      const top = rect.bottom + GAP;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.style.maxHeight = `${Math.max(200, window.innerHeight - top - EDGE)}px`;
    }

    function signatureOf(state) {
      const request = state.search.request || {};
      return JSON.stringify([DS.domain.filters.compact(state.filters), request.keyword || '', request.matchMode,
        state.cache.status && state.cache.status.cacheUpdatedAt]);
    }

    /** 列の絞り込みを開く。同じ列なら閉じる（押し直しで閉じられるように） */
    function open(fieldId) {
      if (current && current.field.id === fieldId) {
        close(true);
        return;
      }
      const field = DS.domain.fields.get(fieldId);
      const anchor = findAnchor(fieldId);
      if (!field || !anchor) return;
      const type = KIND_TEXT[field.filter];
      title.replaceChildren(icon('fa-filter', ''), el('span', { text: field.label }));
      kind.replaceChildren(icon(type.icon, ''), el('span', { text: type.text }));
      body.replaceChildren();
      const editor = DS.filterEditors.get(field.filter).mount(body, field, ctx);
      const state = store.get();
      current = { field, editor, signature: signatureOf(state) };
      pop.setAttribute('aria-label', `${field.label}の絞り込み`);
      pop.hidden = false;
      render(state);
      editor.load(state);
      place(anchor);
      window.requestAnimationFrame(() => editor.focus());
      bus.emit('column-filter', { fieldId });
    }

    function close(returnFocus) {
      if (!current) return;
      const fieldId = current.field.id;
      current = null;
      pop.hidden = true;
      body.replaceChildren();
      bus.emit('column-filter', { fieldId: null });
      if (returnFocus) {
        const button = document.querySelector(`.grid thead th[data-field="${CSS.escape(fieldId)}"] [data-filter]`);
        if (button) button.focus();
      }
    }

    function render(state) {
      if (!current) return;
      const spec = DS.domain.filters.compact(state.filters)[current.field.id];
      clearButton.disabled = !spec;
      pop.classList.toggle('is-active', Boolean(spec));
    }

    closeButton.addEventListener('click', () => close(true));
    doneButton.addEventListener('click', () => close(true));
    clearButton.addEventListener('click', () => {
      if (!current) return;
      ctx.search.clearFilter(current.field.id);
      DS.util.flash(body);
    });
    pop.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // 値を探す欄に文字があるときは、まず文字を消す（ブラウザの既定の動き）
      if (event.target.matches('input[type="search"]') && event.target.value) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    });
    // 小窓の外を押したら閉じる（漏斗のボタンは、押し直しで閉じるので除く）
    document.addEventListener('mousedown', (event) => {
      if (current && !pop.contains(event.target) && !event.target.closest('[data-filter]')) close(false);
    });
    window.addEventListener('resize', DS.util.debounce(() => {
      if (!current) return;
      const anchor = findAnchor(current.field.id);
      if (anchor) place(anchor);
      else close(false);
    }, 150));

    bus.on('state', ({ state, changed }) => {
      if (!current || !changed.some((key) => ['filters', 'search', 'cache'].includes(key))) return;
      render(state);
      const signature = signatureOf(state);
      if (signature !== current.signature) {
        current.signature = signature;
        current.editor.load(state);
      } else {
        current.editor.draw(state);
      }
    });

    return { open, close, isOpen: (fieldId) => Boolean(current && current.field.id === fieldId) };
  }

  DS.views.createColumnFilter = createColumnFilter;
})();
