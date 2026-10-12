/* =========================================================
   通知（トースト）。状態は「アイコン＋文字＋色」で伝え、必要なら「元に戻す」を付ける。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.views = DS.views || {};

  const TONES = {
    success: { icon: 'fa-circle-check', fallback: '✓', label: '完了' },
    info: { icon: 'fa-circle-info', fallback: 'i', label: 'お知らせ' },
    warning: { icon: 'fa-triangle-exclamation', fallback: '!', label: '注意' },
    danger: { icon: 'fa-circle-xmark', fallback: '×', label: 'エラー' },
  };
  const MAX_VISIBLE = 3;
  const DEFAULT_TIMEOUT = 5000;

  function createToast(host) {
    const { el, icon } = DS.util;
    host.setAttribute('aria-live', 'polite');

    function dismiss(node) {
      if (!node.isConnected) return;
      node.classList.add('is-leaving');
      window.setTimeout(() => node.remove(), 200);
    }

    function show(options) {
      const tone = TONES[options.tone] || TONES.info;
      const close = el('button', { type: 'button', className: 'toast__close', 'aria-label': '閉じる', title: '閉じる' }, [icon('fa-xmark', '×')]);
      const action = options.actionLabel
        ? el('button', { type: 'button', className: 'toast__action', text: options.actionLabel })
        : null;
      const node = el('div', { className: `toast toast--${options.tone || 'info'}`, role: 'status' }, [
        el('span', { className: 'toast__icon' }, [icon(tone.icon, tone.fallback)]),
        el('div', { className: 'toast__body' }, [
          el('span', { className: 'sr-only', text: tone.label + '：' }),
          el('span', { text: options.message }),
          options.detailId ? el('span', { className: 'toast__detail mono', text: `問い合わせ番号 ${options.detailId}` }) : null,
        ]),
        action,
        close,
      ]);
      close.addEventListener('click', () => dismiss(node));
      if (action) {
        action.addEventListener('click', () => {
          dismiss(node);
          options.onAction();
        });
      }
      host.appendChild(node);
      while (host.children.length > MAX_VISIBLE) host.firstElementChild.remove();

      let timer = window.setTimeout(() => dismiss(node), options.timeout || DEFAULT_TIMEOUT);
      // 読んでいる間（マウスを乗せている間）は消さない
      node.addEventListener('mouseenter', () => window.clearTimeout(timer));
      node.addEventListener('mouseleave', () => {
        timer = window.setTimeout(() => dismiss(node), 2000);
      });
      return node;
    }

    return { show };
  }

  DS.views.createToast = createToast;
})();
