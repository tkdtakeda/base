/* =========================================================
   検索結果（メイン領域）：要約・ページ送り・一覧・空のときの案内・出どころ
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createResultsView(root, { store, bus, search, openPanel, refresh }) {
    const { el, icon, escapeHtml, highlight, formatNumber } = DS.util;

    const summary = el('div', { className: 'results__summary', 'aria-live': 'polite' });
    const pager = el('div', { className: 'pager' });
    const head = el('div', { className: 'results__head' }, [summary, pager]);
    const tableWrap = el('div', { className: 'table-wrap', tabindex: '0', 'aria-label': '検索結果の一覧（↑↓ で行を移動）' });
    const empty = el('div', { className: 'empty' });
    const foot = el('div', { className: 'results__foot' });
    root.append(head, el('div', { className: 'results__body' }, [tableWrap, empty]), foot);

    let currentItems = [];

    // ── 一覧 ──
    function visibleFields(state) {
      return DS.domain.listFields().filter((field) => state.columns.visible.includes(field.id));
    }

    function headerCell(field, state) {
      const active = state.sort.key === field.id;
      const sortIcon = !active ? 'fa-sort' : state.sort.order === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
      const ariaSort = !active ? 'none' : state.sort.order === 'asc' ? 'ascending' : 'descending';
      const searched = state.search.request && state.search.request.searchType === field.id;
      return `<th scope="col" aria-sort="${ariaSort}" style="min-width:${field.width}px" class="${searched ? 'is-searched' : ''}">` +
        `<button type="button" class="th-btn" data-sort="${field.id}" title="${escapeHtml(field.listLabel)}で並べ替え">` +
        `<span>${escapeHtml(field.listLabel)}</span><i class="fa-solid ${sortIcon} th-btn__icon${active ? ' is-active' : ''}" aria-hidden="true"></i></button></th>`;
    }

    function cell(field, item, request) {
      const value = item[field.id];
      if (DS.domain.hasBadge(field)) return `<td>${DS.domain.badge(field, value).outerHTML}</td>`;
      const text = value === null || value === undefined || value === '' ? '<span class="muted">—</span>'
        : request && request.searchType === field.id ? highlight(value, request.keyword) : escapeHtml(value);
      return `<td class="${field.mono ? 'mono' : ''}${request && request.searchType === field.id ? ' is-searched' : ''}">${text}</td>`;
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
      tableWrap.innerHTML = `<table class="grid"><thead><tr>${fields.map((field) => headerCell(field, state)).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
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
      const sortButton = event.target.closest('[data-sort]');
      if (sortButton) {
        search.toggleSort(sortButton.dataset.sort);
        return;
      }
      const row = event.target.closest('tbody tr');
      if (row) search.select(currentItems[Number(row.dataset.index)]);
    });

    tableWrap.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key) || currentItems.length === 0) return;
      event.preventDefault();
      const selectedKey = store.get().selection.key;
      const index = currentItems.findIndex((item) => DS.domain.recordKey(item) === selectedKey);
      const next = index === -1 ? 0 : Math.min(currentItems.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
      search.select(currentItems[next]);
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
      const title = request.keyword
        ? el('span', { className: 'results__title' }, [
          el('span', { text: `${DS.domain.fields.get(request.searchType).listLabel}が「` }),
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
      const nodes = entries.map(([fieldId, spec]) => {
        const field = DS.domain.fields.get(fieldId);
        const remove = el('button', { type: 'button', className: 'filter-chip__remove', title: `${field.label}の絞り込みを外す`, 'aria-label': `${field.label}の絞り込みを外す` }, [icon('fa-xmark', '×')]);
        remove.addEventListener('click', () => search.clearFilter(fieldId));
        const label = el('button', { type: 'button', className: 'filter-chip__label', title: '絞り込みのパネルで直す' }, [
          icon('fa-filter', ''),
          el('span', { text: `${field.label}：${DS.domain.filters.describe(fieldId, spec)}` }),
        ]);
        label.addEventListener('click', () => openPanel('filters'));
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
        const field = DS.domain.fields.get(request.searchType);
        if (request.matchMode === 'exact') {
          actions.push(actionButton('部分一致で探し直す', 'fa-magnifying-glass-plus', () => {
            search.setQuery({ matchMode: 'partial' });
            search.run({ page: 1 });
          }, false));
        }
        DS.domain.searchableFields().filter((other) => other.id !== request.searchType).forEach((other) => {
          actions.push(actionButton(`${other.listLabel}として探す`, 'fa-arrow-right-arrow-left', () => {
            search.setQuery({ searchType: other.id });
            search.run({ page: 1 });
          }, false));
        });
        card = emptyCard('fa-circle-question', '一致するロットはありません',
          `${field.listLabel}が「${request.keyword}」${request.matchMode === 'exact' ? 'と同じ' : 'を含む'}ロットは${filterCount ? '、今の絞り込みの中に' : ''}ありません。番号の種類や一致のしかたを確かめてください。`,
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

    bus.on('state', ({ state, changed }) => {
      const tableKeys = ['search', 'columns', 'sort'];
      if (changed.some((key) => tableKeys.includes(key))) {
        renderTable(state);
        renderHead(state);
      } else if (changed.includes('selection')) {
        renderSelection(state);
      }
      if (changed.some((key) => ['search', 'cache', 'mode'].includes(key))) renderEmpty(state);
      if (changed.some((key) => ['search', 'cache', 'query'].includes(key))) renderFoot(state);
      if (changed.includes('columns')) DS.util.flash(tableWrap.querySelector('thead'));
    });

    bus.on('search:done', () => {
      tableWrap.scrollTop = 0;
    });

    const initial = store.get();
    renderTable(initial);
    renderHead(initial);
    renderEmpty(initial);
    renderFoot(initial);

    return { focusTable: () => tableWrap.focus() };
  }

  DS.views.createResultsView = createResultsView;
})();
