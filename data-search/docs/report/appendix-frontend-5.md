## 付録：1 件を決める列の選択・全列の絞り込みで足した・書き直した画面側のファイルの全文

`src/js/views/filter-editors.js`

```javascript
/* =========================================================
   絞り込みの部品（種類ごとに 1 つ）。見出しの小窓（column-filter.js）と
   脇のパネル（filter-panel.js）の両方で、同じ部品を使う。

     DS.filterEditors.register({ id: 種類, mount(container, field, ctx) → { load(state), draw(state), focus() } })
       load  … 値の一覧などを取り直して描く（条件・検索・データが変わったとき）
       draw  … 今の状態で描き直すだけ
       focus … 最初に操作する場所へ移る

   種類を増やすときは register() を足すだけでよい（domain/filters.js の filterTypes も足す）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;
  const editors = DS.core.createRegistry('filterEditors');
  const SEARCH_BOX_FROM = 8; // 値がこの数を超えたら、値を探す欄を出す
  const MATCH_WAIT_MS = 250; // 値を探す文字を打ち終えてから、データに問い合わせるまで

  /** 値の一覧を取るときの条件（番号の検索と、ほかの絞り込みを反映する） */
  function valuesPayload(state, field, match) {
    const request = state.search.request || {};
    const payload = { field: field.id, filters: DS.domain.filters.compact(state.filters) };
    if (request.keyword) Object.assign(payload, { keyword: request.keyword, matchMode: request.matchMode });
    if (match) payload.match = match;
    return payload;
  }

  // ── 値から選ぶ ─────────────────────────────────────────
  editors.register({
    id: 'values',
    mount(container, field, ctx) {
      const finder = el('input', { type: 'search', className: 'input input--sm', placeholder: `${field.label}の値を探す`, 'aria-label': `${field.label}の値を探す`, hidden: true });
      const bulk = el('div', { className: 'value-bulk', hidden: true });
      const selectShown = el('button', { type: 'button', className: 'link-btn' }, [icon('fa-square-check', ''), el('span', { text: '表示中をすべて選ぶ' })]);
      const clearChosen = el('button', { type: 'button', className: 'link-btn' }, [icon('fa-square', ''), el('span', { text: '選択を外す' })]);
      bulk.append(selectShown, clearChosen);
      const list = el('div', { className: 'value-list', role: 'group', 'aria-label': field.label });
      const note = el('p', { className: 'pane-note' });
      container.append(finder, bulk, list, note);
      let values = [];
      let truncated = false;
      let loadedMatch = '';
      let token = 0;
      let shownValues = [];

      // 値が多い列（上位 200 個しか出ていない）では、打った文字でデータに問い合わせ直す
      const remoteFind = DS.util.debounce(() => load(ctx.store.get()), MATCH_WAIT_MS);
      finder.addEventListener('input', () => {
        draw(ctx.store.get());
        if (truncated || loadedMatch) remoteFind();
      });
      finder.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter') return;
        event.preventDefault();
        const first = list.querySelector('input[type="checkbox"]');
        if (first) first.focus(); // Enter で値の一覧へ（Space で選ぶ）
      });

      function selected(state) {
        const spec = state.filters[field.id];
        return spec && spec.type === 'values' ? spec.values : [];
      }

      function setValues(next) {
        ctx.search.setFilter(field.id, { type: 'values', values: next });
      }

      function toggle(value, checked, row) {
        const current = selected(ctx.store.get()).slice();
        setValues(checked ? current.concat([value]) : current.filter((item) => item !== value));
        DS.util.flash(row);
      }

      selectShown.addEventListener('click', () => {
        const current = selected(ctx.store.get());
        setValues(current.concat(shownValues.filter((value) => !current.includes(value))));
        DS.util.flash(list);
      });
      clearChosen.addEventListener('click', () => {
        setValues([]);
        DS.util.flash(list);
      });

      function draw(state) {
        const chosen = selected(state);
        const query = DS.util.foldForCompare(finder.value);
        const known = new Set(values.map((entry) => entry.value));
        // 選んだが今の条件では 0 件の値も、外せるように残す
        const entries = values.concat(chosen.filter((value) => !known.has(value)).map((value) => ({ value, count: 0 })));
        finder.hidden = entries.length <= SEARCH_BOX_FROM && !truncated && !loadedMatch;
        const shown = entries.filter((entry) => !query || DS.util.foldForCompare(entry.value === null ? DS.domain.filters.BLANK_LABEL : entry.value).includes(query));
        shownValues = shown.map((entry) => entry.value);
        bulk.hidden = finder.hidden;
        clearChosen.disabled = chosen.length === 0;
        list.replaceChildren(...shown.map((entry) => {
          const box = el('input', { type: 'checkbox' });
          box.checked = chosen.includes(entry.value);
          const row = el('label', { className: `check check--value${entry.count === 0 ? ' is-zero' : ''}${box.checked ? ' is-checked' : ''}` }, [
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
        const match = DS.util.normalize(finder.value);
        const mine = ++token;
        try {
          const result = await ctx.api.call('get_filter_values', valuesPayload(state, field, truncated || loadedMatch ? match : ''));
          if (mine !== token) return;
          values = result.values;
          loadedMatch = result.match || '';
          truncated = Boolean(result.truncated) || Boolean(loadedMatch && truncated);
          note.textContent = result.truncated
            ? '値が多いため、件数の多い 200 個だけを出しています。上の欄に打つと、データ全体から探します。'
            : loadedMatch ? `「${loadedMatch}」を含む値をデータ全体から探しました。` : '件数は、ほかの絞り込みを当てはめたときの数です。';
          draw(ctx.store.get());
        } catch (error) {
          if (mine !== token) return;
          note.textContent = error.userMessage;
        }
      }

      function focus() {
        if (!finder.hidden) finder.focus();
        else {
          const first = list.querySelector('input[type="checkbox"]');
          if (first) first.focus();
        }
      }

      return { load, draw, focus };
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

      return { load: draw, draw, focus: () => { const button = presetBox.querySelector('.preset'); if (button) button.focus(); } };
    },
  });

  DS.filterEditors = editors;
})();
```

