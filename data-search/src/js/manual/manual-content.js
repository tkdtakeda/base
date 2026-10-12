/* =========================================================
   取扱説明書の章。機能を足したら、ここにも register() で章を足す。
   group は作業の順のまとまり。最初は「3 分で使う」を開く。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const groups = DS.core.createRegistry('manualGroups');
  const chapters = DS.core.createRegistry('manualChapters');

  [
    { id: 'start', label: 'はじめに', order: 10 },
    { id: 'search', label: '探す', order: 20 },
    { id: 'data', label: 'データと表示', order: 30 },
    { id: 'trouble', label: '困ったとき', order: 40 },
    { id: 'appendix', label: '付録', order: 50 },
  ].forEach((group) => groups.register(group));

  [
    {
      id: 'quick', group: 'start', order: 10, title: '3 分で使う',
      body: `
        <ol class="manual-steps">
          <li>開くと<strong>ロットの一覧</strong>が決まった順（標準は工場納期の近い順）に出ます。入力は要りません。1 ロットに BOX が複数あれば BOX ごとに 1 行です。</li>
          <li>一覧の上の<strong>タグ</strong>を押すと、保存しておいた絞り込みに切り替わります。</li>
          <li>ロットの行を押すと、右に<strong>詳細</strong>が出ます。<kbd>↑</kbd><kbd>↓</kbd> で行を移れます。</li>
          <li>番号が分かっているときは、上部バーに入れて <kbd>Enter</kbd>。今の絞り込みの中から探します。</li>
        </ol>
        <p>右上の青いボタンは、いつも「次にすること」を指します。データがないときは「サンプルを読み込む」「データを更新する」に変わります。</p>`,
    },
    {
      id: 'modes', group: 'start', order: 20, title: '3 つの起動方法',
      body: `
        <table class="manual-table">
          <tr><th>起動のしかた</th><th>上部バーの表示</th><th>検索するデータ</th></tr>
          <tr><td>index.html をダブルクリック</td><td>サンプル</td><td>ブラウザの中のサンプル（実データは使いません）</td></tr>
          <tr><td>start.bat をダブルクリック</td><td>Python 版</td><td>設定ファイルが指す共有データのコピー</td></tr>
          <tr><td>デスクトップ版（今後）</td><td>デスクトップ版</td><td>同上</td></tr>
        </table>
        <p>どのデータを見ているかは、上部バー右と一覧の下に必ず表示されます。</p>`,
    },
    {
      id: 'filters', group: 'search', order: 5, title: '絞り込む',
      body: `
        <ul>
          <li>一覧の上の「絞り込み」か、左の <span class="manual-icon">▼</span> で絞り込みのパネルが開きます。</li>
          <li>項目を開き、値にチェックを付けるとすぐ一覧に反映されます。値の横の数は、ほかの条件を当てはめたときの件数です。</li>
          <li>項目どうしは「かつ」、同じ項目の中は「または」で絞り込みます。（空欄）も選べます。</li>
          <li>日付の項目は「今日より前」「今日〜7 日後」などから選べます。「範囲を自分で決める」で日数や日付そのものも指定できます。</li>
          <li>今かかっている条件は一覧の見出しに札で出ます。札の × で 1 つずつ外せます。</li>
        </ul>`,
    },
    {
      id: 'tags', group: 'search', order: 6, title: 'タグ（絞り込みを保存して使い回す）',
      body: `
        <ul>
          <li>条件を選んだら、一覧の上の「今の条件をタグにする」で名前を付けて保存します。次回からはタグを押すだけです。</li>
          <li>日付を「今日から○日」で決めたタグは、毎日その日を基準に絞り込みます。日付そのもので決めたタグは、その日付のままです。</li>
          <li>タグを選んだあと条件を変えると「変更あり」と出ます。「上書き保存」でタグを今の条件にできます。</li>
          <li>名前の変更・並べ替え・削除は、選んだタグの <span class="manual-icon">⋮</span> から。消したあと 10 秒間は「元に戻す」で戻せます。</li>
          <li>タグはこの PC のブラウザに保存されます。絞り込みのパネルの下で、ファイルに書き出して、ほかの人に渡せます。</li>
        </ul>`,
    },
    {
      id: 'search', group: 'search', order: 10, title: '番号で探す',
      body: `
        <ul>
          <li><strong>部分一致</strong>：入力した文字を含むものを探します（例：「0012」で LOT-2026-00012 も見つかる）。</li>
          <li><strong>完全一致</strong>：入力した文字と同じものだけを探します。</li>
          <li>今の絞り込み（タグ）の中から探します。見つからないときは「絞り込みを外して探す」を押してください。</li>
          <li>大文字・小文字、全角・半角の違いは気にせず入力できます（全角の英数字は半角にそろえて探します）。</li>
          <li>入力を消す（× か <kbd>Esc</kbd>）と、一覧に戻ります。</li>
          <li>入力欄を選ぶと中身が全部選ばれるので、そのまま次の番号を打てます。<kbd>Esc</kbd> で消せます。</li>
          <li>入力欄では、前に探した番号が候補に出ます。</li>
        </ul>`,
    },
    {
      id: 'results', group: 'search', order: 20, title: '結果を見る・並べ替える',
      body: `
        <ul>
          <li>一覧の上に「何を・どう探したか」と件数が出ます。100 件を超えるとページに分かれ、右上の <span class="manual-icon">‹ ›</span> で移れます。</li>
          <li>見出しを押すと、その列で並べ替えます。もう一度押すと逆順になります。</li>
          <li>探した列は色が付き、一致した部分に印が付きます。</li>
          <li>一覧の下に、検索したデータの時点と、検索にかかった時間が出ます。</li>
        </ul>`,
    },
    {
      id: 'detail', group: 'search', order: 30, title: '詳細を見る・番号をコピーする',
      body: `
        <ul>
          <li>行を選ぶと右に詳細が出ます。設定したまとまりごとに並びます。見出しを押すと開閉でき、開き方は次回も保たれます。</li>
          <li>番号の横の <span class="manual-icon">⧉</span> でコピーできます。</li>
          <li>詳細は 1 件を特定する項目（標準は「ロット番号＋BOX番号」）で決めています。</li>
          <li><kbd>Esc</kbd> か右上の × で閉じます。</li>
        </ul>`,
    },
    {
      id: 'cache', group: 'data', order: 10, title: 'データの状態と更新',
      body: `
        <p>このツールは、共有データを手元に<strong>コピー（キャッシュ）</strong>してから検索します。共有データを直接書き換えることはありません。</p>
        <ul>
          <li>上部バー右の札で状態が分かります：<strong>最新</strong>／<strong>新しい更新があります</strong>／<strong>前回のデータを使用中</strong>／<strong>データなし</strong>。</li>
          <li>左の「データ」で、いつ時点のデータか・件数・前回の更新の結果を確かめられます。</li>
          <li>「データを更新する」で、コピー → 検証 → 入れ替え を行います。検証で問題が見つかったときは入れ替えず、前回のデータを使い続けます。</li>
        </ul>`,
    },
    {
      id: 'source', group: 'data', order: 15, title: '読み込み先を確かめる・変える',
      body: `
        <ol class="manual-steps">
          <li>左の「データ」→「読み込み先」に、今の共有データのパスが出ます。</li>
          <li><strong>接続を確かめる</strong>で、書き方 → 場所 → 読めるか → SQLite か → テーブルと列 → 件数 の順に ○ × が出ます。× の段階には「対応」が出ます。</li>
          <li><strong>変更</strong>を押し、エクスプローラーでファイルを Shift＋右クリック →「パスとしてコピー」して貼り付け、<kbd>Enter</kbd> で確かめます。</li>
          <li>すべて ○ なら「保存して更新」が押せます（もう一度 <kbd>Enter</kbd>）。保存すると、新しい読み込み先からデータを取り直します。</li>
        </ol>
        <p>確かめるだけなら、共有データには何も書き込みません。</p>`,
    },
    {
      id: 'columns', group: 'data', order: 20, title: '表示する列を選ぶ',
      body: `<p>左の「表示列」で、一覧に出す列を選べます。設定は自動で保存され、次に開いたときも同じになります。詳細にはいつもすべての項目が出ます。</p>`,
    },
    {
      id: 'samples', group: 'data', order: 30, title: 'サンプルデータで試す',
      body: `
        <p>index.html を直接開いたときは、左の「サンプル」から目的別のデータを読み込めます。読み込むと、そのデータに合った検索の例を実行します。</p>
        <ul>
          <li>基本の動き／入力の確認（日本語・記号、同じロット番号）／0 件・異常のとき／速さの確認</li>
          <li>「サンプルデータだけを消す」で片付けられます。消したあと 10 秒間は「元に戻す」で戻せます。</li>
        </ul>`,
    },
    {
      id: 'zero', group: 'trouble', order: 10, title: '0 件になったとき',
      body: `
        <ul>
          <li>番号の種類が合っているか確かめてください。0 件の画面から、ほかの種類で探し直せます。</li>
          <li>完全一致のときは「部分一致で探し直す」を試してください。</li>
          <li>上部バー右の札が「前回のデータを使用中」のときは、新しいデータがまだ入っていない可能性があります。</li>
        </ul>`,
    },
    {
      id: 'errors', group: 'trouble', order: 20, title: 'エラーが出たとき',
      body: `
        <ul>
          <li>メッセージに書かれた操作を試してください。</li>
          <li>続くときは、メッセージの<strong>問い合わせ番号</strong>を管理者に伝えてください。ログ（logs フォルダ）から原因を探せます。</li>
          <li>「検索サーバーに接続できません」と出たら、start.bat の黒いウィンドウが開いているか確かめてください。</li>
        </ul>`,
    },
    {
      id: 'keys', group: 'appendix', order: 10, title: 'キーボード操作',
      body: `
        <table class="manual-table">
          <tr><th>キー</th><th>動き</th></tr>
          <tr><td><kbd>/</kbd></td><td>入力欄へ移る</td></tr>
          <tr><td><kbd>Alt</kbd>+<kbd>1</kbd>〜<kbd>4</kbd></td><td>番号の種類を切り替える</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>検索する（日本語の変換中は除く）</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>入力を消す／詳細・パネル・説明書を閉じる</td></tr>
          <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>一覧で行を移る（一覧を選んでいるとき）</td></tr>
          <tr><td><kbd>F1</kbd></td><td>この説明書を開く・閉じる</td></tr>
        </table>`,
    },
  ].forEach((chapter) => chapters.register(chapter));

  DS.manual = { groups, chapters };
})();
