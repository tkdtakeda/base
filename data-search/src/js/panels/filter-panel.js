/* =========================================================
   脇のパネル「絞り込み」
   項目ごとに開閉できるまとまり。条件のある項目は開いた状態で出す。
   部品は絞り込みの種類（values / date）ごとに editors へ登録する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;
  const editors = DS.core.createRegistry('filterEditors');
  const SEARCH_BOX_FROM = 8; // 値がこの数を超えたら、値を探す欄を出す

  // ── 値から選ぶ ─────────────────────────────────────────
  editors.register({
    id: 'values',
    mount(container, field, ctx) {
      const finder = el('input', { type: 'search', className: 'input input--sm', placeholder: `${field.label}を探す`, 'aria-label': `${field.label}の値を探す`, hidden: true });
      const list = el('div', { className: 'value-list', role: 'group', 'aria-label': field.label });
      const note = el('p', { className: 'pane-note' });
      container.append(finder, list, note);
      let values = [];
      let token = 0;

      finder.addEventListener('input', () => draw(ctx.store.get()));

      function selected(state) {
        const spec = state.filters[field.id];
        return spec && spec.type === 'values' ? spec.values : [];
      }

      function toggle(value, checked, row) {
        const current = selected(ctx.store.get()).slice();
        const next = checked ? current.concat([value]) : current.filter((item) => item !== value);
        ctx.search.setFilter(field.id, { type: 'values', values: next });
        DS.util.flash(row);
      }

      function draw(state) {
        const chosen = selected(state);
        const query = DS.util.foldForCompare(finder.value);
        const known = new Set(values.map((entry) => entry.value));
        // 選んだが今の条件では 0 件の値も、外せるように残す
        const entries = values.concat(chosen.filter((value) => !known.has(value)).map((value) => ({ value, count: 0 })));
        finder.hidden = entries.length <= SEARCH_BOX_FROM;
        const shown = entries.filter((entry) => !query || DS.util.foldForCompare(entry.value === null ? DS.domain.filters.BLANK_LABEL : entry.value).includes(query));
        list.replaceChildren(...shown.map((entry) => {
          const box = el('input', { type: 'checkbox' });
          box.checked = chosen.includes(entry.value);
          const row = el('label', { className: `check check--value${entry.count === 0 ? ' is-zero' : ''}` }, [
            box,
            el('span', { className: `check__text${entry.value === null ? ' muted' : ''}`, text: entry.value === null ? DS.domain.filters.BLANK_LABEL : entry.value }),
            el('span', { className: 'check__count mono', text: `${DS.util.formatNumber(entry.count)} 件` }),
          ]);
          box.addEventListener('change', () => toggle(entry.value, box.checked, row));
          return row;
        }));
        if (shown.length === 0) list.replaceChildren(el('p', { className: 'pane-note', text: entries.length ? '一致する値はありません' : '値がありません' }));
      }

      async function load(state) {
        const request = state.search.request || {};
        const payload = { field: field.id, filters: DS.domain.filters.compact(state.filters) };
        if (request.keyword) Object.assign(payload, { searchType: request.searchType, keyword: request.keyword, matchMode: request.matchMode });
        const mine = ++token;
        try {
          const result = await ctx.api.call('get_filter_values', payload);
          if (mine !== token) return;
          values = result.values;
          note.textContent = result.truncated ? '値が多いため、件数の多い 200 個だけを出しています。上の欄で探せます。' : '件数は、ほかの絞り込みを当てはめたときの数です。';
          draw(ctx.store.get());
        } catch (error) {
          if (mine !== token) return;
          note.textContent = error.userMessage;
        }
      }

      return { load, draw };
    },
  });

  // ── 日付の範囲 ─────────────────────────────────────────
  editors.register({
    id: 'date',
    mount(container, field, ctx) {
      const type = DS.domain.filterTypes.get('date');
      const presetBox = el('div', { className: 'preset-list', role: 'group', 'aria-label': `${field.label}のよく使う範囲` });
      const customToggle = el('button', { type: 'button', className: 'link-btn' }, [icon('fa-sliders', ''), el('span', { text: '範囲を自分で決める' })]);
      const custom = el('div', { className: 'date-custom', hidden: true });
      container.append(presetBox, customToggle, custom);

      const current = () => ctx.store.get().filters[field.id];
      const apply = (spec) => ctx.search.setFilter(field.id, spec);

      type.presets.forEach((preset) => {
        const button = el('button', { type: 'button', className: 'preset', dataset: { preset: preset.id }, text: preset.label });
        button.addEventListener('click', () => {
          const active = type.presetOf(current());
          apply(active && active.id === preset.id ? type.empty() : { type: 'date', mode: 'relative', fromDays: preset.fromDays, toDays: preset.toDays });
          DS.util.flash(button);
        });
        presetBox.appendChild(button);
      });
      customToggle.addEventListener('click', () => {
        custom.hidden = !custom.hidden;
      });

      // 今日からの日数
      const dayInput = (label) => el('input', { type: 'text', inputmode: 'numeric', className: 'input input--sm input--num mono', maxlength: '4', 'aria-label': label });
      const dirSelect = (label) => el('select', { className: 'input input--sm', 'aria-label': label }, [el('option', { value: '-1', text: '日前' }), el('option', { value: '1', text: '日後' })]);
      const relFrom = dayInput('いつから（日数）');
      const relFromDir = dirSelect('いつから（前か後か）');
      const relTo = dayInput('いつまで（日数）');
      const relToDir = dirSelect('いつまで（前か後か）');
      relToDir.value = '1';
      const relApply = el('button', { type: 'button', className: 'btn btn--secondary btn--sm' }, [el('span', { text: 'この範囲にする' })]);

      // 日付そのもの（年 4 桁・月 2 桁・日 2 桁で次の欄へ）
      const ymd = (label) => {
        const y = el('input', { type: 'text', inputmode: 'numeric', className: 'input input--sm input--y mono', maxlength: '4', placeholder: '年', 'aria-label': `${label}の年` });
        const m = el('input', { type: 'text', inputmode: 'numeric', className: 'input input--sm input--md mono', maxlength: '2', placeholder: '月', 'aria-label': `${label}の月` });
        const d = el('input', { type: 'text', inputmode: 'numeric', className: 'input input--sm input--md mono', maxlength: '2', placeholder: '日', 'aria-label': `${label}の日` });
        return { y, m, d, node: el('span', { className: 'ymd' }, [y, el('span', { text: '/' }), m, el('span', { text: '/' }), d]) };
      };
      const absFrom = ymd('いつから');
      const absTo = ymd('いつまで');
      const absApply = el('button', { type: 'button', className: 'btn btn--secondary btn--sm' }, [el('span', { text: 'この範囲にする' })]);
      const message = el('p', { className: 'tag-editor__msg' });

      custom.append(
        el('p', { className: 'pane-note', text: '今日から数えた日数で決めると、タグにしても毎日そのまま使えます。空欄は「制限なし」です。' }),
        el('div', { className: 'date-row' }, [el('span', { className: 'date-row__label', text: 'いつから' }), relFrom, relFromDir]),
        el('div', { className: 'date-row' }, [el('span', { className: 'date-row__label', text: 'いつまで' }), relTo, relToDir]),
        relApply,
        el('p', { className: 'pane-note', text: '日付そのもので決める（タグにすると日付は固定されます）' }),
        el('div', { className: 'date-row' }, [el('span', { className: 'date-row__label', text: 'いつから' }), absFrom.node]),
        el('div', { className: 'date-row' }, [el('span', { className: 'date-row__label', text: 'いつまで' }), absTo.node]),
        absApply,
        message,
      );

      DS.util.autoAdvance([relFrom, relFromDir, relTo, relToDir, relApply]);
      DS.util.autoAdvance([absFrom.y, absFrom.m, absFrom.d, absTo.y, absTo.m, absTo.d, absApply]);

      const days = (input, dir) => (input.value.trim() === '' ? null : Number(input.value) * Number(dir.value));
      relApply.addEventListener('click', () => {
        if ([relFrom, relTo].some((input) => input.value.trim() !== '' && !/^\d+$/.test(input.value.trim()))) {
          message.textContent = '日数は 0 以上の数字で入れてください';
          return;
        }
        const spec = { type: 'date', mode: 'relative', fromDays: days(relFrom, relFromDir), toDays: days(relTo, relToDir) };
        if (spec.fromDays !== null && spec.toDays !== null && spec.fromDays > spec.toDays) {
          message.textContent = '「いつから」が「いつまで」より後になっています';
          return;
        }
        message.textContent = '';
        apply(spec);
      });

      const isoOf = (parts) => {
        const [y, m, d] = [parts.y.value.trim(), parts.m.value.trim(), parts.d.value.trim()];
        if (!y && !m && !d) return { ok: true, value: null };
        const value = `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        const date = new Date(Number(y), Number(m) - 1, Number(d));
        const valid = /^\d{4}$/.test(y) && date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d);
        return valid ? { ok: true, value } : { ok: false };
      };
      absApply.addEventListener('click', () => {
        const from = isoOf(absFrom);
        const to = isoOf(absTo);
        if (!from.ok || !to.ok) {
          message.textContent = '日付は 年（4 桁）・月・日 で正しく入れてください';
          return;
        }
        if (from.value && to.value && from.value > to.value) {
          message.textContent = '「いつから」が「いつまで」より後になっています';
          return;
        }
        message.textContent = '';
        apply({ type: 'date', mode: 'absolute', from: from.value, to: to.value });
      });

      function draw(state) {
        const spec = state.filters[field.id];
        const active = type.presetOf(spec);
        presetBox.querySelectorAll('.preset').forEach((button) => {
          const on = Boolean(active && active.id === button.dataset.preset);
          button.classList.toggle('is-active', on);
          button.setAttribute('aria-pressed', String(on));
        });
        // 自分で決めた範囲が当たっているときは、その中身を欄に出す
        if (spec && type.isActive(spec) && !active) custom.hidden = false;
      }

      return { load: draw, draw };
    },
  });

  // ── パネル本体 ─────────────────────────────────────────
  DS.panels.register({
    id: 'filters',
    order: 5,
    icon: 'fa-filter',
    label: '絞り込み',
    title: '絞り込み',
    badge(state) {
      const count = Object.keys(DS.domain.filters.compact(state.filters)).length;
      return count ? { tone: 'info', text: String(count), title: `${count} 項目で絞り込み中` } : null;
    },
    mount(container, ctx) {
      const summary = el('div', { className: 'filter-summary' });
      const sections = new Map();
      const opened = new Set();

      const body = el('div', { className: 'filter-sections' });
      DS.domain.filterFields().forEach((field) => {
        const content = el('div', { className: 'filter-section__body', hidden: true });
        const state = el('span', { className: 'filter-section__state' });
        const clear = el('button', { type: 'button', className: 'link-btn', hidden: true, text: '解除' });
        const header = el('button', { type: 'button', className: 'filter-section__head', 'aria-expanded': 'false' }, [
          icon('fa-chevron-right', '›', 'filter-section__chevron'),
          el('span', { className: 'filter-section__label', text: field.label }),
          state,
        ]);
        const section = el('section', { className: 'filter-section' }, [el('div', { className: 'filter-section__row' }, [header, clear]), content]);
        body.appendChild(section);
        const editor = editors.get(field.filter).mount(content, field, ctx);
        sections.set(field.id, { field, header, content, state, clear, section, editor, loaded: false });

        header.addEventListener('click', () => {
          if (opened.has(field.id)) opened.delete(field.id);
          else opened.add(field.id);
          update(ctx.store.get(), true);
        });
        clear.addEventListener('click', () => ctx.search.clearFilter(field.id));
      });

      // タグのファイル
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

      container.append(summary, body, el('section', { className: 'pane-section pane-section--end' }, [
        el('h3', { className: 'pane-section__title', text: 'タグの書き出し・読み込み' }), drop,
      ]));

      let lastSignature = null;
      let firstOpen = true;

      function update(state, force) {
        const filters = DS.domain.filters.compact(state.filters);
        const count = Object.keys(filters).length;

        // 最初に開いたときは、条件のある項目を開いておく
        if (firstOpen) {
          Object.keys(filters).forEach((id) => opened.add(id));
          firstOpen = false;
        }

        const clearAll = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', disabled: count === 0 }, [icon('fa-filter-circle-xmark', ''), el('span', { text: 'すべて解除' })]);
        clearAll.addEventListener('click', () => {
          const before = Object.assign({}, ctx.store.get().filters);
          const beforeTag = ctx.store.get().tags.activeId;
          ctx.search.setFilters({});
          ctx.toast.show({
            tone: 'info', message: '絞り込みをすべて解除しました', actionLabel: '元に戻す', timeout: 10000,
            onAction: () => {
              ctx.store.merge('tags', { activeId: beforeTag });
              ctx.search.setFilters(before);
            },
          });
        });
        summary.replaceChildren(
          el('p', { className: 'pane-note', text: count ? `${count} 項目で絞り込んでいます。項目どうしは「かつ」、同じ項目の中は「または」です。` : '項目を開いて条件を選ぶと、すぐ一覧に反映されます。' }),
          clearAll,
        );

        // 値の件数は、条件や番号の検索が変わったときだけ取り直す
        const request = state.search.request || {};
        const signature = JSON.stringify([filters, request.keyword || '', request.searchType, request.matchMode, state.cache.status && state.cache.status.cacheUpdatedAt]);
        const changed = signature !== lastSignature || force;
        lastSignature = signature;

        sections.forEach((entry, id) => {
          const spec = filters[id];
          const isOpen = opened.has(id);
          entry.content.hidden = !isOpen;
          entry.header.setAttribute('aria-expanded', String(isOpen));
          entry.section.classList.toggle('is-open', isOpen);
          entry.section.classList.toggle('is-active', Boolean(spec));
          entry.state.textContent = spec ? DS.domain.filters.describe(id, spec) : '';
          entry.clear.hidden = !spec;
          if (isOpen && (changed || !entry.loaded) && state.cache.status && state.cache.status.available) {
            entry.loaded = true;
            entry.editor.load(state);
          } else if (isOpen) {
            entry.editor.draw(state);
          }
        });
      }

      return { update: (state) => update(state, false) };
    },
  });
})();
