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
