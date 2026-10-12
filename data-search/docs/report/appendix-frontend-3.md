## 付録：画面側の修正ファイルの全文（3/4）

`src/js/sample/sample-data.js`

```javascript
/* =========================================================
   サンプルデータ（画面だけで試すモード用）
   乱数の種を固定しているので、毎回同じデータができる。日付だけは「今日」を基準にする
   （日付の絞り込み「今日〜7 日後」などをいつ開いても試せるように）。
   パターンを増やすときは patterns.register() を足すだけでよい。

   行の項目は、表示定義の論理項目（DS.sampleView.logicalFields）すべてを埋める。
   主な項目は値の候補（VALUE_RULES）から、それ以外は項目名の形（〜Date・〜Width など）から作る。
   論理項目が増えても、項目名の形に当てはまればそのままサンプルが作られる。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const groups = DS.core.createRegistry('sampleGroups');
  const patterns = DS.core.createRegistry('samplePatterns');

  [
    { id: 'basic', label: '基本の動き', order: 10 },
    { id: 'input', label: '入力の確認', order: 20 },
    { id: 'abnormal', label: '0 件・異常のとき', order: 30 },
    { id: 'perf', label: '速さの確認', order: 40 },
  ].forEach((group) => groups.register(group));

  // ── 乱数（種を固定） ──
  function createRandom(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      pick: (list) => list[Math.floor(next() * list.length)],
    };
  }

  const now = new Date();
  const BASE_DATE = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const pad = (n, width) => String(n).padStart(width, '0');

  function isoDate(offsetDays) {
    const date = new Date(BASE_DATE.getTime() + offsetDays * 86400000);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
  }

  // ── 値の候補（架空の値だけ） ──
  const MATERIALS = ['A1100', 'A3003', 'A5052', 'A6061', 'A6063', 'A7075'];
  const TEMPERS = ['O', 'H14', 'H24', 'H32', 'T5', 'T6', 'T651'];
  const CUSTOMERS = [['C0101', 'サンプル工業'], ['C0102', 'テスト金属'], ['C0103', '見本製作所'], ['C0104', '架空商事'], ['C0105', '例示精工'], ['C0106', 'ダミー産業']];
  const EQUIPMENTS = ['鋳造1号', '熱間圧延1号', '冷間圧延1号', '冷間圧延2号', '焼鈍炉3号', 'スリッター1号', '検査ライン1号'];
  const COURSES = ['HR→CR→AN→SL', 'CR→AN→SL', 'AN→SL', 'SL', 'CR→SL', '—'];
  const STATUSES = ['仕掛中', '検査待ち', '検査済み', '出荷済み', '保留', '不適合'];
  const WIP_CATEGORIES = ['仕掛', '完成', '出荷待ち'];
  const HOLD_CATEGORIES = ['', '', '', '品質保留', '客先保留'];
  const SHAPES = ['板', 'コイル', '条'];
  const SURFACES = ['ミル', '研磨', 'ヘアライン'];

  /** 主な項目の作り方。ctx は同じロット・BOX の行で共有する値 */
  const VALUE_RULES = {
    inspectionNo: (ctx) => `INS-${ctx.prefix.short}-${pad(ctx.serial, 6)}`,
    castingNo: (ctx) => `CST-${ctx.prefix.cast}${pad(ctx.lotIndex, 6)}`,
    orderNo: (ctx) => `ORD-${ctx.prefix.short}${pad(ctx.order, 4)}`,
    customerCode: (ctx) => ctx.customer[0],
    customerName: (ctx) => ctx.customer[1],
    deliveryDestinationCode: (ctx) => ctx.customer[0].replace('C', 'D'),
    deliveryDestinationName: (ctx) => `${ctx.customer[1]} 本社工場`,
    shippingDestinationCode: (ctx) => ctx.customer[0].replace('C', 'S'),
    shippingDestinationName: (ctx) => `${ctx.customer[1]} 物流センター`,
    orderMaterial: (ctx) => ctx.material,
    manufacturingMaterial: (ctx) => ctx.material,
    orderTemper: (ctx) => ctx.temper,
    manufacturingTemper: (ctx) => ctx.temper,
    plannedEquipmentName: (ctx, rng) => rng.pick(EQUIPMENTS),
    lastActualEquipmentName: (ctx, rng) => rng.pick(EQUIPMENTS),
    remainingEquipmentCourse: (ctx, rng) => rng.pick(COURSES),
    cfStatus: (ctx, rng) => rng.pick(STATUSES),
    wipCategory: (ctx, rng) => rng.pick(WIP_CATEGORIES),
    holdCategory: (ctx, rng) => rng.pick(HOLD_CATEGORIES),
    shape: (ctx, rng) => rng.pick(SHAPES),
    surface: (ctx, rng) => rng.pick(SURFACES),
    specificGravity: () => '2.71',
    factoryDeliveryDate: (ctx) => isoDate(ctx.dueOffset),
    salesDeliveryDate: (ctx) => isoDate(ctx.dueOffset + 3),
    promisedDeliveryDate: (ctx) => isoDate(ctx.dueOffset + 5),
    shippingDate: (ctx) => isoDate(ctx.dueOffset - 1),
  };

  /** 項目名の形からの作り方（上から順に当てはめる） */
  const NAME_RULES = [
    [/Date$/, (ctx, rng) => isoDate(rng.int(-60, 90))],
    [/Thickness$/, (ctx) => ctx.thickness],
    [/Width$/, (ctx) => ctx.width],
    [/Length$/, (ctx) => ctx.length],
    [/Weight$/, (ctx, rng) => String(rng.int(300, 3000))],
    [/(Count|Quantity)$/, (ctx, rng) => String(rng.int(1, 20))],
    [/Time$/, (ctx, rng) => (rng.int(10, 900) / 10).toFixed(1)],
    [/(Category|Flag)$/, (ctx, rng) => rng.pick(['0', '1', '2'])],
    [/Code$/, (ctx, rng) => `${rng.pick(['A', 'B', 'K', 'M'])}${pad(rng.int(1, 99), 2)}`],
    [/No$/, (ctx, rng, field) => `${field.replace(/No$/, '').replace(/[a-z]/g, '').toUpperCase() || 'N'}${pad(rng.int(1, 99999), 5)}`],
    [/Course$/, (ctx, rng) => rng.pick(COURSES)],
    [/Name$/, (ctx, rng, field) => `${field.replace(/Name$/, '')}-${rng.int(1, 9)}`],
  ];

  function valueOf(field, ctx, rng) {
    if (VALUE_RULES[field]) return VALUE_RULES[field](ctx, rng);
    const rule = NAME_RULES.find(([pattern]) => pattern.test(field));
    return rule ? rule[1](ctx, rng, field) : `${field}-${rng.int(1, 9)}`;
  }

  function logicalFields() {
    return (DS.sampleView && DS.sampleView.logicalFields) || [];
  }

  /**
   * ロットを lotCount 件つくる。1 ロットに BOX が 1〜3 件（行は BOX ごと）。
   * prefix で番号の頭をそろえ、パターン同士で重ならないようにする。
   */
  function buildRows(lotCount, seed, prefix, options) {
    const rng = createRandom(seed);
    const fields = logicalFields();
    const rows = [];
    let order = 0;
    let orderLeft = 0;
    let serial = 0;
    for (let lotIndex = 1; lotIndex <= lotCount; lotIndex += 1) {
      if (orderLeft === 0) {
        order += 1;
        orderLeft = rng.int(1, 4); // 1 つのオーダーに複数のロット
      }
      orderLeft -= 1;
      const lotNo = (options && options.lotNo) ? options.lotNo(lotIndex) : `LOT-${prefix.year}-${pad(lotIndex, 5)}`;
      const boxCount = (options && options.boxes) || rng.int(1, 3);
      const lot = {
        prefix, lotIndex, order,
        customer: rng.pick(CUSTOMERS),
        material: rng.pick(MATERIALS),
        temper: rng.pick(TEMPERS),
        thickness: rng.pick(['0.50', '1.00', '1.50', '2.00', '3.00', '5.00']),
        width: String(rng.pick([1000, 1250, 1525])),
        length: String(rng.pick([2000, 2500, 3000])),
        dueOffset: rng.int(-45, 90),
      };
      for (let box = 1; box <= boxCount; box += 1) {
        serial += 1;
        const ctx = Object.assign({ serial, box }, lot);
        const row = {};
        fields.forEach((field) => { row[field] = valueOf(field, ctx, rng); });
        row.lotNo = lotNo;
        row.boxNo = pad(box, 2);
        rows.push(row);
      }
    }
    return rows;
  }

  // ── パターン ──
  patterns.register({
    id: 'standard',
    group: 'basic',
    order: 10,
    icon: 'fa-table-list',
    title: '標準のデータ',
    description: 'ロット 300 件（1 ロットに BOX 1〜3 件）。1 つのオーダー番号に複数のロットがひも付きます。工場納期は今日の前後 3 か月に散らばります。',
    build: () => buildRows(300, 1001, { year: '2026', short: '26', cast: '41' }),
  });

  patterns.register({
    id: 'symbols',
    group: 'input',
    order: 20,
    icon: 'fa-language',
    title: '日本語・記号を含む番号',
    description: '「試作-α-001」「LOT_100%-A」など。全角で「ＬＯＴ＿１００」と入れても見つかることを確かめられます。',
    build: () => {
      const lots = ['試作-α-001', '試作-β-002', 'LOT_100%-A', 'LOT#5/特急', 'LOT(再)-12', "LOT'Q\"-1", 'LOT-全角確認-01', 'lot-lower-01'];
      return buildRows(lots.length, 7001, { year: 'SP', short: 'SP', cast: '77' }, { lotNo: (i) => lots[i - 1], boxes: 1 });
    },
    demoQuery: { searchType: 'lotNo', keyword: 'ＬＯＴ＿１００', matchMode: 'partial' },
  });

  patterns.register({
    id: 'multi-box',
    group: 'input',
    order: 30,
    icon: 'fa-boxes-stacked',
    title: '1 ロットに BOX が複数',
    description: '同じロット番号で BOX 番号が違う 3 件。詳細は「ロット番号＋BOX番号」で 1 件に決まります。',
    build: () => buildRows(1, 7101, { year: 'DUP', short: 'DP', cast: '88' }, { lotNo: () => 'LOT-DUP-0001', boxes: 3 }),
    demoQuery: { searchType: 'lotNo', keyword: 'LOT-DUP-0001', matchMode: 'exact' },
  });

  patterns.register({
    id: 'zero-hit',
    group: 'abnormal',
    order: 40,
    icon: 'fa-circle-question',
    title: '0 件になる検索',
    description: '標準のデータを読み込み、存在しない番号で完全一致の検索をします。',
    requires: ['standard'],
    build: () => [],
    demoQuery: { searchType: 'lotNo', keyword: 'LOT-9999-99999', matchMode: 'exact' },
  });

  patterns.register({
    id: 'refresh-failure',
    group: 'abnormal',
    order: 50,
    icon: 'fa-plug-circle-xmark',
    title: '更新に失敗した状態',
    description: '共有データに接続できず、前回のデータを使っている状態を再現します。データの更新も失敗します。',
    requires: ['standard'],
    effects: { refreshFailure: true },
    build: () => [],
  });

  patterns.register({
    id: 'large',
    group: 'perf',
    order: 60,
    icon: 'fa-gauge-high',
    title: '大量のデータ',
    description: 'ロット 10,000 件（BOX 約 20,000 件）。検索とページ送りの速さを確かめられます。',
    build: () => buildRows(10000, 4004, { year: '2025', short: '25', cast: '93' }),
    demoQuery: { searchType: 'orderNo', keyword: 'ORD-25', matchMode: 'partial' },
  });

  DS.sample = {
    groups,
    patterns,
    createRandom,
    /** requires を含めて、読み込むべきパターンの id をそろえる */
    expand(ids) {
      const result = [];
      const visit = (id) => {
        const pattern = patterns.get(id);
        if (!pattern || result.includes(id)) return;
        (pattern.requires || []).forEach(visit);
        result.push(id);
      };
      ids.forEach(visit);
      return result;
    },
  };
})();
```

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

