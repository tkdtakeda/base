## 付録：画面側の修正ファイルの全文（3/3）

`src/js/sample/sample-view.js`

```javascript
/* =========================================================
   画面だけで試すモード用の表示定義（自動生成。手で直さない）
   元: config/sample/view.sample.json と schema.sample.json の論理情報
   作り直し: python python/tools/sync_sample_view.py
   ========================================================= */
(function () {
  'use strict';

  window.DS = window.DS || {};
  window.DS.sampleView = /*VIEW_JSON_START*/{
  "logicalFields": [
    "lotNo",
    "boxNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "plannedEquipmentName",
    "businessUnitCode",
    "demandFieldCode",
    "applicationCode",
    "applicationName",
    "orderMaterial",
    "orderTemper",
    "orderThickness",
    "orderWidth",
    "orderLength",
    "manufacturingMaterial",
    "manufacturingTemper",
    "manufacturingThickness",
    "manufacturingWidth",
    "manufacturingLength",
    "productUnitWeight",
    "specificGravity",
    "shape",
    "surface",
    "processing",
    "surfaceProcessing",
    "cleaning",
    "deliverySpecificationNo",
    "wipCategory",
    "allocationCategory",
    "holdCategory",
    "holdReleaseDate",
    "temporaryPackingFlag",
    "urgentCategory",
    "cfStatus",
    "allocationCode",
    "allocationMethod",
    "allocationQuantity",
    "allocationAdjustmentNo",
    "salesDeliveryDate",
    "factoryDeliveryDate",
    "promisedDeliveryDate",
    "shippingDate",
    "wipRetentionTime",
    "deliveryDestinationCode",
    "customerCode",
    "shippingDestinationCode",
    "deliveryDestinationName",
    "customerName",
    "shippingDestinationName",
    "districtCode",
    "salespersonCode",
    "plannedEquipmentCourse",
    "actualEquipmentCourse",
    "remainingEquipmentCourse",
    "totalProcessCount",
    "pitPlannedDate",
    "pitActualDate",
    "specialSpecification",
    "masterNo",
    "specificationNo",
    "qualityNo",
    "manufacturingNo",
    "testNo",
    "personInCharge",
    "boxPlannedThickness",
    "boxPlannedWidth",
    "boxPlannedLength",
    "boxPlannedWorkPattern",
    "boxPlannedWeight",
    "boxPlannedCount",
    "qualityCode",
    "annealingScheduleCategory",
    "annealingFurnaceNo",
    "lastActualProcessBoxNo",
    "lastActualEquipmentName",
    "lastActualThickness",
    "lastActualWidth",
    "lastActualLength",
    "lastActualGoodWeight",
    "lastActualCount",
    "workStartDate",
    "workEndDate"
  ],
  "recordKey": [
    "lotNo",
    "boxNo"
  ],
  "types": {},
  "listColumns": [
    {
      "field": "lotNo",
      "label": "ロット番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "boxNo",
      "label": "BOX番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "inspectionNo",
      "label": "検査番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "castingNo",
      "label": "鋳造番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "orderNo",
      "label": "オーダー番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "manufacturingMaterial",
      "label": "製造材質",
      "visible": true,
      "searchable": false
    },
    {
      "field": "manufacturingTemper",
      "label": "製造調質",
      "visible": true,
      "searchable": false
    },
    {
      "field": "manufacturingThickness",
      "label": "製造板厚",
      "visible": true,
      "searchable": false
    },
    {
      "field": "manufacturingWidth",
      "label": "製造板幅",
      "visible": true,
      "searchable": false
    },
    {
      "field": "manufacturingLength",
      "label": "製造板丈",
      "visible": true,
      "searchable": false
    },
    {
      "field": "customerName",
      "label": "取引先名",
      "visible": true,
      "searchable": true
    },
    {
      "field": "factoryDeliveryDate",
      "label": "工場納期",
      "visible": true,
      "searchable": false
    },
    {
      "field": "remainingEquipmentCourse",
      "label": "残仕掛設備コース",
      "visible": true,
      "searchable": false
    },
    {
      "field": "lastActualEquipmentName",
      "label": "最終実績設備",
      "visible": true,
      "searchable": false
    },
    {
      "field": "wipCategory",
      "label": "仕掛区分",
      "visible": true,
      "searchable": false
    },
    {
      "field": "holdCategory",
      "label": "保留区分",
      "visible": true,
      "searchable": false
    },
    {
      "field": "cfStatus",
      "label": "状態",
      "visible": true,
      "searchable": false
    }
  ],
  "detailFields": [
    "lotNo",
    "boxNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "plannedEquipmentName",
    "businessUnitCode",
    "demandFieldCode",
    "applicationCode",
    "applicationName",
    "orderMaterial",
    "orderTemper",
    "orderThickness",
    "orderWidth",
    "orderLength",
    "manufacturingMaterial",
    "manufacturingTemper",
    "manufacturingThickness",
    "manufacturingWidth",
    "manufacturingLength",
    "productUnitWeight",
    "specificGravity",
    "shape",
    "surface",
    "processing",
    "surfaceProcessing",
    "cleaning",
    "deliverySpecificationNo",
    "wipCategory",
    "allocationCategory",
    "holdCategory",
    "holdReleaseDate",
    "temporaryPackingFlag",
    "urgentCategory",
    "cfStatus",
    "allocationCode",
    "allocationMethod",
    "allocationQuantity",
    "allocationAdjustmentNo",
    "salesDeliveryDate",
    "factoryDeliveryDate",
    "promisedDeliveryDate",
    "shippingDate",
    "wipRetentionTime",
    "deliveryDestinationCode",
    "customerCode",
    "shippingDestinationCode",
    "deliveryDestinationName",
    "customerName",
    "shippingDestinationName",
    "districtCode",
    "salespersonCode",
    "plannedEquipmentCourse",
    "actualEquipmentCourse",
    "remainingEquipmentCourse",
    "totalProcessCount",
    "pitPlannedDate",
    "pitActualDate",
    "specialSpecification",
    "masterNo",
    "specificationNo",
    "qualityNo",
    "manufacturingNo",
    "testNo",
    "personInCharge",
    "boxPlannedThickness",
    "boxPlannedWidth",
    "boxPlannedLength",
    "boxPlannedWorkPattern",
    "boxPlannedWeight",
    "boxPlannedCount",
    "qualityCode",
    "annealingScheduleCategory",
    "annealingFurnaceNo",
    "lastActualProcessBoxNo",
    "lastActualEquipmentName",
    "lastActualThickness",
    "lastActualWidth",
    "lastActualLength",
    "lastActualGoodWeight",
    "lastActualCount",
    "workStartDate",
    "workEndDate"
  ],
  "detailGroups": [
    {
      "id": "identity",
      "label": "識別情報",
      "fields": [
        "lotNo",
        "boxNo",
        "inspectionNo",
        "castingNo",
        "orderNo"
      ]
    },
    {
      "id": "product",
      "label": "製品・製造仕様",
      "fields": [
        "orderMaterial",
        "orderTemper",
        "orderThickness",
        "orderWidth",
        "orderLength",
        "manufacturingMaterial",
        "manufacturingTemper",
        "manufacturingThickness",
        "manufacturingWidth",
        "manufacturingLength",
        "shape",
        "surface",
        "processing",
        "surfaceProcessing",
        "cleaning",
        "productUnitWeight",
        "specificGravity"
      ]
    },
    {
      "id": "trade",
      "label": "取引・納期",
      "fields": [
        "deliveryDestinationCode",
        "deliveryDestinationName",
        "customerCode",
        "customerName",
        "shippingDestinationCode",
        "shippingDestinationName",
        "salesDeliveryDate",
        "factoryDeliveryDate",
        "promisedDeliveryDate",
        "shippingDate",
        "districtCode",
        "salespersonCode"
      ]
    },
    {
      "id": "process",
      "label": "工程・設備",
      "fields": [
        "plannedEquipmentName",
        "plannedEquipmentCourse",
        "actualEquipmentCourse",
        "remainingEquipmentCourse",
        "totalProcessCount",
        "lastActualProcessBoxNo",
        "lastActualEquipmentName",
        "workStartDate",
        "workEndDate"
      ]
    },
    {
      "id": "wip",
      "label": "仕掛・引当",
      "fields": [
        "wipCategory",
        "allocationCategory",
        "allocationCode",
        "allocationMethod",
        "allocationQuantity",
        "allocationAdjustmentNo",
        "wipRetentionTime",
        "holdCategory",
        "holdReleaseDate",
        "temporaryPackingFlag",
        "urgentCategory",
        "cfStatus"
      ]
    },
    {
      "id": "box",
      "label": "BOX情報",
      "fields": [
        "boxPlannedThickness",
        "boxPlannedWidth",
        "boxPlannedLength",
        "boxPlannedWorkPattern",
        "boxPlannedWeight",
        "boxPlannedCount",
        "lastActualThickness",
        "lastActualWidth",
        "lastActualLength",
        "lastActualGoodWeight",
        "lastActualCount"
      ]
    },
    {
      "id": "quality",
      "label": "品質・仕様",
      "fields": [
        "qualityCode",
        "deliverySpecificationNo",
        "specialSpecification",
        "masterNo",
        "specificationNo",
        "qualityNo",
        "manufacturingNo",
        "testNo",
        "personInCharge"
      ]
    },
    {
      "id": "other",
      "label": "用途・管理情報",
      "fields": [
        "businessUnitCode",
        "demandFieldCode",
        "applicationCode",
        "applicationName",
        "pitPlannedDate",
        "pitActualDate",
        "annealingScheduleCategory",
        "annealingFurnaceNo"
      ]
    }
  ],
  "fields": {},
  "filters": [
    {
      "field": "manufacturingMaterial",
      "type": "values"
    },
    {
      "field": "manufacturingTemper",
      "type": "values"
    },
    {
      "field": "customerName",
      "type": "values"
    },
    {
      "field": "remainingEquipmentCourse",
      "type": "values"
    },
    {
      "field": "lastActualEquipmentName",
      "type": "values"
    },
    {
      "field": "wipCategory",
      "type": "values"
    },
    {
      "field": "holdCategory",
      "type": "values"
    },
    {
      "field": "cfStatus",
      "type": "values"
    }
  ],
  "defaultSort": {
    "field": "factoryDeliveryDate",
    "order": "asc"
  }
}/*VIEW_JSON_END*/;
})();
```

