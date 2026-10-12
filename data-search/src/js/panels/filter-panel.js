/* =========================================================
   脇のパネル「絞り込み」：今かかっている条件の一覧

   絞り込みは一覧の見出しの漏斗（じょうご）から列ごとにかける。ここでは
     ・今の条件をまとめて見る（画面の外の列・隠している列の条件も分かる）
     ・条件ごとに開いて直す／外す、すべて解除（元に戻せる）
     ・列名から条件を足す（隠している列にもかけられる）
     ・タグのファイルの書き出し・読み込み
   をまとめる。条件を直す部品は見出しの小窓と同じ（views/filter-editors.js）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  DS.panels.register({
    id: 'filters',
    order: 5,
    icon: 'fa-filter',
    label: '絞り込み',
    title: '絞り込みの条件',
    badge(state) {
      const count = Object.keys(DS.domain.filters.compact(state.filters)).length;
      return count ? { tone: 'info', text: String(count), title: `${count} 列で絞り込み中` } : null;
    },
    mount(container, ctx) {
      const { store, bus } = ctx;
      const summary = el('div', { className: 'filter-summary' });
      const body = el('div', { className: 'filter-sections' });
      const sections = new Map();   // 列の id → { field, section, header, state, clear, content, editor }
      const opened = new Set();     // 開いている列
      const added = new Set();      // 「条件を足す」で出した列（まだ条件がなくても出しておく）

      // ── 条件を足す（列名で探して Enter） ──
      const picker = el('input', { type: 'search', className: 'input input--sm', placeholder: '列名を入れて Enter', list: 'filter-column-names',
        'aria-label': '絞り込む列を足す（列名を入れて Enter）', autocomplete: 'off' });
      const names = el('datalist', { id: 'filter-column-names' }, DS.domain.filterFields().map((field) => el('option', { value: field.label })));
      const pickerMessage = el('p', { className: 'pane-note', 'aria-live': 'polite' });
      const addBox = el('section', { className: 'pane-section' }, [
        el('h3', { className: 'pane-section__title', text: '条件を足す' }),
        el('div', { className: 'filter-add' }, [icon('fa-plus', '+'), picker, names]),
        pickerMessage,
      ]);
      DS.util.selectAllOnFocus(addBox);

      function addByName(text) {
        const needle = DS.util.foldForCompare(text);
        if (!needle) return;
        const all = DS.domain.filterFields();
        const field = all.find((f) => DS.util.foldForCompare(f.label) === needle) ||
          all.find((f) => DS.util.foldForCompare(f.label).includes(needle));
        if (!field) {
          pickerMessage.textContent = `「${text}」を含む列はありません`;
          DS.util.flash(pickerMessage);
          return;
        }
        pickerMessage.textContent = '';
        picker.value = '';
        focusField(field.id);
      }
      picker.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter') return;
        event.preventDefault();
        addByName(picker.value);
      });
      picker.addEventListener('change', () => addByName(picker.value)); // 候補から選んだとき

      /** その列の条件を開いて、最初に操作する場所へ移る（札・見出しから呼ばれる） */
      function focusField(fieldId) {
        added.add(fieldId);
        opened.add(fieldId);
        update(store.get(), true);
        const entry = sections.get(fieldId);
        if (!entry) return;
        entry.section.scrollIntoView({ block: 'nearest' });
        DS.util.flash(entry.section);
        window.requestAnimationFrame(() => entry.editor && entry.editor.focus());
      }
      bus.on('filters:focus', (fieldId) => window.setTimeout(() => focusField(fieldId), 0));

      function sectionFor(field) {
        if (sections.has(field.id)) return sections.get(field.id);
        const content = el('div', { className: 'filter-section__body', hidden: true });
        const stateText = el('span', { className: 'filter-section__state' });
        const clear = el('button', { type: 'button', className: 'icon-btn', title: `${field.label}の条件を外す`, 'aria-label': `${field.label}の条件を外す` }, [icon('fa-xmark', '×')]);
        const header = el('button', { type: 'button', className: 'filter-section__head', 'aria-expanded': 'false' }, [
          icon('fa-chevron-right', '›', 'filter-section__chevron'),
          icon(field.filter === 'date' ? 'fa-calendar-days' : 'fa-list-check', '', 'filter-section__kind'),
          el('span', { className: 'filter-section__label', text: field.label }),
          stateText,
        ]);
        const section = el('section', { className: 'filter-section' }, [el('div', { className: 'filter-section__row' }, [header, clear]), content]);
        const entry = { field, section, header, state: stateText, clear, content, editor: null, loaded: false };
        header.addEventListener('click', () => {
          if (opened.has(field.id)) opened.delete(field.id);
          else opened.add(field.id);
          update(store.get(), true);
        });
        clear.addEventListener('click', () => {
          added.delete(field.id);
          opened.delete(field.id);
          if (DS.domain.filters.compact(store.get().filters)[field.id]) ctx.search.clearFilter(field.id);
          else update(store.get(), true);
        });
        sections.set(field.id, entry);
        return entry;
      }

      // ── タグのファイル ──
      const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
      const exportButton = el('button', { type: 'button', className: 'btn btn--ghost btn--sm' }, [icon('fa-file-export', ''), el('span', { text: '書き出す' })]);
      const importButton = el('button', { type: 'button', className: 'btn btn--ghost btn--sm' }, [icon('fa-file-import', ''), el('span', { text: '読み込む' })]);
      const drop = el('div', { className: 'drop-zone' }, [
        el('div', { className: 'drop-zone__actions' }, [exportButton, importButton]),
        el('p', { className: 'pane-note', text: 'タグのファイル（.json）はここへドラッグ＆ドロップしても読み込めます。ほかの人に渡せば同じタグを使えます。' }),
        fileInput,
      ]);
      exportButton.addEventListener('click', () => ctx.tags.exportFile());
      importButton.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) ctx.tags.importFile(fileInput.files[0]);
        fileInput.value = '';
      });
      drop.addEventListener('dragover', (event) => {
        event.preventDefault();
        drop.classList.add('is-over');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
      drop.addEventListener('drop', (event) => {
        event.preventDefault();
        drop.classList.remove('is-over');
        const file = event.dataTransfer.files[0];
        if (file) ctx.tags.importFile(file);
      });

      container.append(summary, body, addBox, el('section', { className: 'pane-section pane-section--end' }, [
        el('h3', { className: 'pane-section__title', text: 'タグの書き出し・読み込み' }), drop,
      ]));

      let lastSignature = null;
      let firstOpen = true;

      function clearAll() {
        const before = Object.assign({}, store.get().filters);
        const beforeTag = store.get().tags.activeId;
        added.clear();
        ctx.search.setFilters({});
        ctx.toast.show({
          tone: 'info', message: '絞り込みをすべて解除しました', actionLabel: '元に戻す', timeout: 10000,
          onAction: () => {
            store.merge('tags', { activeId: beforeTag });
            ctx.search.setFilters(before);
          },
        });
      }

      function update(state, force) {
        const filters = DS.domain.filters.compact(state.filters);
        const count = Object.keys(filters).length;

        // 最初に開いたときは、条件のある列を開いておく
        if (firstOpen) {
          Object.keys(filters).forEach((id) => opened.add(id));
          firstOpen = false;
        }

        const clearButton = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', disabled: count === 0 }, [icon('fa-filter-circle-xmark', ''), el('span', { text: 'すべて解除' })]);
        clearButton.addEventListener('click', clearAll);
        summary.replaceChildren(
          el('p', { className: 'pane-note', text: count
            ? `${count} 列で絞り込んでいます。列どうしは「かつ」、同じ列の中は「または」です。`
            : '一覧の見出しの漏斗（じょうご）のアイコンから、どの列でも絞り込めます。隠している列は下の「条件を足す」から。' }),
          clearButton,
        );

        // 値の件数は、条件や番号の検索が変わったときだけ取り直す
        const request = state.search.request || {};
        const signature = JSON.stringify([filters, request.keyword || '', request.matchMode, state.cache.status && state.cache.status.cacheUpdatedAt]);
        const changed = signature !== lastSignature || force;
        lastSignature = signature;

        // 出す列：条件のある列と、「条件を足す」で出した列（列の並びの順）
        const shown = DS.domain.filterFields().filter((field) => filters[field.id] || added.has(field.id));
        body.replaceChildren(...shown.map((field) => sectionFor(field).section));
        body.hidden = shown.length === 0;

        shown.forEach((field) => {
          const entry = sections.get(field.id);
          const spec = filters[field.id];
          const isOpen = opened.has(field.id);
          entry.content.hidden = !isOpen;
          entry.header.setAttribute('aria-expanded', String(isOpen));
          entry.section.classList.toggle('is-open', isOpen);
          entry.section.classList.toggle('is-active', Boolean(spec));
          entry.state.textContent = spec ? DS.domain.filters.describe(field.id, spec) : '条件なし';
          if (!isOpen) return;
          if (!entry.editor) entry.editor = DS.filterEditors.get(field.filter).mount(entry.content, field, ctx);
          if ((changed || !entry.loaded) && state.cache.status && state.cache.status.available) {
            entry.loaded = true;
            entry.editor.load(state);
          } else {
            entry.editor.draw(state);
          }
        });
      }

      return { update: (state) => update(state, false) };
    },
  });
})();
