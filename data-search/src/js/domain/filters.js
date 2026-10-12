/* =========================================================
   絞り込みの種類の登録簿。種類ごとに「空か」「どう言葉で表すか」「行が当てはまるか」を持つ。
   種類を増やすときは filterTypes.register() を足す（パネルの部品は panels/filter-panel.js）。

   条件の形（画面 → API へそのまま渡す）
     values … { type: 'values', values: ['仕掛中', null] }        null は「空欄」
     date   … { type: 'date', mode: 'relative', fromDays: 0, toDays: 7 }   今日を 0 とした日数
              { type: 'date', mode: 'absolute', from: '2026-10-01', to: '2026-10-31' }
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const types = DS.core.createRegistry('filterTypes');
  const BLANK_LABEL = '（空欄）';

  // ── 日付の道具 ──
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const slashOf = (iso) => (iso ? iso.replace(/-/g, '/') : '');

  function todayIso() {
    return isoOf(new Date());
  }

  function addDays(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    return isoOf(new Date(y, m - 1, d + days));
  }

  /** バックエンドの date_expression と同じ決まりで 'YYYY-MM-DD' にそろえる */
  function normalizeDate(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (/^\d{8}/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    return text.slice(0, 10).replace(/\//g, '-');
  }

  function dayLabel(days) {
    if (days === 0) return '今日';
    return days > 0 ? `${days} 日後` : `${-days} 日前`;
  }

  // 日付のよく使う範囲（項目の種類を問わず使えるよう、「期限切れ」ではなく「今日より前」と書く）
  const DATE_PRESETS = [
    { id: 'before', label: '今日より前', fromDays: null, toDays: -1 },
    { id: 'today', label: '今日', fromDays: 0, toDays: 0 },
    { id: 'next7', label: '今日〜7 日後', fromDays: 0, toDays: 7 },
    { id: 'next30', label: '今日〜30 日後', fromDays: 0, toDays: 30 },
    { id: 'last7', label: '7 日前〜今日', fromDays: -7, toDays: 0 },
  ];

  /** 条件を、その日の具体的な範囲 [from, to] にする（null は制限なし） */
  function resolveDate(spec, today) {
    if (spec.mode === 'absolute') return [spec.from || null, spec.to || null];
    return [
      spec.fromDays === null || spec.fromDays === undefined ? null : addDays(today, spec.fromDays),
      spec.toDays === null || spec.toDays === undefined ? null : addDays(today, spec.toDays),
    ];
  }

  types.register({
    id: 'values',
    empty: () => ({ type: 'values', values: [] }),
    isActive: (spec) => Boolean(spec && spec.values && spec.values.length),
    describe(spec) {
      const labels = spec.values.map((value) => (value === null ? BLANK_LABEL : value));
      return labels.length <= 2 ? labels.join('・') : `${labels.slice(0, 2).join('・')} ほか ${labels.length - 2}`;
    },
    matches(value, spec) {
      const blank = value === null || value === undefined || String(value).trim() === '';
      return spec.values.some((selected) => (selected === null ? blank : !blank && String(value) === selected));
    },
  });

  types.register({
    id: 'date',
    presets: DATE_PRESETS,
    empty: () => ({ type: 'date', mode: 'relative', fromDays: null, toDays: null }),
    isActive(spec) {
      if (!spec) return false;
      if (spec.mode === 'absolute') return Boolean(spec.from || spec.to);
      return spec.fromDays !== null && spec.fromDays !== undefined || spec.toDays !== null && spec.toDays !== undefined;
    },
    presetOf(spec) {
      if (!spec || spec.mode !== 'relative') return null;
      return DATE_PRESETS.find((preset) => preset.fromDays === spec.fromDays && preset.toDays === spec.toDays) || null;
    },
    describe(spec) {
      const preset = this.presetOf(spec);
      if (preset) return preset.label;
      if (spec.mode === 'absolute') return `${slashOf(spec.from) || '指定なし'}〜${slashOf(spec.to) || '指定なし'}`;
      const from = spec.fromDays === null || spec.fromDays === undefined ? '' : dayLabel(spec.fromDays);
      const to = spec.toDays === null || spec.toDays === undefined ? '' : dayLabel(spec.toDays);
      if (from && to) return `${from}〜${to}`;
      return from ? `${from}以降` : `${to}まで`;
    },
    matches(value, spec, today) {
      const date = normalizeDate(value);
      if (!date) return false;
      const [from, to] = resolveDate(spec, today);
      return (!from || date >= from) && (!to || date <= to);
    },
  });

  /** 有効な条件だけを残す（空の条件は送らない・保存しない） */
  function compact(filters) {
    const result = {};
    Object.entries(filters || {}).forEach(([fieldId, spec]) => {
      const field = DS.domain.fields.get(fieldId);
      const type = field && types.get(field.filter);
      if (type && type.isActive(spec)) result[fieldId] = spec;
    });
    return result;
  }

  /** 並び順を問わず同じ条件か（タグの「変更あり」の判定に使う） */
  function sameFilters(a, b) {
    const canonical = (filters) => JSON.stringify(Object.keys(compact(filters)).sort().map((key) => {
      const spec = filters[key];
      return [key, spec.type === 'values' ? Object.assign({}, spec, { values: spec.values.slice().sort() }) : spec];
    }));
    return canonical(a) === canonical(b);
  }

  function describe(fieldId, spec) {
    const field = DS.domain.fields.get(fieldId);
    return types.get(field.filter).describe(spec);
  }

  DS.domain.filterTypes = types;
  DS.domain.filters = { compact, sameFilters, describe, normalizeDate, todayIso, resolveDate, slashOf, BLANK_LABEL };
})();