`src/js/views/detail-view.js`

```javascript
/* =========================================================
   選んだ行の詳細（メイン領域の右）。項目はまとまりごとに分けて表示する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /**
   * 別のツールへ渡す「送り先」の登録簿。登録すると詳細の下にボタンが出る。
   *   DS.handoffs.register({ id, order, label, icon, send(item) })   item は 12 項目の論理名のデータ
   */
  DS.handoffs = DS.core.createRegistry('handoffs');

  const OPEN_KEY = 'detail:open-groups';
  const DEFAULT_OPEN_GROUPS = 2;

  function createDetailView(root, { store, bus, search, toast }) {
    const { el, icon } = DS.util;

    const title = el('div', { className: 'detail__title' });
    const closeButton = el('button', { type: 'button', className: 'icon-btn', title: '詳細を閉じる（Esc）', 'aria-label': '詳細を閉じる' }, [icon('fa-xmark', '×')]);
    const notice = el('div', { className: 'detail__notice' });
    const body = el('div', { className: 'detail__body' });
    const actions = el('div', { className: 'detail__actions' });
    root.append(el('div', { className: 'detail__head' }, [title, closeButton]), notice, body, actions);
    root.setAttribute('aria-label', '選んだデータの詳細');

    closeButton.addEventListener('click', () => search.closeDetail());
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') search.closeDetail();
    });

    async function copy(value, button) {
      try {
        await navigator.clipboard.writeText(value);
      } catch (error) {
        // file:// などでクリップボード API が使えないときの代わり
        const area = el('textarea', { style: 'position:fixed;opacity:0' });
        area.value = value;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      button.replaceChildren(icon('fa-check', '✓'));
      button.classList.add('is-done');
      window.setTimeout(() => {
        button.replaceChildren(icon('fa-copy', '⧉'));
        button.classList.remove('is-done');
      }, 1200);
      toast.show({ tone: 'success', message: `「${value}」をコピーしました`, timeout: 2000 });
    }

    function valueNode(field, value) {
      if (DS.domain.hasBadge(field)) return DS.domain.badge(field, value);
      if (value === null || value === undefined || value === '') return el('span', { className: 'muted', text: '—' });
      return el('span', { className: field.mono ? 'mono' : '', text: String(value) });
    }

    function render(state) {
      const selection = state.selection;
      root.hidden = !selection.key;
      if (!selection.key) return;
      const item = selection.item;

      // 見出し：1 件を特定する鍵（例：ロット番号＋BOX番号）と、札を持つ項目（例：状態）
      const [headField, ...subFields] = DS.domain.keyFields();
      const badgeField = DS.domain.detailFields().find((field) => DS.domain.hasBadge(field));
      title.replaceChildren(...[
        el('span', { className: 'detail__label', text: headField.label }),
        el('strong', { className: 'detail__lot mono', text: item[headField.id] || '—' }),
        subFields.length ? el('span', { className: 'detail__subkeys' }, subFields.map((field) =>
          el('span', {}, [el('span', { className: 'detail__label', text: `${field.label} ` }), el('span', { className: 'mono', text: item[field.id] || '—' })]))) : null,
        badgeField ? DS.domain.badge(badgeField, item[badgeField.id]) : null,
      ].filter(Boolean));

      const notices = [];
      if (selection.status === 'loading') notices.push(el('p', { className: 'inline-note' }, [icon('fa-spinner', '…', 'fa-spin'), el('span', { text: ' 最新の内容を確かめています' })]));
      if (selection.status === 'error') notices.push(el('p', { className: 'inline-note inline-note--danger' }, [icon('fa-circle-xmark', '×'), el('span', { text: ' ' + selection.error.userMessage })]));
      if (selection.duplicated) {
        const keyNames = DS.domain.keyFields().map((field) => field.label).join('・');
        notices.push(el('p', { className: 'inline-note inline-note--warning' }, [icon('fa-triangle-exclamation', '!'), el('span', { text: ` 同じ${keyNames}のデータが複数あります。最初の 1 件を表示しています。` })]));
      }
      notice.replaceChildren(...notices);

      // 詳細に出す項目は view の detailFields、まとまりと順番は detailGroups。
      // 項目が多いので、まとまりごとに開閉でき、開閉の状態を覚える（最初は先頭の 2 つだけ開く）
      const openState = DS.core.storage.read(OPEN_KEY, {});
      body.replaceChildren(...DS.domain.detailSections().map(({ group, fields }, index) => {
        const rows = fields.flatMap((field) => {
          const value = item[field.id];
          const copyButton = field.copy && value
            ? el('button', { type: 'button', className: 'copy-btn', title: `${field.label}をコピー`, 'aria-label': `${field.label}をコピー` }, [icon('fa-copy', '⧉')])
            : null;
          if (copyButton) copyButton.addEventListener('click', () => copy(String(value), copyButton));
          return [
            el('dt', { text: field.label }),
            el('dd', {}, [valueNode(field, value), copyButton]),
          ];
        });
        const isOpen = openState[group.id] === undefined ? index < DEFAULT_OPEN_GROUPS : openState[group.id];
        const section = el('details', { className: 'detail__group', open: isOpen }, [
          el('summary', { className: 'detail__group-title' }, [
            icon('fa-chevron-right', '›', 'detail__chevron'), icon(group.icon, ''),
            el('span', { text: group.label }), el('span', { className: 'detail__count', text: `${fields.length}` }),
          ]),
          el('dl', { className: 'facts facts--detail' }, rows),
        ]);
        section.addEventListener('toggle', () => {
          const next = DS.core.storage.read(OPEN_KEY, {});
          next[group.id] = section.open;
          DS.core.storage.write(OPEN_KEY, next);
        });
        return section;
      }));
      if (selection.status === 'done') DS.util.flash(title);

      const targets = DS.handoffs.list();
      actions.hidden = targets.length === 0;
      actions.replaceChildren(...targets.map((target) => {
        const button = el('button', { type: 'button', className: 'btn btn--secondary btn--block' }, [icon(target.icon || 'fa-share-from-square', ''), el('span', { text: target.label })]);
        button.addEventListener('click', () => target.send(Object.assign({}, item)));
        return button;
      }));
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.includes('selection')) render(state);
    });
    render(store.get());
  }

  DS.views.createDetailView = createDetailView;
})();
```

