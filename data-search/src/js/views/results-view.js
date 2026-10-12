/* =========================================================
   検索結果（メイン領域）：要約・ページ送り・一覧・空のときの案内・出どころ
   一覧には全列を出す（隠すのは「表示列」で選んだ列だけ）。
   行を 1 回押す／↑↓ で選ぶ。ダブルクリック／Enter で詳細を開く。
   見出しの列名を押すと並べ替え、右の漏斗（じょうご）を押すとその列の絞り込み（column-filter.js）。
   左端に固定する列＝固定列（レコードキー）。見出しの鍵を押すと、固定列を変える場所（データ パネル）が開く。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createResultsView(root, { store, bus, search, toast, openPanel, refresh, columnFilter, chooseKey }) {
    const { el, icon, escapeHtml, highlight, formatNumber } = DS.util;

    const summary = el('div', { className: 'results__summary', 'aria-live': 'polite' });
    const pager = el('div', { className: 'pager' });
    const tools = DS.views.createGridTools({ store, toast, openPanel });
    const head = el('div', { className: 'results__head' }, [summary, tools.element, pager]);
    const tableWrap = el('div', { className: 'table-wrap', tabindex: '0', 'aria-label': '検索結果の一覧（↑↓ で行を選ぶ・Enter で詳細）' });
    const empty = el('div', { className: 'empty' });
    const foot = el('div', { className: 'results__foot' });
    root.append(head, el('div', { className: 'results__body' }, [tableWrap, empty]), foot);

    let currentItems = [];

    // ── 一覧 ──
    /** 一覧に出す列。固定列（左端に固定）は隠せない */
    function visibleFields(state) {
      const hidden = new Set(state.columns.hidden);
      return DS.domain.listFields().filter((field) => field.key || !hidden.has(field.id));
    }

    const isSearched = (field, request) => Boolean(request && request.keyword && field.searchable);

    function headerCell(field, state) {
      const active = state.sort.key === field.id;
      const sortIcon = !active ? 'fa-sort' : state.sort.order === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
      const ariaSort = !active ? 'none' : state.sort.order === 'asc' ? 'ascending' : 'descending';
      const classes = [isSearched(field, state.search.request) ? 'is-searched' : '', field.key ? 'is-pinned' : ''].filter(Boolean).join(' ');
      const name = escapeHtml(field.listLabel);
      const keyButton = field.key
        ? '<button type="button" class="th-key" data-key-edit title="固定列（レコードキー）：行を 1 件に決める列です。押すと変えられます" ' +
          'aria-label="固定列（レコードキー）を変える"><i class="fa-solid fa-key" aria-hidden="true" data-fallback="鍵"></i></button>'
        : '';
      return `<th scope="col" aria-sort="${ariaSort}" class="${classes}" data-field="${escapeHtml(field.id)}">${keyButton}` +
        `<button type="button" class="th-btn" data-sort="${escapeHtml(field.id)}" title="${name}で並べ替え">` +
        `<span class="th-btn__text">${name}</span><i class="fa-solid ${sortIcon} th-btn__icon${active ? ' is-active' : ''}" aria-hidden="true"></i></button>` +
        `<button type="button" class="th-filter" data-filter="${escapeHtml(field.id)}" aria-haspopup="dialog" aria-pressed="false" title="${name}で絞り込む" aria-label="${name}で絞り込む">` +
        `<i class="fa-solid fa-filter" aria-hidden="true" data-fallback="▼"></i></button>` +
        `<span class="col-resize" title="ドラッグで幅を変える（ダブルクリックで元に戻す）" aria-hidden="true"></span></th>`;
    }

    function cell(field, item, request) {
      const value = item[field.id];
      const pinned = field.key ? ' is-pinned' : '';
      if (DS.domain.hasBadge(field)) return `<td class="${pinned}">${DS.domain.badge(field, value).outerHTML}</td>`;
      const blank = value === null || value === undefined || value === '';
      const searched = isSearched(field, request);
      const text = blank ? '<span class="muted">—</span>' : searched ? highlight(value, request.keyword) : escapeHtml(value);
      // 長い値は「…」で省くため、マウスを乗せると全文が出るようにする
      const title = blank ? '' : ` title="${escapeHtml(value)}"`;
      return `<td class="${field.mono ? 'mono' : ''}${searched ? ' is-searched' : ''}${pinned}"${title}>${text}</td>`;
    }

    /** 絞り込み中の列の見出しに印を付ける（色だけでなく、漏斗のボタンを塗りつぶした形でも示す） */
    function renderFilterMarks(state) {
      const filters = DS.domain.filters.compact(state.filters);
      tableWrap.querySelectorAll('thead th[data-field]').forEach((th) => {
        const spec = filters[th.dataset.field];
        const button = th.querySelector('[data-filter]');
        th.classList.toggle('is-filtered', Boolean(spec));
        th.classList.toggle('is-filter-open', columnFilter.isOpen(th.dataset.field));
        button.setAttribute('aria-pressed', String(Boolean(spec)));
        const label = th.querySelector('.th-btn__text').textContent;
        button.title = spec ? `${label}：${DS.domain.filters.describe(th.dataset.field, spec)}（押して直す）` : `${label}で絞り込む`;
      });
    }

    /** その列の絞り込みを開く。一覧に見えていれば見出しの小窓、隠している列なら脇のパネル */
    function openFilter(fieldId) {
      const th = tableWrap.hidden ? null : tableWrap.querySelector(`thead th[data-field="${CSS.escape(fieldId)}"]`);
      if (!th) {
        openPanel('filters');
        bus.emit('filters:focus', fieldId);
        return;
      }
      if (!th.classList.contains('is-pinned')) {
        const pinned = Array.from(tableWrap.querySelectorAll('thead th.is-pinned')).reduce((sum, node) => sum + node.offsetWidth, 0);
        const left = th.offsetLeft - pinned;
        if (left < tableWrap.scrollLeft || th.offsetLeft + th.offsetWidth > tableWrap.scrollLeft + tableWrap.clientWidth) {
          tableWrap.scrollLeft = Math.max(0, left - 16);
        }
      }
      if (!columnFilter.isOpen(fieldId)) columnFilter.open(fieldId);
    }

    function renderTable(state) {
      const result = state.search.result;
      const request = state.search.request;
      const fields = visibleFields(state);
      currentItems = result ? result.items : [];
      const rows = currentItems.map((item, index) => {
        const key = DS.domain.recordKey(item);
        const selected = key === state.selection.key;
        return `<tr data-index="${index}" class="${selected ? 'is-selected' : ''}" aria-selected="${selected}">` +
          fields.map((field) => cell(field, item, request)).join('') + '</tr>';
      }).join('');
      const density = state.columns.density === 'comfortable' ? ' grid--comfortable' : '';
      const scrollLeft = tableWrap.scrollLeft;
      tableWrap.innerHTML = '<style class="grid-widths"></style>' +
        `<table class="grid${density}"><thead><tr>${fields.map((field) => headerCell(field, state)).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
      tableWrap.scrollLeft = scrollLeft; // 並べ替えなどで横の位置を失わない
      tools.afterRender(state, tableWrap);
      renderFilterMarks(state);
    }

    function renderSelection(state) {
      tableWrap.querySelectorAll('tbody tr').forEach((row) => {
        const item = currentItems[Number(row.dataset.index)];
        const selected = DS.domain.recordKey(item) === state.selection.key;
        row.classList.toggle('is-selected', selected);
        row.setAttribute('aria-selected', String(selected));
      });
    }

    tableWrap.addEventListener('click', (event) => {
      if (event.target.closest('[data-key-edit]')) {
        chooseKey();
        return;
      }
      const filterButton = event.target.closest('[data-filter]');
      if (filterButton) {
        columnFilter.open(filterButton.dataset.filter);
        return;
      }
      const sortButton = event.target.closest('[data-sort]');
      if (sortButton) {
        search.toggleSort(sortButton.dataset.sort);
        return;
      }
      const row = event.target.closest('tbody tr');
      if (row) search.highlight(currentItems[Number(row.dataset.index)]);
    });

    tableWrap.addEventListener('dblclick', (event) => {
      const row = event.target.closest('tbody tr');
      if (row) search.select(currentItems[Number(row.dataset.index)]);
    });

    tableWrap.addEventListener('keydown', (event) => {
      if (currentItems.length === 0) return;
      const selectedKey = store.get().selection.key;
      const index = currentItems.findIndex((item) => DS.domain.recordKey(item) === selectedKey);
      if (event.key === 'Enter' && event.target === tableWrap) {
        event.preventDefault();
        search.select(currentItems[index === -1 ? 0 : index]);
        return;
      }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      const next = index === -1 ? 0 : Math.min(currentItems.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
      search.highlight(currentItems[next]);
      const row = tableWrap.querySelector(`tbody tr[data-index="${next}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    });

    // ── 要約とページ送り ──
    function renderHead(state) {
      const result = state.search.result;
      const request = state.search.request;
      if (!result || !request) {
        summary.replaceChildren(el('span', { className: 'results__title', text: '検索結果' }));
        pager.replaceChildren();
        return;
      }
      const count = el('strong', { className: 'results__count mono', text: `${formatNumber(result.totalCount)} 件` });
      const searchField = DS.domain.searchField();
      const title = request.keyword && searchField
        ? el('span', { className: 'results__title' }, [
          el('span', { text: `${searchField.listLabel}が「` }),
          el('span', { className: 'mono', text: request.keyword }),
          el('span', { text: `」${request.matchMode === 'exact' ? 'と同じ' : 'を含む'}ロット` }),
        ])
        : el('span', { className: 'results__title', text: 'ロット一覧' });
      summary.replaceChildren(title, count, activeFilterChips(request));
      DS.util.flash(count);

      const pages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));
      const from = result.totalCount === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
      const to = (result.page - 1) * result.pageSize + result.count;
      const prev = el('button', { type: 'button', className: 'icon-btn', title: '前のページ', 'aria-label': '前のページ', disabled: result.page <= 1 }, [icon('fa-chevron-left', '<')]);
      const next = el('button', { type: 'button', className: 'icon-btn', title: '次のページ', 'aria-label': '次のページ', disabled: result.page >= pages }, [icon('fa-chevron-right', '>')]);
      prev.addEventListener('click', () => search.goToPage(result.page - 1));
      next.addEventListener('click', () => search.goToPage(result.page + 1));
      const parts = [el('span', { className: 'pager__range mono', text: result.totalCount ? `${formatNumber(from)}–${formatNumber(to)} 件目` : '' })];
      if (pages > 1) parts.push(prev, el('span', { className: 'pager__pages mono', text: `${result.page} / ${formatNumber(pages)} ページ` }), next);
      pager.replaceChildren(...parts);
    }

    /** 今かかっている絞り込みを札で出す。× で 1 つずつ外せる */
    function activeFilterChips(request) {
      const entries = Object.entries(request.filters || {});
      const nodes = entries.filter(([fieldId]) => DS.domain.fields.has(fieldId)).map(([fieldId, spec]) => {
        const field = DS.domain.fields.get(fieldId);
        const remove = el('button', { type: 'button', className: 'filter-chip__remove', title: `${field.label}の絞り込みを外す`, 'aria-label': `${field.label}の絞り込みを外す` }, [icon('fa-xmark', '×')]);
        remove.addEventListener('click', () => search.clearFilter(fieldId));
        const label = el('button', { type: 'button', className: 'filter-chip__label', title: 'この条件を直す' }, [
          icon('fa-filter', ''),
          el('span', { text: `${field.label}：${DS.domain.filters.describe(fieldId, spec)}` }),
        ]);
        label.addEventListener('click', () => openFilter(fieldId));
        return el('span', { className: 'filter-chip' }, [label, remove]);
      });
      return el('span', { className: 'filter-chips' }, nodes);
    }

    // ── 空のときの案内（次にすることを 1 つ示す） ──
    function emptyCard(iconName, title, text, actions) {
      return el('div', { className: 'empty__card' }, [
        el('span', { className: 'empty__icon' }, [icon(iconName, '')]),
        el('h2', { className: 'empty__title', text: title }),
        text ? el('p', { className: 'empty__text', text }) : null,
        actions && actions.length ? el('div', { className: 'empty__actions' }, actions) : null,
      ]);
    }

    function actionButton(label, iconName, onClick, primary) {
      const button = el('button', { type: 'button', className: `btn ${primary ? 'btn--primary' : 'btn--secondary'}` }, [icon(iconName, ''), el('span', { text: label })]);
      button.addEventListener('click', onClick);
      return button;
    }

    function renderEmpty(state) {
      const status = state.search.status;
      const result = state.search.result;
      const cacheStatus = state.cache.status;
      let card = null;

      if (cacheStatus && !cacheStatus.available) {
        card = state.mode.capabilities.sampleData
          ? emptyCard('fa-flask', 'まずはサンプルデータを読み込みます', '左の「サンプル」から目的に合うデータを選ぶと、そのまま検索を試せます。',
            [actionButton('サンプルを選ぶ', 'fa-flask', () => openPanel('samples'), false)])
          : emptyCard('fa-database', '検索できるデータがまだありません', cacheStatus.message,
            [actionButton('データを更新する', 'fa-rotate', refresh, false)]);
      } else if (status === 'error') {
        const error = state.search.error;
        card = emptyCard('fa-circle-xmark', '検索できませんでした', error.userMessage + (error.detailId ? `（問い合わせ番号 ${error.detailId}）` : ''),
          [actionButton('もう一度検索する', 'fa-rotate-right', () => search.run({ page: 1 }), false)]);
      } else if (!result) {
        card = status === 'loading' ? emptyCard('fa-spinner', '一覧を読み込んでいます', null) : null;
      } else if (result && result.totalCount === 0) {
        const request = state.search.request;
        const actions = [];
        const filterCount = Object.keys(request.filters || {}).length;
        if (filterCount) {
          actions.push(actionButton('絞り込みを外して探す', 'fa-filter-circle-xmark', () => search.setFilters({}), false));
        }
        if (!request.keyword) {
          card = emptyCard('fa-filter', '絞り込みに当てはまるロットはありません', '条件をゆるめるか、外してください。上の札の × で 1 つずつ外せます。', actions);
          empty.replaceChildren(card);
          empty.hidden = false;
          tableWrap.hidden = true;
          root.classList.toggle('is-loading', false);
          return;
        }
        const field = DS.domain.searchField();
        if (request.matchMode === 'exact') {
          actions.push(actionButton('部分一致で探し直す', 'fa-magnifying-glass-plus', () => {
            search.setQuery({ matchMode: 'partial' });
            search.run({ page: 1 });
          }, false));
        }
        actions.push(actionButton('探す列を変える', 'fa-arrow-right-arrow-left', chooseKey, false));
        card = emptyCard('fa-circle-question', '一致するロットはありません',
          `${field ? field.listLabel : '番号'}が「${request.keyword}」${request.matchMode === 'exact' ? 'と同じ' : 'を含む'}ロットは${filterCount ? '、今の絞り込みの中に' : ''}ありません。一致のしかたや探す列を確かめてください。ほかの列の値で探すときは、見出しの漏斗から絞り込めます。`,
          actions);
      }
      empty.replaceChildren(...(card ? [card] : []));
      empty.hidden = !card;
      tableWrap.hidden = Boolean(card) || !result;
      root.classList.toggle('is-loading', status === 'loading');
    }

    // ── 出どころ ──
    function renderFoot(state) {
      const status = state.cache.status;
      const result = state.search.result;
      const parts = [el('span', {}, [icon(state.mode.mode === 'mock' ? 'fa-flask' : 'fa-database', ''), el('span', { text: ` ${state.mode.label}` })])];
      if (status && status.cacheUpdatedAt) parts.push(el('span', { className: 'mono', text: `${DS.util.formatDateTime(status.cacheUpdatedAt)} 時点のデータ` }));
      if (result && typeof result.elapsedMs === 'number') parts.push(el('span', { className: 'mono', text: `検索 ${result.elapsedMs} ms` }));
      const typed = DS.util.normalize(state.query.keyword);
      if (result && state.search.request && /[！-～　]/.test(state.query.keyword) && typed === state.search.request.keyword) {
        parts.push(el('span', { text: '全角の英数字・記号は半角にそろえて検索しました' }));
      }
      const request = state.search.request;
      if (result && request && Object.values(request.filters || {}).some((spec) => spec.type === 'date' && spec.mode === 'relative')) {
        parts.push(el('span', { className: 'mono', text: `日付は今日（${DS.domain.filters.slashOf(result.today)}）を基準に絞り込み` }));
      }
      if (status && status.usingPreviousCache) {
        parts.push(el('span', { className: 'is-warning' }, [icon('fa-triangle-exclamation', '!'), el('span', { text: ' 前回のデータを使用中' })]));
      }
      foot.replaceChildren(...parts.flatMap((part, index) => (index ? [el('span', { className: 'results__sep', text: '·' }), part] : [part])));
    }

    let lastHidden = store.get().columns.hidden;
    bus.on('state', ({ state, changed }) => {
      if (changed.some((key) => ['search', 'columns'].includes(key))) tools.update(state);
      const tableKeys = ['search', 'columns', 'sort'];
      if (changed.some((key) => tableKeys.includes(key))) {
        renderTable(state);
        renderHead(state);
      } else {
        if (changed.includes('selection')) renderSelection(state);
        if (changed.includes('filters')) renderFilterMarks(state);
      }
      if (changed.some((key) => ['search', 'cache', 'mode'].includes(key))) renderEmpty(state);
      if (changed.some((key) => ['search', 'cache', 'query'].includes(key))) renderFoot(state);
      // 列を出し入れしたときだけ光らせる（幅や行の高さの変更では光らせない）
      if (changed.includes('columns') && state.columns.hidden !== lastHidden) DS.util.flash(tableWrap.querySelector('thead'));
      lastHidden = state.columns.hidden;
    });

    bus.on('search:done', () => {
      tableWrap.scrollTop = 0;
    });
    bus.on('column-filter', () => renderFilterMarks(store.get()));

    const initial = store.get();
    tools.update(initial);
    renderTable(initial);
    renderHead(initial);
    renderEmpty(initial);
    renderFoot(initial);

    return { focusTable: () => tableWrap.focus(), openFilter };
  }

  DS.views.createResultsView = createResultsView;
})();
