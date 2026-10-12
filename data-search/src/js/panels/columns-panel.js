/* =========================================================
   脇のパネル「表示列」：一覧に出す列を選ぶ

   ・列は全部で数十列になるため、列名で探して絞り込める
   ・「すべて表示」「すべて隠す」「既定に戻す」（既定＝設定の hiddenColumns だけ隠す）
   ・固定列（左端に固定）は隠せない
   ・選んだ内容はブラウザに自動保存
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  function section(titleText, children) {
    return el('section', { className: 'pane-section' }, [el('h3', { className: 'pane-section__title', text: titleText })].concat(children));
  }

  function button(iconName, text) {
    return el('button', { type: 'button', className: 'btn btn--secondary btn--sm' }, [icon(iconName, ''), el('span', { text })]);
  }

  DS.panels.register({
    id: 'columns',
    order: 20,
    icon: 'fa-table-columns',
    label: '表示列',
    title: '一覧に表示する列',
    badge(state) {
      const hidden = state.columns.hidden.length;
      return hidden > 0 ? { tone: 'info', text: String(hidden), title: `${hidden} 列を隠しています` } : null;
    },
    mount(container, ctx) {
      const { store } = ctx;
      const checks = new Map();
      const finder = el('input', { type: 'search', className: 'input input--sm', placeholder: '列名で探す', 'aria-label': '列名で探す' });
      const count = el('p', { className: 'pane-note columns-panel__count', 'aria-live': 'polite' });
      const showAll = button('fa-eye', 'すべて表示');
      const hideAll = button('fa-eye-slash', 'すべて隠す');
      const reset = button('fa-arrow-rotate-left', '既定に戻す');
      const noMatch = el('p', { className: 'pane-note', hidden: true, text: '当てはまる列はありません。' });

      const sections = DS.domain.detailSections().map(({ group, fields }) => {
        const items = fields.map((field) => {
          const box = el('input', { type: 'checkbox', value: field.id, disabled: field.key });
          box.addEventListener('change', () => toggle(field.id, box.checked, box.parentElement));
          checks.set(field.id, box);
          return el('label', { className: 'check', title: field.key ? '固定列のため、いつも表示します' : field.label, dataset: { name: DS.util.foldForCompare(field.label) } },
            [box, el('span', { className: 'check__text', text: field.label }), field.key ? icon('fa-key', '鍵') : null]);
        });
        return section(group.label, [el('div', { className: 'check-list' }, items)]);
      });

      DS.util.selectAllOnFocus(container);
      container.append(
        el('p', { className: 'pane-note', text: 'チェックを外した列は一覧から隠れます（詳細にはすべて出ます）。選んだ内容は自動で保存されます。' }),
        finder,
        el('div', { className: 'source__actions' }, [showAll, hideAll, reset]),
        count,
        noMatch,
        ...sections,
      );

      const setHidden = (hidden) => store.merge('columns', { hidden });
      const hideable = () => DS.domain.listFields().filter((field) => !field.key).map((field) => field.id);
      // 絞り込み中は、見えている列だけを対象にする
      const shownIds = () => hideable().filter((id) => !checks.get(id).parentElement.hidden);

      function toggle(id, checked, row) {
        const hidden = new Set(store.get().columns.hidden);
        if (checked) hidden.delete(id);
        else hidden.add(id);
        setHidden(DS.domain.listFields().map((field) => field.id).filter((x) => hidden.has(x)));
        DS.util.flash(row);
      }

      showAll.addEventListener('click', () => {
        const targets = new Set(shownIds());
        setHidden(store.get().columns.hidden.filter((id) => !targets.has(id)));
        DS.util.flash(count);
      });
      hideAll.addEventListener('click', () => {
        const hidden = new Set(store.get().columns.hidden.concat(shownIds()));
        setHidden(DS.domain.listFields().map((field) => field.id).filter((id) => hidden.has(id)));
        DS.util.flash(count);
      });
      reset.addEventListener('click', () => {
        setHidden(DS.controllers.defaultColumns().hidden);
        DS.util.flash(count);
      });

      finder.addEventListener('input', () => {
        const needle = DS.util.foldForCompare(finder.value);
        let shown = 0;
        checks.forEach((box) => {
          const row = box.parentElement;
          row.hidden = Boolean(needle) && !row.dataset.name.includes(needle);
          if (!row.hidden) shown += 1;
        });
        sections.forEach((node) => { node.hidden = Array.from(node.querySelectorAll('.check')).every((row) => row.hidden); });
        noMatch.hidden = shown > 0;
        const label = needle ? '（探している列）' : '';
        showAll.lastChild.textContent = `すべて表示${label}`;
        hideAll.lastChild.textContent = `すべて隠す${label}`;
      });

      return {
        update(state) {
          const hidden = new Set(state.columns.hidden);
          checks.forEach((box, id) => { box.checked = !hidden.has(id); });
          const total = DS.domain.listFields().length;
          count.textContent = `表示 ${total - hidden.size} ／ ${total} 列`;
        },
      };
    },
  });
})();
