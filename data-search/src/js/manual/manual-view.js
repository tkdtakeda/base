/* =========================================================
   取扱説明書の窓。背景を覆わない（開いたままでもほかの操作ができる）。
   目次はまとまりごと、1 章ずつ表示。言葉で章を探せ、前回の章を覚える。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const LAST_KEY = 'manual:last';

  function createManualView(host) {
    const { el, icon } = DS.util;
    const { groups, chapters } = DS.manual;

    const searchInput = el('input', { type: 'search', className: 'input input--sm', placeholder: '言葉で章を探す', 'aria-label': '説明書を言葉で探す' });
    const toc = el('nav', { className: 'manual__toc', 'aria-label': '目次' });
    const content = el('article', { className: 'manual__content', tabindex: '-1' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '閉じる（Esc）', 'aria-label': '説明書を閉じる' }, [icon('fa-xmark', '×')]);
    const windowNode = el('section', { className: 'manual', role: 'dialog', 'aria-modal': 'false', 'aria-label': '取扱説明書', hidden: true }, [
      el('header', { className: 'manual__head' }, [
        el('h2', { className: 'manual__title' }, [icon('fa-book-open', ''), el('span', { text: '取扱説明書' })]),
        closeButton,
      ]),
      el('div', { className: 'manual__main' }, [el('div', { className: 'manual__side' }, [searchInput, toc]), content]),
    ]);
    host.appendChild(windowNode);

    let current = DS.core.storage.read(LAST_KEY, 'quick');
    if (!chapters.has(current)) current = 'quick';

    function textOf(chapter) {
      const holder = document.createElement('div');
      holder.innerHTML = chapter.body;
      return (chapter.title + ' ' + holder.textContent);
    }

    function renderToc() {
      const query = DS.util.foldForCompare(searchInput.value);
      const nodes = [];
      groups.list().forEach((group) => {
        const items = chapters.list().filter((chapter) =>
          chapter.group === group.id && (!query || DS.util.foldForCompare(textOf(chapter)).includes(query)));
        if (!items.length) return;
        nodes.push(el('h3', { className: 'manual__group', text: group.label }));
        items.forEach((chapter) => {
          const link = el('button', { type: 'button', className: `manual__link${chapter.id === current ? ' is-active' : ''}`, text: chapter.title });
          link.addEventListener('click', () => show(chapter.id));
          nodes.push(link);
        });
      });
      if (!nodes.length) nodes.push(el('p', { className: 'pane-note', text: '一致する章はありません' }));
      toc.replaceChildren(...nodes);
    }

    function show(id) {
      current = id;
      DS.core.storage.write(LAST_KEY, id);
      const chapter = chapters.get(id);
      content.innerHTML = `<h3 class="manual__chapter">${DS.util.escapeHtml(chapter.title)}</h3>${chapter.body}`;
      content.scrollTop = 0;
      renderToc();
    }

    function open() {
      windowNode.hidden = false;
      show(current);
      searchInput.focus();
    }

    function close() {
      windowNode.hidden = true;
    }

    function toggle() {
      if (windowNode.hidden) open();
      else close();
    }

    searchInput.addEventListener('input', renderToc);
    closeButton.addEventListener('click', close);
    windowNode.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        toggle();
      }
    });

    return { open, close, toggle };
  }

  DS.views.createManualView = createManualView;
})();
