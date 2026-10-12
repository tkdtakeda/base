/* =========================================================
   小さな道具：文字の正規化・HTML のエスケープ・日時と数値の表示・DOM 作成
   ========================================================= */
(function () {
  'use strict';

  const DS = (window.DS = window.DS || {});

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  const util = {
    /** 全角英数・記号を半角にそろえ、前後の空白を除く（バックエンドと同じ NFKC） */
    normalize(value) {
      return String(value == null ? '' : value).normalize('NFKC').trim();
    },

    /** 比較用：正規化したうえで大文字小文字・ひらがなカタカナの違いをなくす */
    foldForCompare(value) {
      return util
        .normalize(value)
        .toLowerCase()
        .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    },

    escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
    },

    /** keyword に一致した部分を <mark> で囲んだ HTML を返す（大文字小文字・全角半角を区別しない） */
    highlight(text, keyword) {
      const source = String(text == null ? '' : text);
      const needle = util.foldForCompare(keyword);
      if (!needle) return util.escapeHtml(source);
      const folded = util.foldForCompare(source);
      // 正規化で長さが変わる文字を含む場合は、位置がずれるので強調しない
      if (folded.length !== source.length) return util.escapeHtml(source);
      let html = '';
      let cursor = 0;
      let index = folded.indexOf(needle);
      while (index !== -1) {
        html += util.escapeHtml(source.slice(cursor, index));
        html += '<mark>' + util.escapeHtml(source.slice(index, index + needle.length)) + '</mark>';
        cursor = index + needle.length;
        index = folded.indexOf(needle, cursor);
      }
      return html + util.escapeHtml(source.slice(cursor));
    },

    formatNumber(value) {
      return Number(value || 0).toLocaleString('ja-JP');
    },

    /** ISO 日時 → 「2026/10/11 09:05」 */
    formatDateTime(iso) {
      if (!iso) return '—';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return String(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    /** ISO 日時 → 「3 分前」など、今からの距離 */
    formatAgo(iso) {
      if (!iso) return '';
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (Number.isNaN(diff)) return '';
      if (diff < 60) return 'たった今';
      if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} 時間前`;
      return `${Math.floor(diff / 86400)} 日前`;
    },

    /** 要素を作る小さな道具。attrs の on* はイベント、html は innerHTML、text は textContent */
    el(tag, attrs, children) {
      const node = document.createElement(tag);
      Object.entries(attrs || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === false) return;
        if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'className') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else node.setAttribute(key, value === true ? '' : value);
      });
      (children || []).forEach((child) => {
        if (child === null || child === undefined || child === false) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
      return node;
    },

    /** Font Awesome のアイコン。読み込めないときの代替文字も付ける */
    icon(name, fallback, extraClass) {
      return util.el('i', {
        className: `fa-solid ${name}${extraClass ? ' ' + extraClass : ''}`,
        'aria-hidden': 'true',
        'data-fallback': fallback || '',
      });
    },

    /** 反映の合図：短く光らせる */
    flash(node) {
      if (!node) return;
      node.classList.remove('is-flash');
      void node.offsetWidth; // アニメーションをやり直すため
      node.classList.add('is-flash');
    },

    /** 要素の中で、入力欄を選んだら中身を全選択する */
    selectAllOnFocus(root) {
      root.addEventListener('focusin', (event) => {
        const target = event.target;
        if (target.matches('input[type="text"], input[type="search"], input:not([type])')) {
          window.setTimeout(() => target.select(), 0);
        }
      });
    },

    debounce(fn, wait) {
      let timer = null;
      return function (...args) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn.apply(this, args), wait);
      };
    },
  };

  DS.util = util;
})();
