/* =========================================================
   サンプルデータ（画面だけで試すモード用）
   乱数の種を固定しているので、毎回同じデータができる。
   パターンを増やすときは patterns.register() を足すだけでよい。
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

  // 日付は「今日」を基準に作る（日付の絞り込み「今日〜7 日後」などをいつ開いても試せるように）
  const now = new Date();
  const BASE_DATE = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const MATERIALS = ['A1100', 'A3003', 'A5052', 'A6061', 'A6063', 'A7075'];
  const TEMPERS = ['O', 'H14', 'H24', 'H32', 'T5', 'T6', 'T651'];
  const CUSTOMERS = ['サンプル工業', 'テスト金属', '見本製作所', '架空商事', '例示精工', 'ダミー産業'];
  const PROCESSES = [['鋳造', 'CST'], ['熱間圧延', 'HR'], ['冷間圧延', 'CR'], ['焼鈍', 'AN'], ['切断', 'SL'], ['検査', 'QC']];
  const STATUSES = ['仕掛中', '検査待ち', '検査済み', '出荷済み', '保留', '不適合'];

  function isoDate(offsetDays) {
    const date = new Date(BASE_DATE.getTime() + offsetDays * 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  /** 標準的な行を count 件つくる。prefix で番号の頭をそろえ、パターン同士で重ならないようにする */
  function buildRows(count, seed, prefix) {
    const rng = createRandom(seed);
    const rows = [];
    let order = 0;
    let orderLeft = 0;
    for (let i = 1; i <= count; i += 1) {
      if (orderLeft === 0) {
        order += 1;
        orderLeft = rng.int(1, 6); // 1 つの受注に複数のロット
      }
      orderLeft -= 1;
      const [process, code] = rng.pick(PROCESSES);
      const n = String(i).padStart(5, '0');
      rows.push({
        lotNo: `LOT-${prefix.year}-${n}`,
        inspectionNo: `INS-${prefix.short}-${String(i).padStart(6, '0')}`,
        castingNo: `CST-${prefix.cast}${String(i).padStart(6, '0')}`,
        orderNo: `ORD-${prefix.short}${String(order).padStart(4, '0')}`,
        material: rng.pick(MATERIALS),
        temper: rng.pick(TEMPERS),
        size: `t${rng.pick(['0.5', '1.0', '1.5', '2.0', '3.0', '5.0'])}×${rng.pick([1000, 1250, 1525])}×${rng.pick([2000, 2500, 3000])}`,
        customer: rng.pick(CUSTOMERS),
        deliveryDate: isoDate(rng.int(-60, 90)),
        process,
        equipment: `${code}-${String(rng.int(1, 4)).padStart(2, '0')}`,
        status: rng.pick(STATUSES),
      });
    }
    return rows;
  }

  function special(lotNo, i, overrides) {
    const base = buildRows(1, 7000 + i, { year: 'SP', short: 'SP', cast: '77' })[0];
    return Object.assign(base, {
      lotNo,
      inspectionNo: `INS-SP-${String(i).padStart(4, '0')}`,
      castingNo: `CST-SP${String(i).padStart(4, '0')}`,
      orderNo: `ORD-SP${String(i).padStart(3, '0')}`,
    }, overrides || {});
  }

  // ── パターン ──
  patterns.register({
    id: 'standard',
    group: 'basic',
    order: 10,
    icon: 'fa-table-list',
    title: '標準のデータ',
    description: 'ロット 300 件。1 つの受注番号に 1〜6 件のロットがひも付いています。納期は今日の前後 3 か月に散らばります。',
    build: () => buildRows(300, 1001, { year: '2026', short: '26', cast: '41' }),
  });

  patterns.register({
    id: 'symbols',
    group: 'input',
    order: 20,
    icon: 'fa-language',
    title: '日本語・記号を含む番号',
    description: '「試作-α-001」「LOT_100%-A」など。全角で「ＬＯＴ＿１００」と入れても見つかることを確かめられます。',
    build: () => [
      special('試作-α-001', 1),
      special('試作-β-002', 2, { status: '保留' }),
      special('LOT_100%-A', 3),
      special('LOT#5/特急', 4),
      special('LOT(再)-12', 5, { status: '不適合' }),
      special("LOT'Q\"-1", 6),
      special('LOT-全角確認-01', 7),
      special('lot-lower-01', 8),
    ],
    demoQuery: { searchType: 'lotNo', keyword: 'ＬＯＴ＿１００', matchMode: 'partial' },
  });

  patterns.register({
    id: 'duplicate-lot',
    group: 'input',
    order: 30,
    icon: 'fa-clone',
    title: '同じロット番号が複数ある',
    description: '同じロット番号で鋳造番号が違う 3 件。詳細は「ロット番号＋鋳造番号」で 1 件に決まります。',
    build: () => [1, 2, 3].map((i) =>
      special('LOT-DUP-0001', 20 + i, { castingNo: `CST-DUP000${i}`, inspectionNo: `INS-DUP-000${i}` })),
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
    description: 'ロット 20,000 件。検索とページ送りの速さを確かめられます。',
    build: () => buildRows(20000, 4004, { year: '2025', short: '25', cast: '93' }),
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
