/* =========================================================
   状態（status）の見せ方。色だけで伝えず「アイコン＋文字＋色」で表す。
   値の種類が増えたら register() を足す。どれにも当たらない値はグレーの札で表示する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const tones = DS.core.createRegistry('statusTones');

  // order の小さいものから順に照合する
  [
    { id: 'danger', order: 10, pattern: /不適合|不良|NG|異常|廃棄/i, icon: 'fa-circle-xmark', fallback: '×' },
    { id: 'warning', order: 20, pattern: /保留|停止|要確認|遅延/, icon: 'fa-circle-pause', fallback: '!' },
    { id: 'success', order: 30, pattern: /完了|済|合格|OK/i, icon: 'fa-circle-check', fallback: '✓' },
    { id: 'info', order: 40, pattern: /仕掛|待ち|中$|予定/, icon: 'fa-clock', fallback: '…' },
  ].forEach((tone) => tones.register(tone));

  const NEUTRAL = { id: 'neutral', icon: 'fa-circle', fallback: '・' };

  function toneOf(value) {
    if (value === null || value === undefined || value === '') return NEUTRAL;
    return tones.list().find((tone) => tone.pattern.test(String(value))) || NEUTRAL;
  }

  /** 状態の札（バッジ）を作る */
  function badge(value) {
    const util = DS.util;
    const tone = toneOf(value);
    return util.el('span', { className: `badge badge--${tone.id}` }, [
      util.icon(tone.icon, tone.fallback),
      util.el('span', { text: value === null || value === undefined || value === '' ? '—' : String(value) }),
    ]);
  }

  DS.domain.statusTones = tones;
  DS.domain.statusBadge = badge;
})();