`src/js/views/column-filter.js`

```javascript
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
```

`src/js/panels/filter-panel.js`

```javascript
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
```

`src/js/views/record-key-editor.js`

```javascript
/* =========================================================
   「データ」パネルの「固定列」：今の列の表示・確認・変更

   ふだんは今の列（左端に固定する列）と、番号で探す列だけを出す。
   変更では、列名を入れて Enter で次の欄へ → 「確かめる」で 1 件に決まるかを数える
   → 確かめた組み合わせなら「保存」できる（重なりがあれば △ で知らせる。保存はできる）。
   入力を変えたら、前の結果は使えない（もう一度確かめる）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;
  const KEY_MAX = 3;

  function button(className, iconName, text) {
    const node = el('button', { type: 'button', className: `btn ${className}` });
    node.dataset.icon = iconName;
    node.replaceChildren(icon(iconName, ''), el('span', { text }));
    return node;
  }

  function setBusy(node, busy, busyText, text) {
    node.replaceChildren(icon(busy ? 'fa-spinner' : node.dataset.icon, '', busy ? 'fa-spin' : ''), el('span', { text: busy ? busyText : text }));
  }

  /** 入力された列名 → 列（大文字小文字・全角半角を区別しない完全一致）。空なら null、ないときは undefined */
  function fieldByName(text) {
    const needle = DS.util.foldForCompare(text);
    if (!needle) return null;
    return DS.domain.listFields().find((field) => DS.util.foldForCompare(field.label) === needle);
  }

  function chip(field, iconName) {
    return el('span', { className: 'key-chip mono', title: field.label }, [icon(iconName, ''), el('span', { text: field.label })]);
  }

  function renderResult(result) {
    if (!result) return [];
    const total = DS.util.formatNumber(result.rowCount);
    const nodes = [];
    if (result.unique) {
      nodes.push(el('p', { className: 'source-result__summary is-ok' }, [icon('fa-circle-check', '○'),
        el('span', { text: ` 1 件に決まります（${total} 行すべて）` })]));
    } else {
      const example = result.example
        ? Object.values(result.example.values).map((value) => (value === null || value === '' ? '（空欄）' : value)).join('・')
        : '';
      nodes.push(el('p', { className: 'source-result__summary is-warn' }, [icon('fa-triangle-exclamation', '△'),
        el('span', { text: ` 同じ組み合わせが ${DS.util.formatNumber(result.duplicateGroups)} 組（${DS.util.formatNumber(result.duplicateRows)} 行）あります` })]));
      if (example) nodes.push(el('p', { className: 'pane-note mono', text: `例：${example}（${DS.util.formatNumber(result.example.count)} 行）` }));
      nodes.push(el('p', { className: 'pane-note', text: '保存はできますが、詳細には重なった中の最初の 1 件を出します。列を足すと 1 件に決まることがあります。' }));
    }
    if (result.blankRows) {
      nodes.push(el('p', { className: 'pane-note is-warning', text: `選んだ列がすべて空欄の行が ${DS.util.formatNumber(result.blankRows)} 行あります。` }));
    }
    return nodes;
  }

  function createRecordKeyEditor(ctx) {
    const { record, store } = ctx;
    const root = el('div', { className: 'record-key' });
    const current = el('div', { className: 'record-key__current' });
    const editButton = button('btn--secondary btn--sm', 'fa-pen', '変更');
    const viewRow = el('div', { className: 'source__actions' }, [editButton]);

    const names = el('datalist', { id: 'record-column-names' });
    const slotInput = (index) => el('input', { type: 'text', className: 'input input--sm mono', list: 'record-column-names', autocomplete: 'off', spellcheck: 'false',
      placeholder: index === 0 ? '列名（必須）' : '列名（なくてよい）', 'aria-label': `固定列の ${index + 1} つ目` });
    const slots = Array.from({ length: KEY_MAX }, (_, index) => slotInput(index));
    const searchInput = el('input', { type: 'text', className: 'input input--sm mono', list: 'record-column-names', autocomplete: 'off', spellcheck: 'false',
      'aria-label': '番号で探す列' });
    const message = el('p', { className: 'tag-editor__msg', 'aria-live': 'polite' });
    const testButton = button('btn--secondary btn--sm', 'fa-list-check', '確かめる');
    const saveButton = button('btn--primary btn--sm', 'fa-floppy-disk', '保存');
    const cancelButton = button('btn--ghost btn--sm', 'fa-xmark', 'やめる');
    const stale = el('p', { className: 'pane-note is-warning', hidden: true, text: '入力が変わりました。もう一度確かめてください。' });
    const editBox = el('div', { className: 'source__edit', hidden: true }, [
      el('p', { className: 'pane-note', text: '行を 1 件に決める列を 1〜3 つ、DB の列名で選びます。一覧の左端に固定されます。Enter で次の欄へ移ります。' }),
      el('ol', { className: 'record-key__slots' }, slots.map((input) => el('li', {}, [input]))),
      el('label', { className: 'record-key__search' }, [el('span', { className: 'pane-note', text: '番号で探す列（上部バーの入力欄）' }), searchInput]),
      message,
      el('div', { className: 'source__actions' }, [testButton, saveButton, cancelButton]),
      stale,
      names,
    ]);
    const resultBox = el('div', { className: 'source-result', 'aria-live': 'polite' });
    const savedTo = el('p', { className: 'pane-note' });
    root.append(current, viewRow, editBox, resultBox, savedTo);
    DS.util.autoAdvance(slots.concat([searchInput, testButton]));

    let editing = false;

    /** 入力から列を読む。誤りがあれば { error } */
    function readInput() {
      const picked = [];
      for (let index = 0; index < slots.length; index += 1) {
        const field = fieldByName(slots[index].value);
        if (field === undefined) return { error: `「${slots[index].value}」という列はありません。候補から選んでください`, node: slots[index] };
        if (field && picked.includes(field.id)) return { error: `「${field.label}」が重なっています`, node: slots[index] };
        if (field) picked.push(field.id);
      }
      if (picked.length === 0) return { error: '1 つ目の列を入れてください', node: slots[0] };
      const search = fieldByName(searchInput.value);
      if (search === undefined) return { error: `「${searchInput.value}」という列はありません`, node: searchInput };
      return { names: picked, searchColumn: search ? search.id : picked[0] };
    }

    function setEditing(on) {
      editing = on;
      editBox.hidden = !on;
      viewRow.hidden = on;
      message.textContent = '';
      record.reset();
      if (!on) return;
      names.replaceChildren(...DS.domain.listFields().map((field) => el('option', { value: field.label })));
      const keys = DS.domain.keyFields();
      slots.forEach((input, index) => { input.value = keys[index] ? keys[index].label : ''; });
      const search = DS.domain.searchField();
      searchInput.value = search && (!keys[0] || search.id !== keys[0].id) ? search.label : '';
      searchInput.placeholder = '空欄なら 1 つ目の列で探す';
      slots[0].focus();
    }

    editButton.addEventListener('click', () => setEditing(true));
    cancelButton.addEventListener('click', () => setEditing(false));
    testButton.addEventListener('click', async () => {
      const input = readInput();
      if (input.error) {
        message.textContent = input.error;
        DS.util.flash(message);
        input.node.focus();
        return;
      }
      message.textContent = '';
      const result = await record.check(input.names);
      if (result) saveButton.focus();
    });
    saveButton.addEventListener('click', () => {
      const input = readInput();
      if (!input.error) record.save(input.names, input.searchColumn);
    });
    editBox.addEventListener('input', () => update(store.get()));
    editBox.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      setEditing(false);
    });

    function update(state) {
      const info = state.record;
      const keys = DS.domain.keyFields();
      const search = DS.domain.searchField();
      const nodes = [];
      if (keys.length) {
        nodes.push(el('div', { className: 'key-chips' }, keys.map((field) => chip(field, 'fa-key'))));
      } else {
        nodes.push(el('p', { className: 'record-key__missing' }, [icon('fa-circle-exclamation', '!'),
          el('span', { text: '決まっていません。行の詳細を開くには、下の「変更」から固定列を選んでください。' })]));
      }
      nodes.push(el('p', { className: 'pane-note' }, search
        ? [el('span', { text: '番号で探す列：' }), el('strong', { className: 'mono', text: search.label })]
        : [el('span', { text: '番号で探す列：決まっていません' })]));
      current.replaceChildren(...nodes);
      editButton.disabled = !(state.cache.status && state.cache.status.available);
      editButton.title = editButton.disabled ? 'データがあるときに選べます' : '';

      const input = editing ? readInput() : null;
      testButton.disabled = info.status !== 'idle';
      setBusy(testButton, info.status === 'checking', '数えています…', '確かめる');
      saveButton.disabled = !input || Boolean(input.error) || !record.canSave(input.names);
      setBusy(saveButton, info.status === 'saving', '保存しています…', '保存');
      const changed = editing && info.result && (!input || input.error || !record.canSave(input.names)) && info.status === 'idle';
      stale.hidden = !changed;
      resultBox.classList.toggle('is-stale', Boolean(changed));
      resultBox.replaceChildren(...(editing ? renderResult(info.result) : []));
      const file = DS.domain.recordSettingsFile();
      savedTo.textContent = file ? `保存先：${file}（recordKey・searchColumn）` : '';
    }

    return {
      element: root,
      update,
      /** 「固定列を選ぶ」から呼ばれる：変更を始めて、その場所を見せる */
      startEditing() {
        if (editButton.disabled) return;
        if (!editing) setEditing(true);
        root.scrollIntoView({ block: 'nearest' });
        DS.util.flash(root);
      },
    };
  }

  DS.views.createRecordKeyEditor = createRecordKeyEditor;
})();
```

