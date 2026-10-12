## 付録：その後の変更で足した・書き直した画面側のファイルの全文（1/2）

`src/js/views/filter-editors.js`

```javascript
/* =========================================================
   絞り込みの部品（条件の種類ごとに 1 つ：値から選ぶ・日付の範囲・数値の範囲・文字の条件）。
   見出しの小窓（column-filter.js）と脇のパネル（filter-panel.js）で、同じ部品を使う（まとめ役は filter-body.js）。

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

  // ── 文字の条件（含む・始まる・終わる・含まない・始まらない・終わらない） ─────────────
  const TEXT_WAIT_MS = 400; // 打ち終えてから一覧に反映するまで（Enter ならすぐ）
  const TEXT_HINTS = {
    contains: '空白で区切ると、すべての語を含む行を探します。',
    not_contains: '空白で区切ると、どの語も含まない行を探します（空欄の行も入ります）。',
    starts: '入れた文字全体で比べます。',
    ends: '入れた文字全体で比べます。',
    not_starts: '入れた文字全体で比べます（空欄の行も入ります）。',
    not_ends: '入れた文字全体で比べます（空欄の行も入ります）。',
  };

  editors.register({
    id: 'text',
    mount(container, field, ctx) {
      const type = DS.domain.filterTypes.get('text');
      const input = el('input', { type: 'text', className: 'input input--sm', autocomplete: 'off', spellcheck: 'false', maxlength: '100',
        placeholder: '文字を入れる（例：LOT 0012）', 'aria-label': `${field.label}の条件の文字` });
      const opSelect = el('select', { className: 'input input--sm', 'aria-label': `${field.label}の条件の種類` },
        type.ops.map((op) => el('option', { value: op.id, text: op.label })));
      const fuzzyBox = el('input', { type: 'checkbox' });
      fuzzyBox.checked = true;
      const fuzzy = el('label', { className: 'check check--inline', title: '例：LOT2026-0012 と LOT-2026-00012 を同じとみなす' }, [fuzzyBox, el('span', { text: '記号・空白を無視する' })]);
      const hint = el('p', { className: 'pane-note' });
      container.append(input, el('div', { className: 'text-cond__row' }, [opSelect, fuzzy]), hint);

      const current = () => {
        const spec = ctx.store.get().filters[field.id];
        return spec && spec.type === 'text' ? spec : null;
      };
      function apply() {
        const spec = { type: 'text', op: opSelect.value, value: input.value, fuzzy: fuzzyBox.checked };
        const before = current();
        if (!type.isActive(spec) && !before) return; // 空のまま：ほかの絞り込み（値から選ぶ）を消さない
        ctx.search.setFilter(field.id, type.isActive(spec) ? spec : type.empty());
        DS.util.flash(input);
      }
      const applyLater = DS.util.debounce(apply, TEXT_WAIT_MS);

      input.addEventListener('input', applyLater);
      input.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter') return;
        event.preventDefault();
        apply();
      });
      opSelect.addEventListener('change', () => {
        hint.textContent = TEXT_HINTS[opSelect.value];
        if (DS.util.normalize(input.value)) apply();
      });
      fuzzyBox.addEventListener('change', () => { if (DS.util.normalize(input.value)) apply(); });

      function draw() {
        const spec = current();
        if (spec && document.activeElement !== input) {
          input.value = spec.value;
          opSelect.value = spec.op;
          fuzzyBox.checked = spec.fuzzy !== false;
        }
        hint.textContent = TEXT_HINTS[opSelect.value];
      }

      return { load: draw, draw, focus: () => input.focus() };
    },
  });

  // ── 数値の範囲（以上・以下） ─────────────────────────────────
  editors.register({
    id: 'number',
    mount(container, field, ctx) {
      const numberInput = (label) => el('input', { type: 'text', inputmode: 'decimal', className: 'input input--sm input--range mono', maxlength: '20',
        autocomplete: 'off', 'aria-label': `${field.label}の${label}` });
      const minInput = numberInput('いくつ以上');
      const maxInput = numberInput('いくつ以下');
      const applyButton = el('button', { type: 'button', className: 'btn btn--secondary btn--sm' }, [el('span', { text: 'この範囲にする' })]);
      const message = el('p', { className: 'tag-editor__msg', 'aria-live': 'polite' });
      container.append(
        el('div', { className: 'range-row' }, [minInput, el('span', { text: '以上' }), el('span', { className: 'range-row__sep', text: '〜' }), maxInput, el('span', { text: '以下' })]),
        el('p', { className: 'pane-note', text: '片方だけでもかまいません。数値として読めない値（空欄・単位つきなど）は入りません。' }),
        applyButton,
        message,
      );
      DS.util.autoAdvance([minInput, maxInput, applyButton]);

      const toNumber = DS.domain.filters.toNumber;
      const read = (input) => {
        const text = input.value.trim();
        if (!text) return { ok: true, value: null };
        const value = toNumber(text);
        return value === null ? { ok: false } : { ok: true, value };
      };

      applyButton.addEventListener('click', () => {
        const low = read(minInput);
        const high = read(maxInput);
        if (!low.ok || !high.ok) {
          message.textContent = '数値で入れてください（例：1.5、1,000）';
          DS.util.flash(message);
          (low.ok ? maxInput : minInput).focus();
          return;
        }
        if (low.value !== null && high.value !== null && low.value > high.value) {
          message.textContent = '「以上」が「以下」より大きくなっています';
          DS.util.flash(message);
          minInput.focus();
          return;
        }
        message.textContent = '';
        // 全角・桁区切りで入れても、読み取った数に書き直して見せる（反映した値が分かるように）
        minInput.value = low.value === null ? '' : String(low.value);
        maxInput.value = high.value === null ? '' : String(high.value);
        ctx.search.setFilter(field.id, { type: 'number', min: low.value, max: high.value });
        DS.util.flash(applyButton);
      });

      function draw(state) {
        const spec = state.filters[field.id];
        if (!spec || spec.type !== 'number' || [minInput, maxInput].includes(document.activeElement)) return;
        minInput.value = spec.min === null || spec.min === undefined ? '' : String(spec.min);
        maxInput.value = spec.max === null || spec.max === undefined ? '' : String(spec.max);
      }

      return { load: draw, draw, focus: () => minInput.focus() };
    },
  });

  DS.filterEditors = editors;
})();
```

