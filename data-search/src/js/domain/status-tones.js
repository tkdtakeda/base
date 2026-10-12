/* =========================================================
   値の札（バッジ）。色だけで伝えず「アイコン＋文字＋色」で表す。
   どの値をどの色にするかは表示定義（view の fields.<項目>.badge）に書く。
   ここには「色の種類 → アイコン」の対応だけを置く（デザインの決まり）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  const TONES = {
    danger: { icon: 'fa-circle-xmark', fallback: '×' },
    warning: { icon: 'fa-circle-pause', fallback: '!' },
    success: { icon: 'fa-circle-check', fallback: '✓' },
    info: { icon: 'fa-clock', fallback: '…' },
    neutral: { icon: 'fa-circle', fallback: '・' },
  };

  function toneOf(field, value) {
    if (value === null || value === undefined || value === '') return 'neutral';
    const rule = (field.badge || []).find((item) => item.pattern.test(String(value)));
    return rule && TONES[rule.tone] ? rule.tone : 'neutral';
  }

  /** 札を作る。field.badge の決まりを上から順に当てはめ、どれにも当たらなければグレー */
  function badge(field, value) {
    const util = DS.util;
    const tone = toneOf(field, value);
    return util.el('span', { className: `badge badge--${tone}` }, [
      util.icon(TONES[tone].icon, TONES[tone].fallback),
      util.el('span', { text: value === null || value === undefined || value === '' ? '—' : String(value) }),
    ]);
  }

  DS.domain.badge = badge;
  DS.domain.hasBadge = (field) => Boolean(field && field.badge && field.badge.length);
})();
