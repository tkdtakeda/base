## 付録：画面側の修正ファイルの全文（3/4）

`src/js/sample/sample-data.js`

```javascript
/* =========================================================
   サンプルデータ（画面だけで試すモード用）
   乱数の種を固定しているので、毎回同じデータができる。日付だけは「今日」を基準にする
   （日付の絞り込み「今日〜7 日後」などをいつ開いても試せるように）。
   パターンを増やすときは patterns.register() を足すだけでよい。

   行の項目は、表示定義の列（DS.sampleView.columns の id ＝ DB の列名）すべてを埋める。
   別名（論理名）のある列は、論理名ごとの値の候補（VALUE_RULES）から、それ以外は列名の形（〜Date・〜Width など）から作る。
   列が増えても、列名の形に当てはまればそのままサンプルが作られる。
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

  /** [DB の列名, 値を作るときの名前（別名があれば論理名）] の並び */
  function sampleColumns() {
    const view = DS.sampleView || {};
    const logicalOf = {};
    Object.entries(view.aliases || {}).forEach(([logical, physical]) => { logicalOf[physical] = logical; });
    return (view.columns || []).map((column) => [column.id, logicalOf[column.id] || column.id]);
  }

  /** 論理名 → DB の列名（サンプルのパターンや確認用スクリプトから、別名で列を指すため） */
  function columnOf(logical) {
    const aliases = (DS.sampleView && DS.sampleView.aliases) || {};
    return aliases[logical] || logical;
  }

  /**
   * ロットを lotCount 件つくる。1 ロットに BOX が 1〜3 件（行は BOX ごと）。
   * prefix で番号の頭をそろえ、パターン同士で重ならないようにする。
   */
  function buildRows(lotCount, seed, prefix, options) {
    const rng = createRandom(seed);
    const columns = sampleColumns();
    const lotColumn = columnOf('lotNo');
    const boxColumn = columnOf('boxNo');
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
        columns.forEach(([id, name]) => { row[id] = valueOf(name, ctx, rng); });
        row[lotColumn] = lotNo;
        row[boxColumn] = pad(box, 2);
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
    demoQuery: { keyword: 'ＬＯＴ＿１００', matchMode: 'partial' },
  });

  patterns.register({
    id: 'multi-box',
    group: 'input',
    order: 30,
    icon: 'fa-boxes-stacked',
    title: '1 ロットに BOX が複数',
    description: '同じロット番号で BOX 番号が違う 3 件。詳細は「ロット番号＋BOX番号」で 1 件に決まります。',
    build: () => buildRows(1, 7101, { year: 'DUP', short: 'DP', cast: '88' }, { lotNo: () => 'LOT-DUP-0001', boxes: 3 }),
    demoQuery: { keyword: 'LOT-DUP-0001', matchMode: 'exact' },
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
    demoQuery: { keyword: 'LOT-9999-99999', matchMode: 'exact' },
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
    demoQuery: { keyword: 'LOT-2025-0001', matchMode: 'partial' },
  });

  DS.sample = {
    groups,
    patterns,
    createRandom,
    columnOf,
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
   元: config/sample/view.sample.json と schema.sample.json、python/tools/sample_columns.json（DB の列）
   作り直し: python python/tools/sync_sample_view.py
   ========================================================= */
(function () {
  'use strict';

  window.DS = window.DS || {};
  window.DS.sampleView = /*VIEW_JSON_START*/{
  "columns": [
    {
      "id": "ロット番号",
      "label": "ロット番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "BOX番号",
      "label": "BOX番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "検査番号",
      "label": "検査番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "鋳造番号",
      "label": "鋳造番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "オーダー番号",
      "label": "オーダー番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "取引先名",
      "label": "取引先名",
      "kind": "text",
      "role": true
    },
    {
      "id": "工場納期",
      "label": "工場納期",
      "kind": "date",
      "role": true
    },
    {
      "id": "状態",
      "label": "状態",
      "kind": "text",
      "role": true
    },
    {
      "id": "製造材質",
      "label": "製造材質",
      "kind": "text",
      "role": true
    },
    {
      "id": "製造調質",
      "label": "製造調質",
      "kind": "text",
      "role": true
    },
    {
      "id": "残仕掛設備コース",
      "label": "残仕掛設備コース",
      "kind": "text",
      "role": true
    },
    {
      "id": "最終実績設備",
      "label": "最終実績設備",
      "kind": "text",
      "role": true
    },
    {
      "id": "仕掛区分",
      "label": "仕掛区分",
      "kind": "text",
      "role": true
    },
    {
      "id": "保留区分",
      "label": "保留区分",
      "kind": "text",
      "role": true
    },
    {
      "id": "plannedEquipmentName",
      "label": "plannedEquipmentName",
      "kind": "text",
      "role": false
    },
    {
      "id": "businessUnitCode",
      "label": "businessUnitCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "demandFieldCode",
      "label": "demandFieldCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "applicationCode",
      "label": "applicationCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "applicationName",
      "label": "applicationName",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderMaterial",
      "label": "orderMaterial",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderTemper",
      "label": "orderTemper",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderThickness",
      "label": "orderThickness",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderWidth",
      "label": "orderWidth",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderLength",
      "label": "orderLength",
      "kind": "text",
      "role": false
    },
    {
      "id": "manufacturingThickness",
      "label": "manufacturingThickness",
      "kind": "text",
      "role": false
    },
    {
      "id": "manufacturingWidth",
      "label": "manufacturingWidth",
      "kind": "text",
      "role": false
    },
    {
      "id": "manufacturingLength",
      "label": "manufacturingLength",
      "kind": "text",
      "role": false
    },
    {
      "id": "productUnitWeight",
      "label": "productUnitWeight",
      "kind": "text",
      "role": false
    },
    {
      "id": "specificGravity",
      "label": "specificGravity",
      "kind": "text",
      "role": false
    },
    {
      "id": "shape",
      "label": "shape",
      "kind": "text",
      "role": false
    },
    {
      "id": "surface",
      "label": "surface",
      "kind": "text",
      "role": false
    },
    {
      "id": "processing",
      "label": "processing",
      "kind": "text",
      "role": false
    },
    {
      "id": "surfaceProcessing",
      "label": "surfaceProcessing",
      "kind": "text",
      "role": false
    },
    {
      "id": "cleaning",
      "label": "cleaning",
      "kind": "text",
      "role": false
    },
    {
      "id": "deliverySpecificationNo",
      "label": "deliverySpecificationNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationCategory",
      "label": "allocationCategory",
      "kind": "text",
      "role": false
    },
    {
      "id": "holdReleaseDate",
      "label": "holdReleaseDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "temporaryPackingFlag",
      "label": "temporaryPackingFlag",
      "kind": "text",
      "role": false
    },
    {
      "id": "urgentCategory",
      "label": "urgentCategory",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationCode",
      "label": "allocationCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationMethod",
      "label": "allocationMethod",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationQuantity",
      "label": "allocationQuantity",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationAdjustmentNo",
      "label": "allocationAdjustmentNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "salesDeliveryDate",
      "label": "salesDeliveryDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "promisedDeliveryDate",
      "label": "promisedDeliveryDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "shippingDate",
      "label": "shippingDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "wipRetentionTime",
      "label": "wipRetentionTime",
      "kind": "text",
      "role": false
    },
    {
      "id": "deliveryDestinationCode",
      "label": "deliveryDestinationCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "customerCode",
      "label": "customerCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "shippingDestinationCode",
      "label": "shippingDestinationCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "deliveryDestinationName",
      "label": "deliveryDestinationName",
      "kind": "text",
      "role": false
    },
    {
      "id": "shippingDestinationName",
      "label": "shippingDestinationName",
      "kind": "text",
      "role": false
    },
    {
      "id": "districtCode",
      "label": "districtCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "salespersonCode",
      "label": "salespersonCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "plannedEquipmentCourse",
      "label": "plannedEquipmentCourse",
      "kind": "text",
      "role": false
    },
    {
      "id": "actualEquipmentCourse",
      "label": "actualEquipmentCourse",
      "kind": "text",
      "role": false
    },
    {
      "id": "totalProcessCount",
      "label": "totalProcessCount",
      "kind": "text",
      "role": false
    },
    {
      "id": "pitPlannedDate",
      "label": "pitPlannedDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "pitActualDate",
      "label": "pitActualDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "specialSpecification",
      "label": "specialSpecification",
      "kind": "text",
      "role": false
    },
    {
      "id": "masterNo",
      "label": "masterNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "specificationNo",
      "label": "specificationNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "qualityNo",
      "label": "qualityNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "manufacturingNo",
      "label": "manufacturingNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "testNo",
      "label": "testNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "personInCharge",
      "label": "personInCharge",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedThickness",
      "label": "boxPlannedThickness",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedWidth",
      "label": "boxPlannedWidth",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedLength",
      "label": "boxPlannedLength",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedWorkPattern",
      "label": "boxPlannedWorkPattern",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedWeight",
      "label": "boxPlannedWeight",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedCount",
      "label": "boxPlannedCount",
      "kind": "text",
      "role": false
    },
    {
      "id": "qualityCode",
      "label": "qualityCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "annealingScheduleCategory",
      "label": "annealingScheduleCategory",
      "kind": "text",
      "role": false
    },
    {
      "id": "annealingFurnaceNo",
      "label": "annealingFurnaceNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualProcessBoxNo",
      "label": "lastActualProcessBoxNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualThickness",
      "label": "lastActualThickness",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualWidth",
      "label": "lastActualWidth",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualLength",
      "label": "lastActualLength",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualGoodWeight",
      "label": "lastActualGoodWeight",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualCount",
      "label": "lastActualCount",
      "kind": "text",
      "role": false
    },
    {
      "id": "workStartDate",
      "label": "workStartDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "workEndDate",
      "label": "workEndDate",
      "kind": "date",
      "role": false
    }
  ],
  "columnsVersion": "76e1bfa7f899",
  "recordKey": [
    "ロット番号",
    "BOX番号"
  ],
  "searchColumn": "ロット番号",
  "defaultSort": {
    "field": "工場納期",
    "order": "asc"
  },
  "hiddenColumns": [],
  "fields": {},
  "aliases": {
    "lotNo": "ロット番号",
    "boxNo": "BOX番号",
    "inspectionNo": "検査番号",
    "castingNo": "鋳造番号",
    "orderNo": "オーダー番号",
    "customerName": "取引先名",
    "factoryDeliveryDate": "工場納期",
    "cfStatus": "状態",
    "manufacturingMaterial": "製造材質",
    "manufacturingTemper": "製造調質",
    "remainingEquipmentCourse": "残仕掛設備コース",
    "lastActualEquipmentName": "最終実績設備",
    "wipCategory": "仕掛区分",
    "holdCategory": "保留区分"
  },
  "notices": [],
  "ready": true
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
   *   DS.handoffs.register({ id, order, label, icon, send(item) })   item は 1 件の全列（DB の列名 → 値）。
   *   別名（論理名）で値を取るときは item[DS.domain.migrateId('lotNo')] のように読み替える
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
      root.hidden = !selection.open;
      if (!selection.open) return;
      const item = selection.item;

      // 見出し：1 件を特定する鍵（例：ロット番号＋BOX番号）と、札を持つ項目（例：状態）
      const [headField, ...subFields] = DS.domain.keyFields().length ? DS.domain.keyFields() : DS.domain.listFields().slice(0, 1);
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

`src/js/views/grid-tools.js`

```javascript
/* =========================================================
   一覧の表を、全列を並べても見失わないようにする道具

     左端の固定     … 固定列（例：ロット番号・BOX番号）は横に動かしても残す
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
```

`src/js/views/results-view.js`

```javascript
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
```

