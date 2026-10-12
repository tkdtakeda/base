/* =========================================================
   画面の動作確認スクリプト（本体とは別。必要なときだけ使う）

   使い方：
     1. src/index.html を Edge で直接開く（サンプルのモード）
     2. F12 → コンソール に、このファイルの中身をすべて貼り付けて Enter
     3. 結果が表で出る。最後に「すべて成功」と出れば OK

   ※ 確認のためにサンプルデータを読み込み直します（終わると元の状態に戻します）。
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

  const { store, search, samples } = app;
  const before = samples.loadedIds();
  const searchFor = async (searchType, keyword, matchMode) => {
    search.setQuery({ searchType, keyword, matchMode: matchMode || 'partial' });
    await search.run({ page: 1 });
    return store.get().search.result;
  };

  try {
    // ── データなし ──
    await app.samples.clear();
    await wait(50);
    check('データなしのとき CTA はサンプルへ案内する', search.readiness().action === 'open-samples');

    // ── 読み込み ──
    await samples.load('standard');
    check('標準のデータを読み込める', store.get().cache.status.rowCount === 300, `${store.get().cache.status.rowCount} 件`);
    check('読み込むと検索の例が動く', store.get().search.result && store.get().search.result.totalCount > 0);

    // ── 検索 ──
    let result = await searchFor('lotNo', 'LOT-2026-00012', 'exact');
    check('完全一致で 1 件', result.totalCount === 1);
    result = await searchFor('lotNo', 'ｌｏｔ－２０２６－０００１２', 'exact');
    check('全角・小文字でも見つかる', result.totalCount === 1);
    result = await searchFor('lotNo', 'LOT-2026-0001', 'partial');
    check('部分一致で複数件', result.totalCount === 10, `${result.totalCount} 件`);
    result = await searchFor('orderNo', 'ORD-260001', 'exact');
    check('受注番号は複数のロットにまたがる', result.totalCount >= 1, `${result.totalCount} 件`);
    result = await searchFor('lotNo', 'NOTHING-0', 'partial');
    check('0 件も正常に表示する', result.totalCount === 0 && document.querySelector('.empty').hidden === false);

    // ── ページ送り・並べ替え ──
    result = await searchFor('lotNo', 'LOT', 'partial');
    check('100 件ずつのページに分かれる', result.count === 100 && result.totalCount === 300);
    search.goToPage(3);
    await wait(150);
    check('ページを送れる', store.get().search.result.page === 3);
    search.toggleSort('lotNo');
    await wait(150);
    check('見出しで降順に並べ替えられる', store.get().sort.order === 'desc' && store.get().search.result.items[0].lotNo === 'LOT-2026-00300');
    search.toggleSort('lotNo');
    await wait(150);

    // ── 詳細 ──
    await search.select(store.get().search.result.items[0]);
    check('行を選ぶと詳細が出る', document.getElementById('detail').hidden === false);
    search.closeDetail();
    check('詳細を閉じられる', document.getElementById('detail').hidden === true);

    // ── 同じロット番号 ──
    await samples.load('duplicate-lot');
    result = store.get().search.result;
    check('同じロット番号の 3 件が出る', result.totalCount === 3);
    await search.select(result.items[2]);
    check('ロット番号＋鋳造番号で 1 件に決まる', store.get().selection.item.castingNo === result.items[2].castingNo);

    // ── 記号 ──
    await samples.load('symbols');
    result = await searchFor('lotNo', '%', 'partial');
    check('% は文字として扱う', result.totalCount === 1, `${result.totalCount} 件`);

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
    for (const id of before) await samples.load(id);
  }

  console.table(results);
  const failed = results.filter((row) => row.結果 !== '成功').length;
  if (failed) console.error(`${failed} 件の確認が失敗しました`);
  else console.log('%cすべて成功', 'color: green; font-weight: bold');
})();