`src/js/views/results-view.js`

```javascript
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
```

`src/js/views/search-bar.js`

```javascript
/* =========================================================
   上部バー：番号の種類・入力欄・一致のしかた・主要動作（CTA）
   主要動作は右端の 1 つだけ。位置は固定し、状態に応じてラベルだけを変える。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  const SEGMENT_MAX = 4; // 番号の種類をボタンで並べる上限

  function createSearchBar(root, { store, bus, search, openPanel, refresh }) {
    const { el, icon } = DS.util;
    const searchable = DS.domain.searchableFields();

    // ── 番号の種類 ──
    // 4 種類までは常に見えるボタン（見て選べる）。それより多いと上部バーに収まらないため、
    // 1 つの選択欄にまとめる。どちらも Alt+1〜9 で切り替えられる。
    const useSelect = searchable.length > SEGMENT_MAX;
    const typeSelect = el('select', { className: 'type-select', 'aria-label': '番号の種類', title: '番号の種類（Alt+1〜' + searchable.length + '）' },
      searchable.map((field, index) => el('option', { value: field.id, text: `${index + 1}. ${field.listLabel}` })));
    typeSelect.addEventListener('change', () => chooseType(typeSelect.value));
    const typeButtons = searchable.map((field, index) =>
      el('button', {
        type: 'button',
        className: 'seg__item',
        role: 'radio',
        dataset: { type: field.id },
        title: `${field.listLabel}で検索（Alt+${index + 1}）`,
      }, [el('span', { text: field.listLabel }), el('kbd', { className: 'seg__kbd', text: String(index + 1) })]));
    const typeGroup = el('div', { className: 'seg', role: 'radiogroup', 'aria-label': '番号の種類' }, typeButtons);

    // ── 入力欄 ──
    const input = el('input', {
      type: 'text',
      id: 'search-input',
      className: 'search__input mono',
      autocomplete: 'off',
      spellcheck: 'false',
      maxlength: '100',
      list: 'search-history',
      'aria-describedby': 'search-hint',
    });
    const history = el('datalist', { id: 'search-history' });
    const clearButton = el('button', { type: 'button', className: 'search__clear', title: '入力を消す（Esc）', 'aria-label': '入力を消す' }, [icon('fa-xmark', '×')]);
    const inputLabel = el('label', { className: 'sr-only', for: 'search-input' });
    const inputBox = el('div', { className: 'search__box' }, [
      icon('fa-magnifying-glass', '', 'search__icon'), inputLabel, input, clearButton, history,
    ]);

    // ── 一致のしかた ──
    const MATCH = [
      { id: 'partial', label: '部分一致', title: '入力した文字を含むものを探す' },
      { id: 'exact', label: '完全一致', title: '入力した文字と同じものだけを探す' },
    ];
    const matchButtons = MATCH.map((mode) =>
      el('button', { type: 'button', className: 'seg__item', role: 'radio', dataset: { match: mode.id }, title: mode.title, text: mode.label }));
    const matchGroup = el('div', { className: 'seg seg--compact', role: 'radiogroup', 'aria-label': '一致のしかた' }, matchButtons);

    // ── 主要動作 ──
    const ctaIcon = el('span', { className: 'cta__icon' });
    const ctaLabel = el('span', { className: 'cta__label' });
    const cta = el('button', { type: 'button', className: 'btn btn--primary btn--lg cta', id: 'cta' }, [ctaIcon, ctaLabel]);

    const hint = el('p', { className: 'search__hint', id: 'search-hint' });

    root.appendChild(el('div', { className: 'search' }, [
      el('div', { className: 'search__row' }, [useSelect ? el('span', { className: 'type-select__wrap' }, [icon('fa-hashtag', '#', 'type-select__icon'), typeSelect, icon('fa-chevron-down', '▾', 'type-select__chevron')]) : typeGroup, inputBox, matchGroup, cta]),
      hint,
    ]));

    // ── 操作 ──
    function chooseType(type) {
      search.setQuery({ searchType: type });
      input.focus();
    }

    typeButtons.forEach((button) => button.addEventListener('click', () => chooseType(button.dataset.type)));
    matchButtons.forEach((button) => button.addEventListener('click', () => {
      search.setQuery({ matchMode: button.dataset.match });
      DS.util.flash(button);
      if (DS.util.normalize(store.get().query.keyword)) search.run({ page: 1 });
    }));

    input.addEventListener('input', () => search.setQuery({ keyword: input.value }));
    input.addEventListener('focus', () => window.setTimeout(() => { if (document.activeElement === input) input.select(); }, 0));
    input.addEventListener('keydown', (event) => {
      // 日本語の変換中の Enter では検索しない
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        doPrimary();
      } else if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        clearKeyword();
      }
    });
    clearButton.addEventListener('click', () => {
      clearKeyword();
      input.focus();
    });

    /** 入力を消す。番号で探していた途中なら、一覧に戻す */
    function clearKeyword() {
      input.value = '';
      const request = store.get().search.request;
      if (request && request.keyword) search.clearKeyword();
      else search.setQuery({ keyword: '' });
    }
    cta.addEventListener('click', doPrimary);

    function doPrimary() {
      const ready = search.readiness();
      if (ready.ok) search.run({ page: 1 });
      else if (ready.action === 'open-samples') openPanel('samples');
      else if (ready.action === 'refresh') refresh();
      else {
        DS.util.flash(hint);
        input.focus();
      }
    }

    // Alt+数字：種類の切り替え / 「/」：入力欄へ
    document.addEventListener('keydown', (event) => {
      if (event.altKey && !event.ctrlKey && /^[1-9]$/.test(event.key)) {
        const field = searchable[Number(event.key) - 1];
        if (field) {
          event.preventDefault();
          chooseType(field.id);
          DS.util.flash(useSelect ? typeSelect : typeButtons[Number(event.key) - 1]);
        }
      } else if (event.key === '/' && !event.ctrlKey && !event.altKey && !isTyping(event.target)) {
        event.preventDefault();
        input.focus();
      }
    });

    function isTyping(target) {
      return target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    }

    // ── 表示の更新 ──
    function render(state) {
      const field = DS.domain.fields.get(state.query.searchType);
      typeButtons.forEach((button) => button.setAttribute('aria-checked', String(button.dataset.type === state.query.searchType)));
      if (typeSelect.value !== state.query.searchType) typeSelect.value = state.query.searchType;
      matchButtons.forEach((button) => button.setAttribute('aria-checked', String(button.dataset.match === state.query.matchMode)));
      if (input.value !== state.query.keyword) input.value = state.query.keyword;
      input.placeholder = field.example ? `例：${field.example}` : `${field.listLabel}を入力`;
      inputLabel.textContent = field.listLabel;
      clearButton.hidden = !state.query.keyword;

      const items = (state.history[state.query.searchType] || []);
      history.replaceChildren(...items.map((value) => el('option', { value })));

      const ready = search.readiness();
      cta.disabled = !ready.ok && !ready.action;
      cta.classList.toggle('is-busy', Boolean(ready.busy));
      ctaIcon.replaceChildren(ready.busy
        ? icon('fa-spinner', '…', 'fa-spin')
        : icon(ready.icon || (ready.action === 'open-samples' ? 'fa-flask' : ready.action === 'refresh' ? 'fa-rotate' : 'fa-magnifying-glass'), ''));
      ctaLabel.textContent = ready.busy ? '読み込み中…' : ready.action ? ready.actionLabel : ready.label || '検索する';

      hint.replaceChildren(...(ready.ok
        ? [el('span', { text: 'Enter で検索' }), sep(), el('span', { text: `Alt+1〜${searchable.length} で番号の種類を切り替え` }), sep(), el('span', { text: '/ で入力欄へ' })]
        : [icon('fa-circle-info', 'i'), el('span', { text: ready.reason })]));
      hint.classList.toggle('is-blocked', !ready.ok && !ready.busy && !ready.quiet);
    }

    function sep() {
      return el('span', { className: 'search__sep', 'aria-hidden': 'true', text: '·' });
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.some((key) => ['query', 'search', 'cache', 'history', 'mode'].includes(key))) render(state);
    });
    render(store.get());

    return { focus: () => input.focus() };
  }

  DS.views.createSearchBar = createSearchBar;
})();
```