`src/js/controllers/record-controller.js`

```javascript
/* =========================================================
   固定列（schema.recordKey）と番号で探す列（schema.searchColumn）の確認・保存

     check(names)                選んだ列の組み合わせで 1 件に決まるかを数える（保存はしない）
     save(names, searchColumn)   確かめた組み合わせだけ保存できる → schema.local.json に保存
                                 → 列の並び・左端の固定・探す列が変わるため、画面を読み込み直す
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const RELOAD_WAIT_MS = 1200;

  const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);

  function createRecordController({ store, api, toast }) {
    const set = (patch) => store.merge('record', patch);

    async function check(names) {
      set({ status: 'checking', result: null, checked: null });
      try {
        const result = await api.call('check_record_key', { recordKey: names });
        set({ status: 'idle', result, checked: names.slice() });
        return result;
      } catch (error) {
        set({ status: 'idle' });
        toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
        return null;
      }
    }

    /** 確かめた組み合わせと同じときだけ保存できる（重なりがあっても保存はできる。画面で注意を出す） */
    function canSave(names) {
      const { result, checked, status } = store.get().record;
      return status === 'idle' && Boolean(result) && sameList(checked, names);
    }

    async function save(names, searchColumn) {
      if (!canSave(names)) return false;
      set({ status: 'saving' });
      try {
        const result = await api.call('update_record_settings', { recordKey: names, searchColumn: searchColumn || null });
        toast.show({ tone: 'success', message: `${result.message}画面を読み込み直します`, timeout: RELOAD_WAIT_MS + 1000 });
        // 列の並び・左端に固定する列・探す列が変わるため、表示定義から組み立て直す（選んだ列・幅・タグは残る）
        window.setTimeout(() => window.location.reload(), RELOAD_WAIT_MS);
        return true;
      } catch (error) {
        set({ status: 'idle' });
        toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
        return false;
      }
    }

    function reset() {
      set({ status: 'idle', result: null, checked: null });
    }

    return { check, canSave, save, reset };
  }

  DS.controllers.createRecordController = createRecordController;
})();
```