`src/js/views/filter-body.js`

```javascript
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
```

`src/js/views/column-filter.js`

```javascript
/* =========================================================
   見出しの漏斗（じょうご）から開く、列ごとの絞り込みの小窓（Excel のフィルターと同じ考え方）

     開く   … 見出しの漏斗のボタン（Enter でも開く）。列の真下に出す
     中身   … 種類の切り替えとタブ・部品（views/filter-body.js）。値から選ぶ／条件で絞る／数値の範囲／日付の範囲
     反映   … 選んだらすぐ一覧に反映する（「適用」ボタンは置かない）
     閉じる … Esc・小窓の外を押す・× ・「閉じる」。閉じたら漏斗のボタンへ戻る
   一度に開く小窓は 1 つだけ。開いている間も一覧は操作できる（モーダルにしない）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const GAP = 4;
  const EDGE = 8;

  function createColumnFilter({ store, bus, ctx }) {
    const { el, icon } = DS.util;

    const title = el('h2', { className: 'col-filter__title' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '閉じる（Esc）', 'aria-label': '絞り込みを閉じる' }, [icon('fa-xmark', '×')]);
    const body = el('div', { className: 'col-filter__body' });
    const clearButton = el('button', { type: 'button', className: 'btn btn--ghost btn--sm' }, [icon('fa-filter-circle-xmark', ''), el('span', { text: 'この列の絞り込みを解除' })]);
    const doneButton = el('button', { type: 'button', className: 'btn btn--secondary btn--sm' }, [icon('fa-check', '✓'), el('span', { text: '閉じる' })]);
    const pop = el('div', { className: 'col-filter', role: 'dialog', 'aria-modal': 'false', hidden: true }, [
      el('div', { className: 'col-filter__head' }, [el('div', { className: 'col-filter__heading' }, [title]), closeButton]),
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
      title.replaceChildren(icon('fa-filter', ''), el('span', { text: field.label }));
      body.replaceChildren();
      const editor = DS.views.createFilterBody(body, field, ctx);
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
   をまとめる。条件を直す部品（種類・タブ・部品）は見出しの小窓と同じ（views/filter-body.js）。
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
          icon({ date: 'fa-calendar-days', number: 'fa-hashtag', text: 'fa-font' }[field.type], '', 'filter-section__kind'),
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
          if (!entry.editor) entry.editor = DS.views.createFilterBody(entry.content, field, ctx);
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
