/* =========================================================
   一覧の表を、全列を並べても見失わないようにする道具

     左端の固定     … 1 件を決める列（例：ロット番号・BOX番号）は横に動かしても残す
     列幅           … 中身に合わせて決め、長すぎる値は「…」で省く（マウスを乗せると全文）
                      見出しの右端をドラッグで幅を変える。ダブルクリックで元に戻す。幅はブラウザに保存
     列を探す       … 列名を入れて Enter で、その列まで横に動かして光らせる
     行の高さ       … 詰める／ゆったり（ブラウザに保存）
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const MIN_WIDTH = 48;
  const MAX_WIDTH = 800;

  function createGridTools({ store, toast, openPanel }) {
    const { el, icon } = DS.util;

    // ── 道具の並び（一覧の上） ──
    const finder = el('input', { type: 'search', className: 'input input--sm grid-tools__finder', placeholder: '列を探す',
      'aria-label': '列を探す（列名の一部を入れて Enter）', list: 'grid-column-names', autocomplete: 'off' });
    const names = el('datalist', { id: 'grid-column-names' });
    const densityButton = el('button', { type: 'button', className: 'icon-btn grid-tools__density' });
    const element = el('div', { className: 'grid-tools' }, [
      el('span', { className: 'grid-tools__find' }, [icon('fa-magnifying-glass', ''), finder]), names, densityButton,
    ]);
    DS.util.selectAllOnFocus(element);

    let wrap = null;
    let styleNode = null;

    function columnIndex(id) {
      if (!wrap) return -1;
      const heads = Array.from(wrap.querySelectorAll('thead th'));
      return heads.findIndex((th) => th.dataset.field === id);
    }

    function find(text) {
      const needle = DS.util.foldForCompare(text);
      if (!needle) return;
      const all = DS.domain.listFields();
      const field = all.find((f) => DS.util.foldForCompare(f.label) === needle) ||
        all.find((f) => DS.util.foldForCompare(f.label).includes(needle));
      if (!field) {
        toast.show({ tone: 'warning', message: `「${text}」を含む列はありません` });
        return;
      }
      if (store.get().columns.hidden.includes(field.id)) {
        toast.show({ tone: 'info', message: `「${field.label}」は隠している列です`, actionLabel: '表示する', onAction: () => {
          store.merge('columns', { hidden: store.get().columns.hidden.filter((id) => id !== field.id) });
          window.setTimeout(() => find(field.label), 0);
        } });
        return;
      }
      const index = columnIndex(field.id);
      if (index === -1) return;
      const th = wrap.querySelectorAll('thead th')[index];
      const pinned = Array.from(wrap.querySelectorAll('thead th.is-pinned')).reduce((sum, node) => sum + node.offsetWidth, 0);
      wrap.scrollLeft = Math.max(0, th.offsetLeft - pinned - 16);
      wrap.querySelectorAll(`tr > :nth-child(${index + 1})`).forEach((node) => DS.util.flash(node));
    }

    finder.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter') return;
      event.preventDefault();
      find(finder.value);
    });
    finder.addEventListener('change', () => find(finder.value)); // 候補から選んだとき

    densityButton.addEventListener('click', () => {
      const next = store.get().columns.density === 'comfortable' ? 'compact' : 'comfortable';
      store.merge('columns', { density: next });
    });

    // ── 列幅の変更 ──
    function startResize(event, th) {
      event.preventDefault();
      const id = th.dataset.field;
      const startX = event.clientX;
      const startWidth = th.offsetWidth;
      const index = columnIndex(id);
      document.body.classList.add('is-resizing');
      function move(e) {
        const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + e.clientX - startX));
        applyWidths(Object.assign({}, store.get().columns.widths, { [id]: width }));
        if (index === 0) updatePinned();
      }
      function up(e) {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.classList.remove('is-resizing');
        const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + e.clientX - startX));
        store.merge('columns', { widths: Object.assign({}, store.get().columns.widths, { [id]: width }) });
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    }

    function resetWidth(id) {
      const widths = Object.assign({}, store.get().columns.widths);
      delete widths[id];
      store.merge('columns', { widths });
    }

    /** 幅を決めた列だけ、nth-child の規則で幅をそろえる（見出しと中身が同じ幅になる） */
    function applyWidths(widths) {
      if (!wrap || !styleNode) return;
      const heads = Array.from(wrap.querySelectorAll('thead th'));
      styleNode.textContent = heads.map((th, index) => {
        const width = widths[th.dataset.field];
        return width ? `.grid tr > :nth-child(${index + 1}) { width:${width}px; min-width:${width}px; max-width:${width}px; }` : '';
      }).join('\n');
    }

    /** 左端に固定する列の位置（前の固定列の幅の合計） */
    function updatePinned() {
      if (!wrap) return;
      const heads = Array.from(wrap.querySelectorAll('thead th.is-pinned'));
      let left = 0;
      heads.forEach((th, order) => {
        const index = Array.prototype.indexOf.call(th.parentElement.children, th);
        const last = order === heads.length - 1; // 固定した列の右端に線を引き、動く列との境目を見せる
        wrap.querySelectorAll(`tr > :nth-child(${index + 1})`).forEach((node) => {
          node.style.left = `${left}px`;
          node.classList.toggle('is-pinned-last', last);
        });
        left += th.offsetWidth;
      });
    }

    /** 表を描き直した後に呼ぶ */
    function afterRender(state, tableWrap) {
      wrap = tableWrap;
      styleNode = wrap.querySelector('style.grid-widths');
      applyWidths(state.columns.widths);
      // 表は描き直した直後にはまだ隠れていることがある（空の案内と入れ替え中）。表示されてから測る
      window.requestAnimationFrame(updatePinned);
      wrap.querySelectorAll('.col-resize').forEach((handle) => {
        const th = handle.closest('th');
        handle.addEventListener('mousedown', (event) => startResize(event, th));
        handle.addEventListener('dblclick', () => resetWidth(th.dataset.field));
        handle.addEventListener('click', (event) => event.stopPropagation());
      });
    }

    function update(state) {
      const comfortable = state.columns.density === 'comfortable';
      densityButton.replaceChildren(icon(comfortable ? 'fa-compress' : 'fa-expand', comfortable ? '詰' : '広'));
      densityButton.title = comfortable ? '行を詰めて表示する' : '行をゆったり表示する';
      densityButton.setAttribute('aria-label', densityButton.title);
      const hidden = new Set(state.columns.hidden);
      names.replaceChildren(...DS.domain.listFields().filter((f) => !hidden.has(f.id)).map((f) => el('option', { value: f.label })));
    }

    window.addEventListener('resize', DS.util.debounce(updatePinned, 150));

    return { element, afterRender, update, find, openColumns: () => openPanel('columns') };
  }

  DS.views.createGridTools = createGridTools;
})();