`src/js/controllers/tag-controller.js`

```javascript
/* =========================================================
   絞り込みタグ：今の絞り込み条件に名前を付けて保存し、次回以降は押すだけで使う。
   ブラウザに自動で保存し、JSON ファイルへの書き出し・読み込みもできる（ほかの人と共有するため）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const STORAGE_KEY = 'tags';
  const FILE_KIND = 'data-search/filter-tags';
  const FILE_VERSION = 1;
  const NAME_MAX = 30;
  const TAGS_MAX = 50;

  /**
   * 保存したタグを読む。以前の形（別名＝論理名）で保存した列の名前は、DB の列名に読み替えて保存し直す。
   * 今の DB にない列の条件は消さずに残す（別の読み込み先へ戻したときに使えるように）。押したときに外す。
   */
  DS.controllers.loadTags = () => {
    const stored = DS.core.storage.read(STORAGE_KEY, []);
    const items = Array.isArray(stored) ? stored.filter(isValidTag) : [];
    let migrated = false;
    const result = items.map((tag) => {
      const filters = {};
      Object.entries(tag.filters).forEach(([fieldId, spec]) => {
        const id = DS.domain.migrateId(fieldId);
        if (id !== fieldId) migrated = true;
        filters[id] = spec;
      });
      return Object.assign({}, tag, { filters });
    });
    if (migrated) DS.core.storage.write(STORAGE_KEY, result);
    return result;
  };

  /** 知らない項目や壊れた条件は捨てる（設定ファイルを手で直した場合などに備える） */
  function isValidTag(tag) {
    return tag && typeof tag.id === 'string' && typeof tag.name === 'string' && tag.filters && typeof tag.filters === 'object';
  }

  /** 今の列で使える条件だけを残す（以前の形の列名は読み替える。ない列・種類の違う条件は外す） */
  function sanitizeFilters(filters) {
    const result = {};
    Object.entries(filters || {}).forEach(([name, spec]) => {
      const fieldId = DS.domain.migrateId(name);
      const field = DS.domain.fields.get(fieldId);
      if (field && field.filter && spec && spec.type === field.filter) result[fieldId] = spec;
    });
    return DS.domain.filters.compact(result);
  }

  function createTagController({ store, bus, toast, search }) {
    const items = () => store.get().tags.items;

    // 絞り込みがすべて外れたら、タグの選択も外す
    bus.on('state', ({ state, changed }) => {
      if (changed.includes('filters') && state.tags.activeId && Object.keys(DS.domain.filters.compact(state.filters)).length === 0) {
        store.merge('tags', { activeId: null });
      }
    });

    function commit(nextItems, activeId) {
      const result = DS.core.storage.write(STORAGE_KEY, nextItems);
      store.set({ tags: { items: nextItems, activeId: activeId === undefined ? store.get().tags.activeId : activeId } });
      if (!result.ok) toast.show({ tone: 'warning', message: `タグをブラウザに保存できませんでした：${result.reason}` });
      return result.ok;
    }

    /** 今の条件と、選んでいるタグの条件が違うか */
    function isModified() {
      const tag = items().find((item) => item.id === store.get().tags.activeId);
      return Boolean(tag) && !DS.domain.filters.sameFilters(tag.filters, store.get().filters);
    }

    /** 名前を確かめる。問題があれば理由を返す */
    function validateName(name, exceptId) {
      const value = DS.util.normalize(name);
      if (!value) return { ok: false, reason: 'タグの名前を入れてください' };
      if (value.length > NAME_MAX) return { ok: false, reason: `名前は ${NAME_MAX} 文字以内にしてください` };
      if (items().some((item) => item.id !== exceptId && item.name === value)) return { ok: false, reason: '同じ名前のタグがあります' };
      return { ok: true, value };
    }

    function canSave() {
      if (Object.keys(DS.domain.filters.compact(store.get().filters)).length === 0) return { ok: false, reason: '絞り込みを選ぶと、その条件をタグにできます' };
      if (items().length >= TAGS_MAX) return { ok: false, reason: `タグは ${TAGS_MAX} 個までです。使わないタグを消してください` };
      return { ok: true };
    }

    function save(name) {
      const check = validateName(name);
      if (!check.ok) return check;
      const tag = {
        id: 'tag-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: check.value,
        filters: DS.domain.filters.compact(store.get().filters),
        createdAt: new Date().toISOString(),
      };
      commit(items().concat(tag), tag.id);
      toast.show({ tone: 'success', message: `タグ「${tag.name}」を保存しました。次回からは押すだけで同じ絞り込みになります` });
      return { ok: true, tag };
    }

    function overwrite(id) {
      const filters = DS.domain.filters.compact(store.get().filters);
      const target = items().find((item) => item.id === id);
      commit(items().map((item) => (item.id === id ? Object.assign({}, item, { filters, updatedAt: new Date().toISOString() }) : item)), id);
      toast.show({ tone: 'success', message: `タグ「${target.name}」を今の条件で上書きしました` });
    }

    function rename(id, name) {
      const check = validateName(name, id);
      if (!check.ok) return check;
      commit(items().map((item) => (item.id === id ? Object.assign({}, item, { name: check.value }) : item)));
      return { ok: true };
    }

    /** 消す。確認ダイアログではなく「元に戻す」を出す */
    function remove(id) {
      const before = items();
      const target = before.find((item) => item.id === id);
      const wasActive = store.get().tags.activeId === id;
      commit(before.filter((item) => item.id !== id), wasActive ? null : undefined);
      toast.show({
        tone: 'info',
        message: `タグ「${target.name}」を消しました`,
        actionLabel: '元に戻す',
        timeout: 10000,
        onAction: () => commit(before, wasActive ? id : undefined),
      });
    }

    /** タグを押す：その条件で絞り込む。選んでいるタグをもう一度押すと解除（すべて） */
    function apply(id) {
      if (id === null || store.get().tags.activeId === id && !isModified()) {
        store.merge('tags', { activeId: null });
        return search.setFilters({});
      }
      const tag = items().find((item) => item.id === id);
      const filters = sanitizeFilters(JSON.parse(JSON.stringify(tag.filters)));
      const skipped = Object.keys(tag.filters).length - Object.keys(filters).length;
      if (skipped > 0) toast.show({ tone: 'warning', message: `タグ「${tag.name}」の条件のうち ${skipped} 列は、今のデータにないため外して絞り込みました` });
      store.merge('tags', { activeId: id });
      return search.setFilters(filters);
    }

    function move(id, delta) {
      const list = items().slice();
      const index = list.findIndex((item) => item.id === id);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= list.length) return;
      [list[index], list[next]] = [list[next], list[index]];
      commit(list);
    }

    // ── ファイル ──
    function exportFile() {
      if (items().length === 0) {
        toast.show({ tone: 'warning', message: '書き出すタグがありません' });
        return;
      }
      const data = { kind: FILE_KIND, version: FILE_VERSION, exportedAt: new Date().toISOString(), tags: items() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = DS.util.el('a', { href: URL.createObjectURL(blob), download: `絞り込みタグ_${DS.domain.filters.todayIso()}.json` });
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast.show({ tone: 'success', message: `タグ ${items().length} 個をファイルに書き出しました` });
    }

    /** 読み込み：同じ名前は上書きせず「(2)」を付けて足す */
    async function importFile(file) {
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch (error) {
        toast.show({ tone: 'danger', message: 'ファイルを読めませんでした。書き出したタグのファイル（.json）を選んでください' });
        return;
      }
      if (!data || data.kind !== FILE_KIND || !Array.isArray(data.tags)) {
        toast.show({ tone: 'danger', message: 'タグのファイルではありません。このツールで書き出したファイルを選んでください' });
        return;
      }
      const current = items().slice();
      let added = 0;
      let skipped = 0;
      data.tags.filter(isValidTag).forEach((tag) => {
        const filters = sanitizeFilters(tag.filters);
        if (Object.keys(filters).length === 0 || current.length >= TAGS_MAX) {
          skipped += 1;
          return;
        }
        let name = DS.util.normalize(tag.name).slice(0, NAME_MAX);
        for (let n = 2; current.some((item) => item.name === name); n += 1) name = `${DS.util.normalize(tag.name).slice(0, NAME_MAX - 4)}(${n})`;
        current.push({ id: 'tag-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, filters, createdAt: new Date().toISOString() });
        added += 1;
      });
      commit(current);
      toast.show({
        tone: added ? 'success' : 'warning',
        message: `タグを ${added} 個読み込みました${skipped ? `（${skipped} 個は条件が使えないか上限のため読み込みませんでした）` : ''}`,
      });
    }

    return { isModified, validateName, canSave, save, overwrite, rename, remove, apply, move, exportFile, importFile, NAME_MAX };
  }

  DS.controllers.createTagController = createTagController;
})();
```