`src/js/views/status-chips.js`

```javascript
/* =========================================================
   上部バー右：どのデータを見ているか（出どころ）と、その鮮度
   押すと「データ」パネルが開き、詳しい根拠を確かめられる。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /** キャッシュの状態を「アイコン＋文字＋色」の 1 組にまとめる（パネルと共通で使う） */
  function describeCache(cacheState) {
    const status = cacheState.status;
    if (cacheState.refreshing) return { tone: 'info', icon: 'fa-rotate', spin: true, fallback: '…', text: '更新しています' };
    if (!status) return { tone: 'neutral', icon: 'fa-circle-notch', spin: true, fallback: '…', text: '確認しています' };
    if (!status.available) return { tone: 'danger', icon: 'fa-database', fallback: '×', text: 'データなし' };
    if (status.usingPreviousCache) return { tone: 'warning', icon: 'fa-triangle-exclamation', fallback: '!', text: '前回のデータを使用中' };
    if (status.sourceHasUpdate) return { tone: 'warning', icon: 'fa-cloud-arrow-down', fallback: '!', text: '新しい更新があります' };
    return { tone: 'success', icon: 'fa-circle-check', fallback: '✓', text: '最新' };
  }

  function createStatusChips(root, { store, bus, openPanel }) {
    const { el, icon } = DS.util;
    const mode = store.get().mode;

    const modeChip = el('span', {
      className: `chip chip--mode chip--mode-${mode.mode}`,
      title: mode.description,
    }, [icon(mode.mode === 'mock' ? 'fa-flask' : 'fa-database', ''), el('span', { text: mode.label })]);

    const cacheText = el('span', { className: 'chip__text' });
    const cacheSub = el('span', { className: 'chip__sub mono' });
    const cacheIcon = el('span', { className: 'chip__icon' });
    const cacheChip = el('button', {
      type: 'button',
      className: 'chip chip--status',
      title: 'データの状態を見る',
    }, [cacheIcon, cacheText, cacheSub]);
    cacheChip.addEventListener('click', () => openPanel('data'));

    root.append(modeChip, cacheChip);

    function render(state) {
      const view = describeCache(state.cache);
      cacheChip.className = `chip chip--status chip--${view.tone}`;
      cacheIcon.replaceChildren(icon(view.icon, view.fallback, view.spin ? 'fa-spin' : ''));
      cacheText.textContent = view.text;
      const status = state.cache.status;
      cacheSub.textContent = status && status.cacheUpdatedAt ? DS.util.formatDateTime(status.cacheUpdatedAt) + ' 時点' : '';
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.includes('cache')) render(state);
    });
    render(store.get());
  }

  DS.views.describeCache = describeCache;
  DS.views.createStatusChips = createStatusChips;
})();
```

