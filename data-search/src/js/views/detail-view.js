/* =========================================================
   選んだ行の詳細（メイン領域の右）。項目はまとまりごとに分けて表示する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createDetailView(root, { store, bus, search, toast }) {
    const { el, icon } = DS.util;

    const title = el('div', { className: 'detail__title' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '詳細を閉じる（Esc）', 'aria-label': '詳細を閉じる' }, [icon('fa-xmark', '×')]);
    const notice = el('div', { className: 'detail__notice' });
    const body = el('div', { className: 'detail__body' });
    root.append(el('div', { className: 'detail__head' }, [title, closeButton]), notice, body);
    root.setAttribute('aria-label', '選んだデータの詳細');

    closeButton.addEventListener('click', () => search.closeDetail());
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') search.closeDetail();
    });

    async function copy(value, button) {
      try {
        await navigator.clipboard.writeText(value);
      } catch (error) {
        // file:// などでクリップボード API が使えないときの代わり
        const area = el('textarea', { style: 'position:fixed;opacity:0' });
        area.value = value;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      button.replaceChildren(icon('fa-check', '✓'));
      button.classList.add('is-done');
      window.setTimeout(() => {
        button.replaceChildren(icon('fa-copy', '⧉'));
        button.classList.remove('is-done');
      }, 1200);
      toast.show({ tone: 'success', message: `「${value}」をコピーしました`, timeout: 2000 });
    }

    function valueNode(field, value) {
      if (field.render === 'status') return DS.domain.statusBadge(value);
      if (value === null || value === undefined || value === '') return el('span', { className: 'muted', text: '—' });
      return el('span', { className: field.mono ? 'mono' : '', text: String(value) });
    }

    function render(state) {
      const selection = state.selection;
      root.hidden = !selection.key;
      if (!selection.key) return;
      const item = selection.item;

      title.replaceChildren(
        el('span', { className: 'detail__label', text: 'ロット番号' }),
        el('strong', { className: 'detail__lot mono', text: item.lotNo || '—' }),
        DS.domain.statusBadge(item.status),
      );

      const notices = [];
      if (selection.status === 'loading') notices.push(el('p', { className: 'inline-note' }, [icon('fa-spinner', '…', 'fa-spin'), el('span', { text: ' 最新の内容を確かめています' })]));
      if (selection.status === 'error') notices.push(el('p', { className: 'inline-note inline-note--danger' }, [icon('fa-circle-xmark', '×'), el('span', { text: ' ' + selection.error.userMessage })]));
      if (selection.duplicated) notices.push(el('p', { className: 'inline-note inline-note--warning' }, [icon('fa-triangle-exclamation', '!'), el('span', { text: ' 同じロット番号・鋳造番号のデータが複数あります。最初の 1 件を表示しています。' })]));
      notice.replaceChildren(...notices);

      body.replaceChildren(...DS.domain.fieldGroups.list().map((group) => {
        const rows = DS.domain.fields.list().filter((field) => field.group === group.id).flatMap((field) => {
          const value = item[field.id];
          const copyButton = field.copy && value
            ? el('button', { type: 'button', className: 'copy-btn', title: `${field.label}をコピー`, 'aria-label': `${field.label}をコピー` }, [icon('fa-copy', '⧉')])
            : null;
          if (copyButton) copyButton.addEventListener('click', () => copy(String(value), copyButton));
          return [
            el('dt', { text: field.label }),
            el('dd', {}, [valueNode(field, value), copyButton]),
          ];
        });
        return el('section', { className: 'detail__group' }, [
          el('h3', { className: 'detail__group-title' }, [icon(group.icon, ''), el('span', { text: group.label })]),
          el('dl', { className: 'facts facts--detail' }, rows),
        ]);
      }));
      if (selection.status === 'done') DS.util.flash(title);
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.includes('selection')) render(state);
    });
    render(store.get());
  }

  DS.views.createDetailView = createDetailView;
})();