`src/css/filters.css`

```css
/* =========================================================
   絞り込み：タグの列・今かかっている条件の札・見出しの漏斗と小窓・絞り込みのパネル
   ========================================================= */

/* ── タグの列（一覧のすぐ上） ── */
.tagbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 44px;
  padding: var(--sp-1) var(--sp-4);
  border-bottom: var(--bw) solid var(--color-border);
  background: var(--color-surface-alt);
}

.tagbar__label {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  color: var(--color-text-muted);
}

.tagbar__list {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: 2px 0;
  overflow-x: auto;
}

.tagbar__tools { display: flex; flex-shrink: 0; align-items: center; gap: var(--sp-2); }
.tagbar__hint { font-size: var(--fs-xs); color: var(--color-text-subtle); }

.tag {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--sp-1);
  height: var(--h-control-sm);
  padding: 0 var(--sp-3);
  border: var(--bw) solid var(--color-border-strong);
  border-radius: var(--r-pill);
  background: var(--color-surface);
  font-size: var(--fs-sm);
  white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}

.tag:hover { border-color: var(--color-primary-border); background: var(--color-primary-soft); }

.tag.is-active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-text-inverse);
  font-weight: var(--fw-bold);
}

.tag-group { position: relative; display: inline-flex; flex-shrink: 0; align-items: center; gap: 2px; }

.tag__overwrite {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--h-control-sm);
  padding: 0 var(--sp-2);
  border: var(--bw) solid var(--color-warning-border);
  border-radius: var(--r-pill);
  background: var(--color-warning-bg);
  color: var(--color-warning);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}

.tag__modified { display: inline-flex; align-items: center; gap: 2px; }
.tag__modified i { font-size: 7px; }

.tag__more {
  width: 22px;
  height: var(--h-control-sm);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--color-text-muted);
}

.tag__more:hover { background: var(--color-surface-sunken); }

.tag-menu {
  position: fixed;
  z-index: var(--z-panel);
  display: flex;
  flex-direction: column;
  min-width: 180px;
  padding: var(--sp-1);
  border: var(--bw) solid var(--color-border);
  border-radius: var(--r-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}

.tag-menu__item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-3);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
}

.tag-menu__item:hover:not(:disabled) { background: var(--color-surface-sunken); }
.tag-menu__item:disabled { color: var(--color-border-strong); }
.tag-menu__item.is-danger { color: var(--color-danger); }
.tag-menu__sep { width: 100%; margin: var(--sp-1) 0; border: 0; border-top: var(--bw) solid var(--color-border); }

.tag-editor { display: inline-flex; flex-shrink: 0; align-items: center; gap: var(--sp-1); }
.tag-editor__input { width: 240px; }
.tag-editor__msg { font-size: var(--fs-xs); color: var(--color-danger); font-weight: var(--fw-bold); }

/* ── 今かかっている条件の札（一覧の見出し） ── */
.filter-chips { display: inline-flex; flex-wrap: wrap; gap: var(--sp-1); }
.filter-chips:empty { display: none; }

.filter-chip {
  display: inline-flex;
  align-items: center;
  border: var(--bw) solid var(--color-primary-border);
  border-radius: var(--r-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: var(--fs-xs);
  overflow: hidden;
}

.filter-chip__label,
.filter-chip__remove {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  height: 24px;
  border: 0;
  background: transparent;
  color: inherit;
}

.filter-chip__label { padding: 0 var(--sp-1) 0 var(--sp-2); }
.filter-chip__remove { padding: 0 var(--sp-2) 0 var(--sp-1); }
.filter-chip__label:hover,
.filter-chip__remove:hover { background: var(--color-primary-soft-strong); }

/* ── 見出しの漏斗（じょうご）：どの列でも絞り込める ── */
.grid thead .th-btn { padding-right: calc(var(--sp-3) + 24px); }

.th-filter {
  position: absolute;
  top: 50%;
  right: var(--sp-2);
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: var(--bw) solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--color-border-strong);
  font-size: var(--fs-xs);
  transform: translateY(-50%);
  transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}

.th-filter:hover,
.th-filter:focus-visible { border-color: var(--color-primary-border); background: var(--color-surface); color: var(--color-primary); }
.grid thead th:hover .th-filter { color: var(--color-text-subtle); }

/* 絞り込み中：色だけでなく、塗りつぶした四角の形でも分かるようにする */
.grid thead th.is-filtered { background: var(--color-primary-soft); }
.grid thead th.is-filtered .th-btn__text { color: var(--color-primary); }
.grid thead th.is-filtered .th-filter { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-text-inverse); }
.grid thead th.is-filter-open .th-filter { box-shadow: 0 0 0 3px var(--color-primary-soft-strong); }

/* ── 固定列（レコードキー）の鍵：左端に固定する列の見出し ── */
.grid thead th.is-pinned .th-btn { padding-left: calc(var(--sp-2) + 22px); }

.th-key {
  position: absolute;
  top: 50%;
  left: var(--sp-1);
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: var(--bw) solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--fs-xs);
  transform: translateY(-50%);
}

.th-key:hover,
.th-key:focus-visible { border-color: var(--color-primary-border); background: var(--color-surface); }

/* ── 列ごとの絞り込みの小窓 ── */
.col-filter {
  position: fixed;
  z-index: var(--z-panel);
  display: flex;
  flex-direction: column;
  width: 300px;
  border: var(--bw) solid var(--color-border);
  border-top: var(--bw-bar) solid var(--color-primary);
  border-radius: var(--r-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
  animation: col-filter-in var(--dur-base) var(--ease);
}

.col-filter[hidden] { display: none; }

@keyframes col-filter-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

.col-filter__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-2); padding: var(--sp-2) var(--sp-2) var(--sp-1) var(--sp-3); }
.col-filter__heading { min-width: 0; }
.col-filter__title { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-md); color: var(--color-primary); overflow-wrap: anywhere; }
.col-filter__kind { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--color-text-subtle); }
.col-filter__body { display: flex; flex-direction: column; gap: var(--sp-2); min-height: 0; padding: var(--sp-2) var(--sp-3); overflow: auto; }
.col-filter__body .value-list { max-height: 320px; }
.col-filter__foot { display: flex; justify-content: space-between; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-top: var(--bw) solid var(--color-border); background: var(--color-surface-alt); }

.value-bulk { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3); }
.value-bulk[hidden] { display: none; }
.check--value.is-checked .check__text { font-weight: var(--fw-bold); }

/* ── 絞り込みのパネル ── */
.filter-summary { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-2); padding-bottom: var(--sp-3); }
.filter-sections { display: flex; flex-direction: column; border-top: var(--bw) solid var(--color-border); }
.filter-section { border-bottom: var(--bw) solid var(--color-border); }
.filter-section__row { display: flex; align-items: center; gap: var(--sp-2); }

.filter-section__head {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2) 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.filter-section__chevron { width: 12px; color: var(--color-text-subtle); transition: transform var(--dur-fast) var(--ease); }
.filter-section.is-open .filter-section__chevron { transform: rotate(90deg); }
.filter-section__label { font-weight: var(--fw-bold); }

.filter-section__state {
  overflow: hidden;
  font-size: var(--fs-xs);
  color: var(--color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-section.is-active .filter-section__label { color: var(--color-primary); }
.filter-section__body { display: flex; flex-direction: column; gap: var(--sp-2); padding: 0 0 var(--sp-3) var(--sp-5); }
.filter-section__kind { width: 14px; color: var(--color-text-subtle); }
.filter-section:not(.is-active) .filter-section__state { color: var(--color-text-subtle); }
.filter-sections[hidden] { display: none; }
.filter-add { display: flex; align-items: center; gap: var(--sp-2); color: var(--color-text-subtle); }
.filter-add .input { flex: 1; }

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: var(--fs-sm);
  white-space: nowrap;
}

.link-btn:hover { text-decoration: underline; }

.value-list { display: flex; flex-direction: column; max-height: 240px; overflow: auto; }
.check--value { display: grid; grid-template-columns: auto 1fr auto; }
.check__text { min-width: 0; overflow-wrap: anywhere; }
.check__count { font-size: var(--fs-xs); color: var(--color-text-subtle); }
.check--value.is-zero .check__text { color: var(--color-text-subtle); }

.preset-list { display: flex; flex-wrap: wrap; gap: var(--sp-1); }

.preset {
  height: var(--h-control-sm);
  padding: 0 var(--sp-3);
  border: var(--bw) solid var(--color-border-strong);
  border-radius: var(--r-pill);
  background: var(--color-surface);
  font-size: var(--fs-sm);
}

.preset:hover { border-color: var(--color-primary-border); background: var(--color-primary-soft); }
.preset.is-active { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-text-inverse); font-weight: var(--fw-bold); }

.date-custom { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-2); padding: var(--sp-2); border-radius: var(--r-md); background: var(--color-surface); }
.date-row { display: flex; align-items: center; gap: var(--sp-1); }
.date-row__label { width: 56px; font-size: var(--fs-sm); color: var(--color-text-muted); }
.ymd { display: inline-flex; align-items: center; gap: 2px; color: var(--color-text-subtle); }
.input--num { width: 56px; text-align: right; }
.input--y { width: 58px; text-align: center; }
.input--md { width: 38px; text-align: center; }
.date-custom select.input { width: auto; padding: 0 var(--sp-1); }

.drop-zone {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: var(--bw-strong) dashed var(--color-border-strong);
  border-radius: var(--r-md);
  transition: background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}

.drop-zone.is-over { border-color: var(--color-primary); background: var(--color-primary-soft); }
.drop-zone__actions { display: flex; gap: var(--sp-2); }

/* ── 詳細：別のツールへ渡すボタン ── */
.detail__actions { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border-top: var(--bw) solid var(--color-border); background: var(--color-surface); }
```
