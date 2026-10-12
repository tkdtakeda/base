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
  const col = window.DS.sample.columnOf; // 論理名 → DB の列名（画面の列の id）
  const LOT = col('lotNo');
  const STATUS = col('cfStatus');
  const CUSTOMER = col('customerName');
  const searchFor = async (keyword, matchMode) => {
    search.setQuery({ keyword, matchMode: matchMode || 'partial' });
    await search.run({ page: 1 });
    return result();
  };

  try {
    // ── データなし ──
    await samples.clear();
    check('データなしのとき CTA はサンプルへ案内する', search.readiness().action === 'open-samples');

    // ── 読み込むと一覧が出る（入力は不要） ──
    search.setQuery({ keyword: '' });
    await search.setFilters({});
    await samples.load('standard');
    const total = store.get().cache.status.rowCount;
    check('読み込むと入力なしで一覧が出る', result() && result().totalCount === total && total > 300, `${total} 件（ロット 300・BOX ごと）`);
    check('一覧は 100 件ずつ', result().count === 100);
    const sortKey = window.DS.domain.DEFAULT_SORT.key;
    const dates = result().items.map((item) => item[sortKey]);
    check('既定の並べ替え（view の defaultSort）の順に並ぶ', dates.every((date, i) => i === 0 || dates[i - 1] <= date), sortKey);

    // ── 番号の検索（任意。探す列は 1 つ） ──
    check('探す列は固定列の 1 つ目', window.DS.domain.searchField().id === LOT && document.querySelector('.search__column').textContent.includes(LOT));
    let r = await searchFor('LOT-2026-00012', 'exact');
    const boxes = r.totalCount;
    check('完全一致でそのロットの BOX だけが出る', boxes >= 1 && boxes <= 3 && r.items.every((item) => item[LOT] === 'LOT-2026-00012'), `${boxes} 件`);
    r = await searchFor('ｌｏｔ－２０２６－０００１２', 'exact');
    check('全角・小文字でも見つかる', r.totalCount === boxes);
    r = await searchFor('NOTHING-0', 'partial');
    check('0 件も正常に表示する', r.totalCount === 0 && document.querySelector('.empty').hidden === false);
    await search.clearKeyword();
    check('入力を消すと一覧に戻る', result().totalCount === total && !store.get().search.request.keyword);

    // ── 絞り込み（どの列でも） ──
    await search.setFilter(STATUS, { type: 'values', values: ['仕掛中'] });
    const wip = result().totalCount;
    check('状態で絞り込める', wip > 0 && wip < total && result().items.every((item) => item[STATUS] === '仕掛中'), `${wip} 件`);
    await search.setFilter(CUSTOMER, { type: 'values', values: ['架空商事'] });
    check('取引先名でも絞り込める（かつ）', result().items.every((item) => item[STATUS] === '仕掛中' && item[CUSTOMER] === '架空商事'), `${result().totalCount} 件`);
    const values = await app.api.call('get_filter_values', { field: STATUS, filters: store.get().filters });
    check('値の一覧に件数が出る（自分の条件は外して数える）', values.values.length > 1);
    check('見出しで絞り込み中の列に印が付く', document.querySelector(`.grid thead th[data-field="${CSS.escape(STATUS)}"]`).classList.contains('is-filtered'));
    const other = window.DS.domain.listFields().find((field) => !field.role && field.filter === 'values');
    document.querySelector(`.grid thead th[data-field="${CSS.escape(other.id)}"] [data-filter]`).click();
    await wait(400);
    const pop = document.querySelector('.col-filter');
    check('見出しの漏斗で、役割のない列の絞り込みが開く', !pop.hidden && pop.textContent.includes(other.label), other.label);
    const box = pop.querySelector('.value-list input[type="checkbox"]');
    box.click();
    await wait(400);
    check('小窓で選ぶとすぐ一覧に反映される', Boolean(store.get().filters[other.id]) && result().items.every((item) => item[other.id] === store.get().filters[other.id].values[0]));
    app.columnFilter.close(false);
    check('小窓を閉じられる', pop.hidden);
    const due = window.DS.domain.fields.get(col('factoryDeliveryDate'));
    check('日付の列は値から判定し、日付の範囲で絞り込む', due.filter === 'date');
    const matched = await app.api.call('get_filter_values', { field: LOT, match: 'lot-2026-0001' });
    check('値が多い列は、文字でデータ全体から探せる', matched.values.length > 0 && matched.values.every((entry) => entry.value.toLowerCase().includes('lot-2026-0001')), `${matched.values.length} 個`);
    await search.clearFilter(other.id);

    // ── 文字の条件・数値の範囲・種類（ほかの絞り込みを外して確かめ、あとで戻す） ──
    const filtersBefore = Object.assign({}, store.get().filters);
    await search.setFilters({});
    await search.setFilter(LOT, { type: 'text', op: 'contains', value: 'lot2026 00012', fuzzy: true });
    check('条件で絞る：記号・空白を無視し、空白で区切った語をすべて含む', result().totalCount >= 1 && result().items.every((item) => item[LOT] === 'LOT-2026-00012'), `${result().totalCount} 件`);
    await search.setFilter(LOT, { type: 'text', op: 'contains', value: 'lot202600012', fuzzy: false });
    check('記号・空白を無視しないと見つからない', result().totalCount === 0);
    await search.setFilter(LOT, { type: 'text', op: 'not_starts', value: 'LOT-2026', fuzzy: true });
    check('「で始まらない」で外せる', result().totalCount === 0);
    await search.clearFilter(LOT);
    const width = window.DS.domain.listFields().find((field) => field.type === 'number');
    check('数値の列は値から判定する', Boolean(width), width && width.label);
    await search.setFilter(width.id, { type: 'number', min: 1.5, max: null });
    check('数値の範囲で絞り込める', result().totalCount > 0 && result().items.every((item) => Number(String(item[width.id]).replace(/,/g, '')) >= 1.5), `${result().totalCount} 件`);
    await search.setFilter(width.id, { type: 'number', min: null, max: null });
    const typed = await app.api.call('update_column_type', { column: width.id, kind: 'text' });
    check('種類を手動で変えて保存できる', typed.kind === 'text' && typed.manual === true);
    const back = await app.api.call('update_column_type', { column: width.id, kind: 'auto' });
    check('「自動」で値からの判定に戻せる', back.kind === 'number' && back.manual === false);
    await search.setFilters(filtersBefore);

    // ── タグ ──
    const saved = tags.save('確認用タグ');
    check('今の条件をタグにできる', saved.ok && store.get().tags.activeId === saved.tag.id);
    check('同じ名前のタグは作れない', tags.save('確認用タグ').ok === false);
    await tags.apply(null);
    check('「すべて」で絞り込みを外せる', result().totalCount === total && store.get().tags.activeId === null);
    await tags.apply(saved.tag.id);
    check('タグを押すと同じ条件に戻る', Object.keys(store.get().filters).length === 2 && store.get().tags.activeId === saved.tag.id);
    await search.setFilter(STATUS, { type: 'values', values: ['仕掛中', '保留'] });
    check('条件を変えると「変更あり」になる', tags.isModified() === true);
    tags.remove(saved.tag.id);
    check('タグを消せる', !store.get().tags.items.some((tag) => tag.id === saved.tag.id));

    // ── 全列の一覧と詳細 ──
    await search.setFilters({});
    const columnCount = window.DS.domain.listFields().length;
    check('一覧に全列が出る（隠した列を除く）', document.querySelectorAll('.grid thead th').length === columnCount - store.get().columns.hidden.length, `${columnCount} 列`);
    check('見出しは DB の列名', document.querySelector('.grid thead th').textContent.trim() === window.DS.domain.listFields()[0].label);
    check('固定列（レコードキー）は左端に固定し、鍵が付く', document.querySelectorAll('.grid thead th.is-pinned').length === window.DS.domain.keyFields().length && document.querySelectorAll('.grid thead th.is-pinned [data-key-edit]').length === window.DS.domain.keyFields().length);
    await search.highlight(result().items[0]);
    check('行を 1 回押すと選ぶだけ（詳細は開かない）', store.get().selection.key && document.getElementById('detail').hidden === true);
    await search.select(result().items[0]);
    check('ダブルクリック／Enter で詳細が出る', document.getElementById('detail').hidden === false);
    search.closeDetail();
    check('詳細を閉じても行の選択は残る', Boolean(store.get().selection.key) && document.getElementById('detail').hidden === true);
    const beforeColumns = store.get().columns;
    const hideId = window.DS.domain.listFields().find((field) => !field.key).id;
    store.merge('columns', { hidden: beforeColumns.hidden.concat([hideId]) });
    check('表示列で隠すと一覧から消える', !document.querySelector(`.grid thead th[data-field="${hideId}"]`));
    store.set({ columns: beforeColumns });

    // ── 1 ロットに BOX が複数 ──
    await samples.load('multi-box');
    r = result();
    check('同じロット番号の 3 BOX が出る', r.totalCount === 3);
    await search.select(r.items[2]);
    check('ロット番号＋BOX番号で 1 件に決まる', store.get().selection.item[col('boxNo')] === r.items[2][col('boxNo')]);
    search.closeDetail();

    // ── 固定列の確認（保存すると画面を読み込み直すため、確かめるだけ） ──
    let keyCheck = await app.api.call('check_record_key', { recordKey: [LOT] });
    check('ロット番号だけでは重なりを知らせる', keyCheck.unique === false && keyCheck.example && keyCheck.example.count === 3, `${keyCheck.duplicateGroups} 組`);
    keyCheck = await app.api.call('check_record_key', { recordKey: [LOT, col('boxNo')] });
    check('ロット番号＋BOX番号なら 1 件に決まる', keyCheck.unique === true);

    // ── 更新の失敗 ──
    await samples.load('refresh-failure');
    check('更新失敗の状態では前回のデータを使う', store.get().cache.status.usingPreviousCache === true);

    // ── 読み込み先（このモードでは模擬） ──
    const { source } = app;
    const beforePath = store.get().source.path;
    let checked = await source.test('"\\\\srv\\share\\memo.txt"');
    check('接続テストは × の段階と対応を示す', checked.ok === false && checked.steps.some((step) => step.status === 'ng' && step.action));
    check('× のときは保存できない', source.canSave('\\\\srv\\share\\memo.txt') === false);
    checked = await source.test('"\\\\srv\\share\\new.sqlite3"');
    check('貼り付けた " は外して確かめる', checked.ok && checked.normalizedPath === '\\\\srv\\share\\new.sqlite3');
    check('確かめた後に入力を変えると保存できない', source.canSave('\\\\srv\\share\\other.sqlite3') === false);
    check('すべて ○ なら保存できる', await source.save('\\\\srv\\share\\new.sqlite3') && store.get().source.path === '\\\\srv\\share\\new.sqlite3');
    await source.test(beforePath);
    await source.save(beforePath);

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
