/* =========================================================
   画面の動作確認スクリプト（本体とは別。必要なときだけ使う）

   使い方：
     1. src/index.html を Edge で直接開く（サンプルのモード）
     2. F12 → コンソール に、このファイルの中身をすべて貼り付けて Enter
     3. 結果が表で出る。最後に「すべて成功」と出れば OK

   ※ 確認のためにサンプルデータ・絞り込み・タグを使います（終わると元の状態に戻します）。
   ========================================================= */
(async function uiCheck() {
  'use strict';

  const app = window.DS && window.DS.app;
  const results = [];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = (name, ok, note) => results.push({ 確認: name, 結果: ok ? '成功' : '失敗', 補足: note || '' });

  if (!app) {
    console.error('DS.app が見つかりません。index.html を開いてから実行してください。');
    return;
  }
  if (app.api.mode !== 'mock') {
    console.error('サンプルのモード（index.html を直接開いたとき）で実行してください。');
    return;
  }

  const { store, search, samples, tags } = app;
  const before = { samples: samples.loadedIds(), tags: store.get().tags.items.slice(), filters: store.get().filters };
  const result = () => store.get().search.result;
  const searchFor = async (searchType, keyword, matchMode) => {
    search.setQuery({ searchType, keyword, matchMode: matchMode || 'partial' });
    await search.run({ page: 1 });
    return result();
  };
  const today = window.DS.domain.filters.todayIso();

  try {
    // ── データなし ──
    await samples.clear();
    check('データなしのとき CTA はサンプルへ案内する', search.readiness().action === 'open-samples');

    // ── 読み込むと一覧が出る（入力は不要） ──
    search.setQuery({ keyword: '' });
    await search.setFilters({});
    await samples.load('standard');
    check('読み込むと入力なしで一覧が出る', result() && result().totalCount === 300, `${result() && result().totalCount} 件`);
    check('一覧は 100 件ずつ', result().count === 100);
    const dates = result().items.map((item) => item.deliveryDate);
    check('納期が近い順（古い順）に並ぶ', dates.every((date, i) => i === 0 || dates[i - 1] <= date));

    // ── 番号の検索（任意） ──
    let r = await searchFor('lotNo', 'LOT-2026-00012', 'exact');
    check('完全一致で 1 件', r.totalCount === 1);
    r = await searchFor('lotNo', 'ｌｏｔ－２０２６－０００１２', 'exact');
    check('全角・小文字でも見つかる', r.totalCount === 1);
    r = await searchFor('lotNo', 'NOTHING-0', 'partial');
    check('0 件も正常に表示する', r.totalCount === 0 && document.querySelector('.empty').hidden === false);
    await search.clearKeyword();
    check('入力を消すと一覧に戻る', result().totalCount === 300 && !store.get().search.request.keyword);

    // ── 絞り込み ──
    await search.setFilter('status', { type: 'values', values: ['仕掛中'] });
    const wip = result().totalCount;
    check('状態で絞り込める', wip > 0 && wip < 300 && result().items.every((item) => item.status === '仕掛中'), `${wip} 件`);
    await search.setFilter('deliveryDate', { type: 'date', mode: 'relative', fromDays: 0, toDays: 30 });
    const end = window.DS.domain.filters.resolveDate({ mode: 'relative', fromDays: 0, toDays: 30 }, today)[1];
    check('納期（今日〜30 日後）でも絞り込める（かつ）', result().items.every((item) => item.status === '仕掛中' && item.deliveryDate >= today && item.deliveryDate <= end), `${result().totalCount} 件`);
    const values = await app.api.call('get_filter_values', { field: 'status', filters: store.get().filters });
    check('値の一覧に件数が出る（自分の条件は外して数える）', values.values.length > 1);

    // ── タグ ──
    const saved = tags.save('確認用タグ');
    check('今の条件をタグにできる', saved.ok && store.get().tags.activeId === saved.tag.id);
    check('同じ名前のタグは作れない', tags.save('確認用タグ').ok === false);
    await tags.apply(null);
    check('「すべて」で絞り込みを外せる', result().totalCount === 300 && store.get().tags.activeId === null);
    await tags.apply(saved.tag.id);
    check('タグを押すと同じ条件に戻る', Object.keys(store.get().filters).length === 2 && store.get().tags.activeId === saved.tag.id);
    await search.setFilter('status', { type: 'values', values: ['仕掛中', '保留'] });
    check('条件を変えると「変更あり」になる', tags.isModified() === true);
    tags.remove(saved.tag.id);
    check('タグを消せる', !store.get().tags.items.some((tag) => tag.id === saved.tag.id));

    // ── 詳細 ──
    await search.setFilters({});
    await search.select(result().items[0]);
    check('行を選ぶと詳細が出る', document.getElementById('detail').hidden === false);
    search.closeDetail();

    // ── 同じロット番号 ──
    await samples.load('duplicate-lot');
    r = result();
    check('同じロット番号の 3 件が出る', r.totalCount === 3);
    await search.select(r.items[2]);
    check('ロット番号＋鋳造番号で 1 件に決まる', store.get().selection.item.castingNo === r.items[2].castingNo);
    search.closeDetail();

    // ── 更新の失敗 ──
    await samples.load('refresh-failure');
    check('更新失敗の状態では前回のデータを使う', store.get().cache.status.usingPreviousCache === true);

    // ── 片付け ──
    await samples.clear();
    check('サンプルだけを消せる', store.get().cache.status.available === false);
  } catch (error) {
    check('途中でエラー', false, error.message);
  } finally {
    // 元の状態に戻す
    await samples.clear();
    for (const id of before.samples) await samples.load(id);
    window.DS.core.storage.write('tags', before.tags);
    store.set({ tags: { items: before.tags, activeId: null } });
    search.setQuery({ keyword: '' });
    await search.setFilters(before.filters);
  }

  console.table(results);
  const failed = results.filter((row) => row.結果 !== '成功').length;
  if (failed) console.error(`${failed} 件の確認が失敗しました`);
  else console.log('%cすべて成功', 'color: green; font-weight: bold');
})();
