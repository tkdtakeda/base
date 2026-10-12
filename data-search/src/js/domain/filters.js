/* =========================================================
   絞り込みの種類の登録簿。種類ごとに「空か」「どう言葉で表すか」「行が当てはまるか」を持つ。
   種類を増やすときは filterTypes.register() を足す（パネルの部品は panels/filter-panel.js）。

   条件の形（画面 → API へそのまま渡す）。1 つの列で有効な条件は 1 つ（列の種類で使えるものが決まる：domain/fields.js）
     values … { type: 'values', values: ['仕掛中', null] }        null は「空欄」
     date   … { type: 'date', mode: 'relative', fromDays: 0, toDays: 7 }   今日を 0 とした日数
              { type: 'date', mode: 'absolute', from: '2026-10-01', to: '2026-10-31' }
     number … { type: 'number', min: 1.5, max: null }                  以上・以下（null は制限なし）
     text   … { type: 'text', op: 'contains', value: 'LOT 0012', fuzzy: true }
              op：contains / starts / ends / not_contains / not_starts / not_ends
              fuzzy：記号・空白を無視して比べる。含む・含まない は空白で区切った語ごとに見る

   数値の読み方・文字の比べ方は Python 版の sql_functions.py と同じ決まり（サンプルのモードの検索で使う）。
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

  // ── 数値・文字の道具（sql_functions.py と同じ決まり） ──
  const NUMBER_PATTERN = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
  const WORD_OPS = ['contains', 'not_contains'];
  const TEXT_OPS = [
    { id: 'contains', label: '含む' },
    { id: 'starts', label: 'で始まる' },
    { id: 'ends', label: 'で終わる' },
    { id: 'not_contains', label: '含まない' },
    { id: 'not_starts', label: 'で始まらない' },
    { id: 'not_ends', label: 'で終わらない' },
  ];

  /** 数値として読めれば数、読めなければ null（全角・桁区切りのカンマ・先頭の 0 も読む。単位つきは読まない） */
  function toNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).normalize('NFKC').trim();
    return NUMBER_PATTERN.test(text) ? Number(text.replace(/,/g, '')) : null;
  }

  /** 比べるための形：NFKC・小文字。fuzzy なら英数字と文字（日本語を含む）以外を取り除く */
  function fold(value, fuzzy) {
    const text = String(value == null ? '' : value).normalize('NFKC').toLowerCase();
    return fuzzy ? text.replace(/[^\p{L}\p{N}]/gu, '') : text;
  }

  function termsOf(needle, op, fuzzy) {
    const text = String(needle || '').normalize('NFKC');
    const words = WORD_OPS.includes(op) ? text.split(/\s+/) : [text.trim()];
    return words.map((word) => fold(word, fuzzy)).filter(Boolean);
  }

  function textMatches(value, op, needle, fuzzy) {
    const terms = termsOf(needle, op, fuzzy);
    if (!terms.length) return true;
    const target = fold(value, fuzzy);
    switch (op) {
      case 'contains': return terms.every((term) => target.includes(term));
      case 'not_contains': return !terms.some((term) => target.includes(term));
      case 'starts': return target.startsWith(terms[0]);
      case 'ends': return target.endsWith(terms[0]);
      case 'not_starts': return !target.startsWith(terms[0]);
      case 'not_ends': return !target.endsWith(terms[0]);
      default: return false;
    }
  }

  const formatNumber = (n) => Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 6 });

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

  types.register({
    id: 'number',
    empty: () => ({ type: 'number', min: null, max: null }),
    isActive: (spec) => Boolean(spec) && (spec.min !== null && spec.min !== undefined || spec.max !== null && spec.max !== undefined),
    describe(spec) {
      const min = spec.min === null || spec.min === undefined ? '' : `${formatNumber(spec.min)} 以上`;
      const max = spec.max === null || spec.max === undefined ? '' : `${formatNumber(spec.max)} 以下`;
      return [min, max].filter(Boolean).join(' ');
    },
    matches(value, spec) {
      const number = toNumber(value);
      if (number === null) return false;
      return (spec.min === null || spec.min === undefined || number >= spec.min) && (spec.max === null || spec.max === undefined || number <= spec.max);
    },
  });

  types.register({
    id: 'text',
    ops: TEXT_OPS,
    empty: () => ({ type: 'text', op: 'contains', value: '', fuzzy: true }),
    isActive: (spec) => Boolean(spec) && termsOf(spec.value, spec.op, spec.fuzzy !== false).length > 0,
    describe(spec) {
      const op = TEXT_OPS.find((item) => item.id === spec.op) || TEXT_OPS[0];
      return `「${DS.util.normalize(spec.value)}」${op.label}`;
    },
    matches: (value, spec) => textMatches(value, spec.op, spec.value, spec.fuzzy !== false),
  });

  /** その列で使える条件か（列の種類で決まる） */
  function allowed(field, spec) {
    return Boolean(field && spec && field.filters.includes(spec.type) && types.has(spec.type));
  }

  /** 有効な条件だけを残す（空の条件・その列で使えない条件は送らない・保存しない） */
  function compact(filters) {
    const result = {};
    Object.entries(filters || {}).forEach(([fieldId, spec]) => {
      const field = DS.domain.fields.get(fieldId);
      if (allowed(field, spec) && types.get(spec.type).isActive(spec)) result[fieldId] = spec;
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
    return types.get(spec.type).describe(spec);
  }

  DS.domain.filterTypes = types;
  DS.domain.filters = { compact, sameFilters, describe, allowed, normalizeDate, todayIso, resolveDate, slashOf, toNumber, fold, textMatches, TEXT_OPS, BLANK_LABEL };
})();
