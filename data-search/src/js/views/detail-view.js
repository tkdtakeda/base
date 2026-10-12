/* =========================================================
   選んだ行の詳細（メイン領域の右）。項目はまとまりごとに分けて表示する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /**
   * 別のツールへ渡す「送り先」の登録簿。登録すると詳細の下にボタンが出る。
   *   DS.handoffs.register({ id, order, label, icon, send(item) })   item は 12 項目の論理名のデータ
   */
  DS.handoffs = DS.core.createRegistry('handoffs');

  const OPEN_KEY = 'detail:open-groups';
  const DEFAULT_OPEN_GROUPS = 2;

  function createDetailView(root, { store, bus, search, toast }) {
    const { el, icon } = DS.util;

    const title = el('div', { className: 'detail__title' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '詳細を閉じる（Esc）', 'aria-label': '詳細を閉じる' }, [icon('fa-xmark', '×')]);
    const notice = el('div', { className: 'detail__notice' });
    const body = el('div', { className: 'detail__body' });
    const actions = el('div', { className: 'detail__actions' });
    root.append(el('div', { className: 'detail__head' }, [title, closeButton]), notice, body, actions);
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
      if (DS.domain.hasBadge(field)) return DS.domain.badge(field, value);
      if (value === null || value === undefined || value === '') return el('span', { className: 'muted', text: '—' });
      return el('span', { className: field.mono ? 'mono' : '', text: String(value) });
    }

    function render(state) {
      const selection = state.selection;
      root.hidden = !selection.key;
      if (!selection.key) return;
      const item = selection.item;

      // 見出し：1 件を特定する鍵（例：ロット番号＋BOX番号）と、札を持つ項目（例：状態）
      const [headField, ...subFields] = DS.domain.keyFields();
      const badgeField = DS.domain.detailFields().find((field) => DS.domain.hasBadge(field));
      title.replaceChildren(...[
        el('span', { className: 'detail__label', text: headField.label }),
        el('strong', { className: 'detail__lot mono', text: item[headField.id] || '—' }),
        subFields.length ? el('span', { className: 'detail__subkeys' }, subFields.map((field) =>
          el('span', {}, [el('span', { className: 'detail__label', text: `${field.label} ` }), el('span', { className: 'mono', text: item[field.id] || '—' })]))) : null,
        badgeField ? DS.domain.badge(badgeField, item[badgeField.id]) : null,
      ].filter(Boolean));

      const notices = [];
      if (selection.status === 'loading') notices.push(el('p', { className: 'inline-note' }, [icon('fa-spinner', '…', 'fa-spin'), el('span', { text: ' 最新の内容を確かめています' })]));
      if (selection.status === 'error') notices.push(el('p', { className: 'inline-note inline-note--danger' }, [icon('fa-circle-xmark', '×'), el('span', { text: ' ' + selection.error.userMessage })]));
      if (selection.duplicated) {
        const keyNames = DS.domain.keyFields().map((field) => field.label).join('・');
        notices.push(el('p', { className: 'inline-note inline-note--warning' }, [icon('fa-triangle-exclamation', '!'), el('span', { text: ` 同じ${keyNames}のデータが複数あります。最初の 1 件を表示しています。` })]));
      }
      notice.replaceChildren(...notices);

      // 詳細に出す項目は view の detailFields、まとまりと順番は detailGroups。
      // 項目が多いので、まとまりごとに開閉でき、開閉の状態を覚える（最初は先頭の 2 つだけ開く）
      const openState = DS.core.storage.read(OPEN_KEY, {});
      body.replaceChildren(...DS.domain.detailSections().map(({ group, fields }, index) => {
        const rows = fields.flatMap((field) => {
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
        const isOpen = openState[group.id] === undefined ? index < DEFAULT_OPEN_GROUPS : openState[group.id];
        const section = el('details', { className: 'detail__group', open: isOpen }, [
          el('summary', { className: 'detail__group-title' }, [
            icon('fa-chevron-right', '›', 'detail__chevron'), icon(group.icon, ''),
            el('span', { text: group.label }), el('span', { className: 'detail__count', text: `${fields.length}` }),
          ]),
          el('dl', { className: 'facts facts--detail' }, rows),
        ]);
        section.addEventListener('toggle', () => {
          const next = DS.core.storage.read(OPEN_KEY, {});
          next[group.id] = section.open;
          DS.core.storage.write(OPEN_KEY, next);
        });
        return section;
      }));
      if (selection.status === 'done') DS.util.flash(title);

      const targets = DS.handoffs.list();
      actions.hidden = targets.length === 0;
      actions.replaceChildren(...targets.map((target) => {
        const button = el('button', { type: 'button', className: 'btn btn--secondary btn--block' }, [icon(target.icon || 'fa-share-from-square', ''), el('span', { text: target.label })]);
        button.addEventListener('click', () => target.send(Object.assign({}, item)));
        return button;
      }));
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.includes('selection')) render(state);
    });
    render(store.get());
  }

  DS.views.createDetailView = createDetailView;
})();
