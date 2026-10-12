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