`src/js/views/tag-bar.js`

```javascript
/* =========================================================
   タグの列（一覧のすぐ上・いつも見える）
   [すべて] [タグ…] [＋今の条件を保存]
   よく使う操作（タグを押す）は 1 クリック。名前の変更・並べ替え・削除は選んだタグの ⋮ の中。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createTagBar(root, { store, bus, tags, openPanel }) {
    const { el, icon } = DS.util;
    let editing = null; // { mode: 'save' } | { mode: 'rename', id }
    let menuFor = null;
    let pendingFocus = null;

    const list = el('div', { className: 'tagbar__list', role: 'toolbar', 'aria-label': '絞り込みタグ' });
    const tools = el('div', { className: 'tagbar__tools' });
    root.append(el('span', { className: 'tagbar__label' }, [icon('fa-tags', ''), el('span', { text: 'タグ' })]), list, tools);

    // Esc：開いているタグの操作メニューだけを閉じる（パネルや詳細は閉じない）
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuFor) {
        event.preventDefault();
        menuFor = null;
        render(store.get());
      }
    }, true);

    document.addEventListener('click', (event) => {
      if (menuFor && !event.target.closest('.tag-menu, .tag__more')) {
        menuFor = null;
        render(store.get());
      }
    });

    function chip(label, active, onClick, extra) {
      const button = el('button', {
        type: 'button',
        className: `tag${active ? ' is-active' : ''}`,
        'aria-pressed': String(active),
        title: active && extra && extra.title ? extra.title : label,
      }, [active ? icon('fa-check', '✓') : null, el('span', { className: 'tag__name', text: label })]);
      button.addEventListener('click', onClick);
      return button;
    }

    /** 名前を入れる欄（保存・名前の変更で共通） */
    function nameEditor(initial, onSubmit) {
      const input = el('input', {
        type: 'text',
        className: 'input input--sm tag-editor__input',
        maxlength: String(tags.NAME_MAX),
        placeholder: 'タグの名前（例：架空商事の仕掛品）',
        'aria-label': 'タグの名前',
      });
      input.value = initial || '';
      const message = el('span', { className: 'tag-editor__msg' });
      const ok = el('button', { type: 'button', className: 'btn btn--primary btn--sm' }, [icon('fa-check', '✓'), el('span', { text: '保存' })]);
      const cancel = el('button', { type: 'button', className: 'icon-btn', title: 'やめる（Esc）', 'aria-label': 'やめる' }, [icon('fa-xmark', '×')]);
      const submit = () => {
        const result = onSubmit(input.value);
        if (result && !result.ok) {
          message.textContent = result.reason;
          DS.util.flash(message);
          input.focus();
          return;
        }
        editing = null;
        render(store.get());
      };
      input.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          editing = null;
          render(store.get());
        }
      });
      ok.addEventListener('click', submit);
      cancel.addEventListener('click', () => {
        editing = null;
        render(store.get());
      });
      pendingFocus = input; // 画面に置いた直後に入力欄へ移す（打ち始めた文字を取りこぼさない）
      return el('div', { className: 'tag-editor' }, [input, ok, cancel, message]);
    }

    function menu(tag, index, count) {
      const item = (iconName, label, onClick, options) => {
        const button = el('button', { type: 'button', className: `tag-menu__item${options && options.danger ? ' is-danger' : ''}`, disabled: options && options.disabled }, [icon(iconName, ''), el('span', { text: label })]);
        button.addEventListener('click', () => {
          menuFor = null;
          onClick();
          render(store.get());
        });
        return button;
      };
      return el('div', { className: 'tag-menu', role: 'menu' }, [
        item('fa-pen', '名前を変える', () => { editing = { mode: 'rename', id: tag.id }; }),
        item('fa-arrow-left', '左へ動かす', () => tags.move(tag.id, -1), { disabled: index === 0 }),
        item('fa-arrow-right', '右へ動かす', () => tags.move(tag.id, 1), { disabled: index === count - 1 }),
        el('hr', { className: 'tag-menu__sep' }),
        item('fa-trash-can', 'このタグを消す', () => tags.remove(tag.id), { danger: true }),
      ]);
    }

    function render(state) {
      const activeId = state.tags.activeId;
      const items = state.tags.items;
      const modified = tags.isModified();
      const nodes = [chip('すべて', !activeId, () => tags.apply(null), { title: '絞り込みをしない' })];

      items.forEach((tag, index) => {
        if (editing && editing.mode === 'rename' && editing.id === tag.id) {
          nodes.push(nameEditor(tag.name, (name) => tags.rename(tag.id, name)));
          return;
        }
        const active = tag.id === activeId;
        const describe = Object.entries(tag.filters).map(([fieldId, spec]) =>
          `${DS.domain.fields.get(fieldId).label}：${DS.domain.filters.describe(fieldId, spec)}`).join(' / ');
        const group = el('span', { className: `tag-group${active ? ' is-active' : ''}` }, [
          chip(tag.name, active, () => tags.apply(tag.id), { title: describe }),
        ]);
        group.firstChild.title = describe;
        if (active) {
          if (modified) {
            const overwrite = el('button', { type: 'button', className: 'tag__overwrite', title: '今の条件でこのタグを上書きする' }, [
              el('span', { className: 'tag__modified' }, [icon('fa-circle', '●'), el('span', { text: '変更あり' })]),
              el('span', { text: '上書き保存' }),
            ]);
            overwrite.addEventListener('click', () => tags.overwrite(tag.id));
            group.appendChild(overwrite);
          }
          const more = el('button', { type: 'button', className: 'tag__more', title: 'このタグの操作', 'aria-label': 'このタグの操作', 'aria-haspopup': 'menu' }, [icon('fa-ellipsis-vertical', '⋮')]);
          more.addEventListener('click', (event) => {
            event.stopPropagation();
            menuFor = menuFor === tag.id ? null : tag.id;
            render(store.get());
          });
          group.appendChild(more);
          if (menuFor === tag.id) {
            const node = menu(tag, index, items.length);
            group.appendChild(node);
            // タグの列は横にスクロールするため、メニューは画面に固定し、⋮ の真下に出す
            window.requestAnimationFrame(() => {
              const rect = more.getBoundingClientRect();
              node.style.top = `${rect.bottom + 4}px`;
              node.style.left = `${Math.min(rect.left, window.innerWidth - node.offsetWidth - 8)}px`;
            });
          }
        }
        nodes.push(group);
      });

      if (editing && editing.mode === 'save') {
        nodes.push(nameEditor('', (name) => tags.save(name)));
      }
      list.replaceChildren(...nodes);
      if (pendingFocus) {
        pendingFocus.focus();
        pendingFocus.select();
        pendingFocus = null;
      }

      // 右側：保存ボタン（できないときは理由を文字で出す）
      const can = tags.canSave();
      const toolNodes = [];
      if (!editing || editing.mode !== 'save') {
        const save = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', disabled: !can.ok }, [icon('fa-plus', '+'), el('span', { text: '今の条件をタグにする' })]);
        save.addEventListener('click', () => {
          editing = { mode: 'save' };
          render(store.get());
        });
        if (!can.ok) toolNodes.push(el('span', { className: 'tagbar__hint', text: can.reason }));
        toolNodes.push(save);
      }
      const filterButton = el('button', { type: 'button', className: 'btn btn--ghost btn--sm', title: '絞り込みのパネルを開く' }, [icon('fa-filter', ''), el('span', { text: '絞り込み' })]);
      filterButton.addEventListener('click', () => openPanel('filters'));
      toolNodes.push(filterButton);
      tools.replaceChildren(...toolNodes);
    }

    bus.on('state', ({ state, changed }) => {
      if (changed.some((key) => ['tags', 'filters'].includes(key))) render(state);
    });
    render(store.get());
  }

  DS.views.createTagBar = createTagBar;
})();
```

