## 付録：画面側の修正ファイルの全文（2/3）

`src/js/controllers/app-state.js`

```javascript
/* =========================================================
   状態の初期値と、設定の自動保存（次に開いたときに元に戻す）
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.controllers = DS.controllers || {};

  const PREFS_KEY = 'prefs';
  const HISTORY_MAX = 8;

  function defaultVisibleColumns() {
    return DS.domain.listFields().map((field) => field.id);
  }

  function createInitialState(mode) {
    const prefs = DS.core.storage.read(PREFS_KEY, {});
    const searchable = DS.domain.searchableFields().map((field) => field.id);
    const knownColumns = (prefs.visibleColumns || []).filter((id) => DS.domain.fields.has(id));
    return {
      mode,
      appInfo: null,
      cache: { status: null, refreshing: false, refreshStartedAt: null },
      query: {
        searchType: searchable.includes(prefs.searchType) ? prefs.searchType : searchable[0],
        keyword: '',
        matchMode: prefs.matchMode === 'exact' ? 'exact' : 'partial',
      },
      sort: Object.assign({}, DS.domain.DEFAULT_SORT),
      filters: {},
      tags: { items: DS.controllers.loadTags(), activeId: null },
      search: { status: 'idle', result: null, request: null, error: null },
      selection: { key: null, item: null, status: 'idle', error: null, duplicated: false },
      ui: { panel: null },
      columns: { visible: knownColumns.length ? knownColumns : defaultVisibleColumns() },
      history: prefs.history || {},
      samplesVersion: 0,
    };
  }

  /** 保存したい部分が変わったときだけ書き込む */
  function attachPrefsPersistence(store, bus) {
    const WATCHED = ['query', 'columns', 'history'];
    bus.on('state', ({ state, changed }) => {
      if (!changed.some((key) => WATCHED.includes(key))) return;
      const result = DS.core.storage.write(PREFS_KEY, {
        searchType: state.query.searchType,
        matchMode: state.query.matchMode,
        visibleColumns: state.columns.visible,
        history: state.history,
      });
      if (!result.ok) bus.emit('prefs:failed', result.reason);
    });
  }

  function pushHistory(history, searchType, keyword) {
    const list = (history[searchType] || []).filter((item) => item !== keyword);
    list.unshift(keyword);
    return Object.assign({}, history, { [searchType]: list.slice(0, HISTORY_MAX) });
  }

  DS.controllers.createInitialState = createInitialState;
  DS.controllers.attachPrefsPersistence = attachPrefsPersistence;
  DS.controllers.defaultVisibleColumns = defaultVisibleColumns;
  DS.controllers.pushHistory = pushHistory;
})();
```

`src/js/controllers/search-controller.js`

```javascript
/* =========================================================
   一覧・検索・絞り込み・詳細の操作。画面の部品はここを呼び、結果は状態（store）を通して受け取る。
   一覧は「絞り込み」と「番号の検索（任意）」の両方を満たすものを出す。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  function createSearchController({ store, bus, api, toast }) {
    let searchToken = 0;
    let detailToken = 0;

    const keywordOf = () => DS.util.normalize(store.get().query.keyword);
    const dataAvailable = () => {
      const status = store.get().cache.status;
      return Boolean(status && status.available);
    };

    /** 主要動作（CTA）が今できるか。できないときは理由と、代わりに勧める操作を返す */
    function readiness() {
      const state = store.get();
      const cacheStatus = state.cache.status;
      if (cacheStatus && !cacheStatus.available) {
        if (state.mode.capabilities.sampleData) {
          return { ok: false, reason: 'サンプルデータを読み込むと一覧が出ます', action: 'open-samples', actionLabel: 'サンプルを読み込む' };
        }
        return { ok: false, reason: '表示できるデータがありません。データを更新してください', action: 'refresh', actionLabel: 'データを更新する' };
      }
      if (state.search.status === 'loading') return { ok: false, reason: '読み込んでいます…', busy: true };
      const searching = state.search.request && state.search.request.keyword;
      if (!keywordOf()) {
        // 番号で探している途中に入力を空にしたら、番号の検索を外して一覧に戻せる
        if (searching) return { ok: true, label: '一覧に戻す', icon: 'fa-list' };
        const field = DS.domain.fields.get(state.query.searchType);
        return { ok: false, quiet: true, reason: `${field.listLabel}を入れると、一覧の中から探せます` };
      }
      return { ok: true };
    }

    function buildRequest(page) {
      const state = store.get();
      const request = {
        page,
        pageSize: state.mode.pageSize || 100,
        sortKey: state.sort.key,
        sortOrder: state.sort.order,
        filters: DS.domain.filters.compact(state.filters),
      };
      const keyword = keywordOf();
      if (keyword) Object.assign(request, { searchType: state.query.searchType, keyword, matchMode: state.query.matchMode });
      return request;
    }

    async function run(options) {
      if (!dataAvailable()) {
        store.set({ search: { status: 'idle', result: null, request: null, error: null } });
        return;
      }
      const request = buildRequest((options && options.page) || 1);
      const token = ++searchToken;
      store.set({ search: Object.assign({}, store.get().search, { status: 'loading', request, error: null }) });
      try {
        const result = await api.call('list_lots', request);
        if (token !== searchToken) return; // 古い結果は捨てる
        const patch = { search: { status: 'done', result, request, error: null } };
        if (request.keyword) patch.history = DS.controllers.pushHistory(store.get().history, request.searchType, result.keyword || request.keyword);
        store.set(patch);
        bus.emit('search:done', result);
        // 選んでいた行が結果に残っていなければ詳細を閉じる
        const selectedKey = store.get().selection.key;
        if (selectedKey && !result.items.some((item) => DS.domain.recordKey(item) === selectedKey)) closeDetail();
      } catch (error) {
        if (token !== searchToken) return;
        store.set({ search: { status: 'error', result: null, request, error } });
        toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
      }
    }

    function setQuery(patch) {
      store.merge('query', patch);
    }

    /** 番号の検索を外して一覧に戻す */
    function clearKeyword() {
      setQuery({ keyword: '' });
      return run({ page: 1 });
    }

    // ── 絞り込み ──
    function setFilter(fieldId, spec) {
      store.set({ filters: Object.assign({}, store.get().filters, { [fieldId]: spec }) });
      return run({ page: 1 });
    }

    function setFilters(filters) {
      store.set({ filters: Object.assign({}, filters) });
      return run({ page: 1 });
    }

    function clearFilter(fieldId) {
      const next = Object.assign({}, store.get().filters);
      delete next[fieldId];
      return setFilters(next);
    }

    /** 見出しを押したときの並べ替え：同じ列なら昇順⇔降順、別の列なら昇順から */
    function toggleSort(key) {
      const sort = store.get().sort;
      const next = sort.key === key ? { key, order: sort.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' };
      store.set({ sort: next });
      if (store.get().search.result) run({ page: 1 });
    }

    function goToPage(page) {
      const result = store.get().search.result;
      if (!result) return;
      const last = Math.max(1, Math.ceil(result.totalCount / result.pageSize));
      run({ page: Math.min(Math.max(1, page), last) });
    }

    /** 読み直し（データの更新のあと） */
    function rerun() {
      return run({ page: 1 });
    }

    // ── 詳細 ──
    async function select(item) {
      const key = DS.domain.recordKey(item);
      const token = ++detailToken;
      // 一覧の値ですぐに表示し（0.4 秒以内の反応）、最新の詳細で置き換える
      store.set({ selection: { key, item, status: 'loading', error: null, duplicated: false } });
      const payload = {};
      DS.domain.keyFields().forEach((field) => { payload[field.id] = item[field.id] == null ? null : item[field.id]; });
      try {
        const result = await api.call('get_lot_detail', payload);
        if (token !== detailToken) return;
        store.set({ selection: { key, item: result.item, status: 'done', error: null, duplicated: Boolean(result.duplicated) } });
      } catch (error) {
        if (token !== detailToken) return;
        store.set({ selection: { key, item, status: 'error', error, duplicated: false } });
      }
    }

    function closeDetail() {
      detailToken += 1;
      store.set({ selection: { key: null, item: null, status: 'idle', error: null, duplicated: false } });
    }

    return {
      readiness, run, setQuery, clearKeyword, setFilter, setFilters, clearFilter,
      toggleSort, goToPage, rerun, select, closeDetail,
    };
  }

  DS.controllers.createSearchController = createSearchController;
})();
```

`src/js/domain/fields.js`

```javascript
/* =========================================================
   論理項目の登録簿。中身はソースコードに書かず、表示定義（view）から組み立てる。

     表示定義の出どころ
       Python 版・デスクトップ版 … get_view_config 命令（config/sample/view.sample.json ＋ config/local/view.local.json）
       画面だけで試すモード     … js/sample/sample-view.js（view.sample.json から自動生成）

   項目・表示名・表示順・検索できる項目・絞り込み・既定の並べ替えを変えるときは、view の JSON を直す。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.domain = DS.domain || {};

  const DEFAULT_GROUP_ICON = 'fa-layer-group';
  const OTHER_GROUP = { id: '__other', label: 'その他', icon: 'fa-ellipsis' };

  let lists = { list: [], detail: [], searchable: [], key: [], filter: [], sections: [] };

  /** 表示定義を当てはめる。起動時に 1 回、画面の部品を作る前に呼ぶ */
  function applyView(view) {
    const groups = DS.core.createRegistry('fieldGroups');
    const fields = DS.core.createRegistry('fields');
    const detailGroups = view.detailGroups || [];
    detailGroups.forEach((group, index) => groups.register({
      id: group.id, label: group.label, icon: group.icon || DEFAULT_GROUP_ICON, order: (index + 1) * 10, members: group.fields || null,
    }));
    groups.register(Object.assign({ order: 99990, members: null }, OTHER_GROUP));

    // まとまりへの所属：detailGroups[].fields を優先し、なければ fields.<項目>.group
    const membership = new Map();
    detailGroups.forEach((group) => (group.fields || []).forEach((id) => membership.set(id, group.id)));

    const columns = new Map((view.listColumns || []).map((column, index) => [column.field, Object.assign({ index }, column)]));
    const filters = new Map((view.filters || []).map((filter) => [filter.field, filter.type]));
    const options = view.fields || {};
    const recordKey = view.recordKey || [];

    view.logicalFields.forEach((id, index) => {
      const column = columns.get(id) || {};
      const option = options[id] || {};
      const groupId = membership.get(id) || (option.group && groups.has(option.group) ? option.group : OTHER_GROUP.id);
      const searchable = column.searchable === true;
      fields.register({
        id,
        order: (index + 1) * 10,
        // label：詳細・絞り込みなどで使う名前（fields.<項目>.label）。listLabel：一覧の見出し・検索の種類（listColumns の label）
        label: option.label || column.label || id,
        listLabel: column.label || option.label || id,
        short: option.short || null,
        group: groupId,
        // 番号で探せる項目は、指定がなければ等幅で表示し、コピーできるようにする（0 と O を見分けやすく、転記しやすく）
        mono: option.mono === undefined ? searchable : Boolean(option.mono),
        copy: option.copy === undefined ? searchable : Boolean(option.copy),
        example: option.example || '',
        width: column.width || 120,
        badge: (option.badge || []).map((rule) => ({ pattern: new RegExp(rule.match), tone: rule.tone })),
        filter: filters.get(id) || null,
        type: (view.types || {})[id] || 'text',
        searchable,
        key: recordKey.includes(id),
      });
    });

    const pick = (ids) => ids.map((id) => fields.get(id)).filter(Boolean);
    const detail = pick(view.detailFields || []);
    const detailSet = new Set(detail.map((field) => field.id));
    // 詳細の区切り：まとまりの順に、まとまりの fields の順（なければ detailFields の順）で並べる
    const sections = groups.list().map((group) => ({
      group,
      fields: group.members
        ? pick(group.members).filter((field) => detailSet.has(field.id))
        : detail.filter((field) => field.group === group.id),
    })).filter((section) => section.fields.length);

    lists = {
      // 一覧に出す列：listColumns の順。visible: false の列は一覧に出さない
      list: pick((view.listColumns || []).filter((column) => column.visible).map((column) => column.field)),
      detail,
      searchable: pick((view.listColumns || []).filter((column) => column.searchable).map((column) => column.field)),
      key: pick(recordKey),
      filter: pick((view.filters || []).map((filter) => filter.field)),
      sections,
    };

    DS.domain.fieldGroups = groups;
    DS.domain.fields = fields;
    DS.domain.DEFAULT_SORT = { key: view.defaultSort.field, order: view.defaultSort.order };
  }

  DS.domain.applyView = applyView;
  DS.domain.listFields = () => lists.list;
  DS.domain.detailFields = () => lists.detail;
  DS.domain.detailSections = () => lists.sections;
  DS.domain.searchableFields = () => lists.searchable;
  DS.domain.keyFields = () => lists.key;
  DS.domain.filterFields = () => lists.filter;

  /** 1 件を特定する鍵（schema の recordKey。例：ロット番号＋BOX番号）を文字列にする */
  DS.domain.recordKey = (item) =>
    lists.key.map((field) => (item[field.id] == null ? '' : item[field.id])).join('\u001f');
})();
```

`src/js/domain/status-tones.js`

```javascript
/* =========================================================
   値の札（バッジ）。色だけで伝えず「アイコン＋文字＋色」で表す。
   どの値をどの色にするかは表示定義（view の fields.<項目>.badge）に書く。
   ここには「色の種類 → アイコン」の対応だけを置く（デザインの決まり）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  const TONES = {
    danger: { icon: 'fa-circle-xmark', fallback: '×' },
    warning: { icon: 'fa-circle-pause', fallback: '!' },
    success: { icon: 'fa-circle-check', fallback: '✓' },
    info: { icon: 'fa-clock', fallback: '…' },
    neutral: { icon: 'fa-circle', fallback: '・' },
  };

  function toneOf(field, value) {
    if (value === null || value === undefined || value === '') return 'neutral';
    const rule = (field.badge || []).find((item) => item.pattern.test(String(value)));
    return rule && TONES[rule.tone] ? rule.tone : 'neutral';
  }

  /** 札を作る。field.badge の決まりを上から順に当てはめ、どれにも当たらなければグレー */
  function badge(field, value) {
    const util = DS.util;
    const tone = toneOf(field, value);
    return util.el('span', { className: `badge badge--${tone}` }, [
      util.icon(TONES[tone].icon, TONES[tone].fallback),
      util.el('span', { text: value === null || value === undefined || value === '' ? '—' : String(value) }),
    ]);
  }

  DS.domain.badge = badge;
  DS.domain.hasBadge = (field) => Boolean(field && field.badge && field.badge.length);
})();
```

`src/js/manual/manual-content.js`

```javascript
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
```

`src/js/panels/panels.js`

```javascript
/* =========================================================
   脇のパネル（データ・表示列・サンプル）
   1 パネル＝1 つの register()。パネルを足すときはこのファイルか別ファイルで register() する。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const { el, icon } = DS.util;

  function section(titleText, children, extraClass) {
    return el('section', { className: `pane-section${extraClass ? ' ' + extraClass : ''}` }, [
      el('h3', { className: 'pane-section__title', text: titleText }),
    ].concat(children));
  }

  // ── データ（キャッシュの状態と更新） ─────────────────────────
  DS.panels.register({
    id: 'data',
    order: 10,
    icon: 'fa-database',
    label: 'データ',
    title: 'データの状態と更新',
    badge(state) {
      const view = DS.views.describeCache(state.cache);
      if (view.tone === 'warning' || view.tone === 'danger') return { tone: view.tone, text: '!', title: view.text };
      return null;
    },
    mount(container, ctx) {
      const summary = el('div', { className: 'status-card' });
      const facts = el('dl', { className: 'facts' });
      const refreshButton = el('button', { type: 'button', className: 'btn btn--secondary btn--block' });
      const progress = el('p', { className: 'pane-note', 'aria-live': 'polite' });
      const sourceNote = el('p', { className: 'pane-note' });
      const configBox = el('div', { className: 'config-help', hidden: true });
      refreshButton.addEventListener('click', () => ctx.cache.refresh());

      container.append(
        summary,
        configBox,
        section('根拠', [facts]),
        section('共有データから更新', [
          el('p', { className: 'pane-note', text: '共有データを手元にコピーし、検証してから入れ替えます。失敗したときは前回のデータをそのまま使います。' }),
          refreshButton,
          progress,
        ]),
        section('このモードについて', [sourceNote]),
      );

      let timer = null;
      function tick(state) {
        const started = state.cache.refreshStartedAt;
        if (!started) {
          progress.textContent = '';
          return;
        }
        const seconds = Math.floor((Date.now() - started) / 1000);
        progress.textContent = seconds >= 5
          ? `コピーと検証をしています（${seconds} 秒）。共有フォルダが遠いと時間がかかります。中途半端なデータを残さないため、途中では止められません。`
          : `コピーと検証をしています（${seconds} 秒）`;
      }

      function fact(label, value, extraClass) {
        return [el('dt', { text: label }), el('dd', { className: extraClass || '', text: value })];
      }

      return {
        update(state) {
          const status = state.cache.status || {};
          const view = DS.views.describeCache(state.cache);
          summary.className = `status-card status-card--${view.tone}`;
          summary.replaceChildren(
            el('span', { className: 'status-card__icon' }, [icon(view.icon, view.fallback, view.spin ? 'fa-spin' : '')]),
            el('div', {}, [
              el('strong', { className: 'status-card__title', text: view.text }),
              el('p', { className: 'status-card__text', text: status.message || '' }),
            ]),
          );
          facts.replaceChildren(...[]
            .concat(fact('検索しているデータ', status.cacheUpdatedAt ? `${DS.util.formatDateTime(status.cacheUpdatedAt)} 時点` : '—', 'mono'))
            .concat(fact('共有データの更新日時', DS.util.formatDateTime(status.sourceModifiedAt), 'mono'))
            .concat(fact('件数', status.rowCount == null ? '—' : `${DS.util.formatNumber(status.rowCount)} 件`, 'mono'))
            .concat(fact('前回の更新', status.lastRefreshAt
              ? `${status.lastRefreshSucceeded === false ? '失敗' : '成功'}（${DS.util.formatAgo(status.lastRefreshAt)}）`
              : '—'))
            .concat(fact('共有データへの接続', status.sourceReachable === false ? 'できません' : status.sourceReachable ? 'できます' : '—'))
            .concat(status.errorMessage ? fact('失敗の理由', status.errorMessage, 'is-warning') : []));

          const refreshing = state.cache.refreshing;
          refreshButton.disabled = refreshing;
          refreshButton.replaceChildren(
            icon('fa-rotate', '', refreshing ? 'fa-spin' : ''),
            el('span', { text: refreshing ? '更新しています…' : 'データを更新する' }));
          window.clearInterval(timer);
          tick(state);
          if (refreshing) timer = window.setInterval(() => tick(ctx.store.get()), 1000);
          sourceNote.textContent = state.mode.description;

          // 設定の注意（ローカルの設定にある未知のキーなど）は、ファイル名と項目を出す
          const warnings = status.settingsWarnings || [];
          configBox.hidden = warnings.length === 0;
          configBox.replaceChildren(...(warnings.length ? [section('設定の注意', warnings.map((w) =>
            el('div', { className: 'config-help__item' }, [
              el('p', { className: 'config-help__where mono', text: `${w.file} ／ ${w.path}` }),
              el('p', { className: 'pane-note', text: w.reason }),
              el('p', { className: 'pane-note', text: `対応：${w.action}` }),
            ])))] : []));
        },
      };
    },
  });

  // ── 表示列 ─────────────────────────────────────────────
  DS.panels.register({
    id: 'columns',
    order: 20,
    icon: 'fa-table-columns',
    label: '表示列',
    title: '一覧に表示する列',
    badge(state) {
      const hidden = DS.domain.listFields().length - state.columns.visible.length;
      return hidden > 0 ? { tone: 'info', text: String(hidden), title: `${hidden} 列を隠しています` } : null;
    },
    mount(container, ctx) {
      const checks = new Map();
      // 選べるのは view の listColumns で visible: true の列だけ（visible: false の列は一覧に出さない）
      const groups = DS.domain.fieldGroups.list().map((group) => {
        const items = DS.domain.listFields().filter((field) => field.group === group.id).map((field) => {
          const box = el('input', { type: 'checkbox', value: field.id });
          box.addEventListener('change', () => toggle(field.id, box.checked, box.parentElement));
          checks.set(field.id, box);
          return el('label', { className: 'check' }, [box, el('span', { text: field.label })]);
        });
        return items.length ? section(group.label, [el('div', { className: 'check-list' }, items)]) : null;
      }).filter(Boolean);
      const reset = el('button', { type: 'button', className: 'btn btn--ghost btn--block' }, [icon('fa-arrow-rotate-left', ''), el('span', { text: 'すべて表示する（既定に戻す）' })]);
      reset.addEventListener('click', () => {
        ctx.store.set({ columns: { visible: DS.controllers.defaultVisibleColumns() } });
        DS.util.flash(container);
      });
      container.append(
        el('p', { className: 'pane-note', text: 'チェックを外した列は一覧から隠れます。詳細にはすべて表示されます。設定は自動で保存されます。' }),
        ...groups,
        reset,
      );

      function toggle(id, checked, row) {
        const order = DS.domain.listFields().map((field) => field.id);
        const current = new Set(ctx.store.get().columns.visible);
        if (checked) current.add(id);
        else current.delete(id);
        if (current.size === 0) {
          checks.get(id).checked = true;
          ctx.toast.show({ tone: 'warning', message: '少なくとも 1 列は表示してください' });
          return;
        }
        ctx.store.set({ columns: { visible: order.filter((x) => current.has(x)) } });
        DS.util.flash(row);
      }

      return {
        update(state) {
          checks.forEach((box, id) => { box.checked = state.columns.visible.includes(id); });
        },
      };
    },
  });

  // ── サンプル ───────────────────────────────────────────
  DS.panels.register({
    id: 'samples',
    order: 30,
    icon: 'fa-flask',
    label: 'サンプル',
    title: 'サンプルデータ',
    mount(container, ctx) {
      if (!ctx.samples.available) {
        container.append(el('div', { className: 'status-card status-card--neutral' }, [
          el('span', { className: 'status-card__icon' }, [icon('fa-ban', '×')]),
          el('div', {}, [
            el('strong', { className: 'status-card__title', text: 'このモードでは使えません' }),
            el('p', { className: 'status-card__text', text: 'サンプルデータは、index.html を直接開いて「画面だけで試す」ときに使えます。今は実際のデータを検索しています。' }),
          ]),
        ]));
        return null;
      }

      const rows = new Map();
      const sections = DS.sample.groups.list().map((group) => {
        const items = DS.sample.patterns.list().filter((pattern) => pattern.group === group.id).map((pattern) => {
          const state = el('span', { className: 'sample__state' });
          const button = el('button', { type: 'button', className: 'btn btn--secondary btn--sm' });
          button.addEventListener('click', () => ctx.samples.load(pattern.id));
          const count = ctx.samples.countOf(pattern.id);
          const node = el('li', { className: 'sample' }, [
            el('span', { className: 'sample__icon' }, [icon(pattern.icon, '')]),
            el('div', { className: 'sample__body' }, [
              el('strong', { className: 'sample__title', text: pattern.title }),
              el('span', { className: 'sample__desc', text: pattern.description }),
              el('span', { className: 'sample__meta' }, [
                count ? el('span', { className: 'mono', text: `${DS.util.formatNumber(count)} 件` }) : null,
                pattern.demoQuery ? el('span', { text: '読み込むと検索の例を実行します' }) : null,
                state,
              ]),
            ]),
            button,
          ]);
          rows.set(pattern.id, { node, button, state });
          return node;
        });
        return section(group.label, [el('ul', { className: 'sample-list' }, items)]);
      });

      const total = el('p', { className: 'pane-note mono' });
      const clear = el('button', { type: 'button', className: 'btn btn--danger-ghost btn--block' }, [icon('fa-trash-can', ''), el('span', { text: 'サンプルデータだけを消す' })]);
      clear.addEventListener('click', () => ctx.samples.clear());

      container.append(
        el('p', { className: 'pane-note', text: '目的に合わせて読み込むと、そのまま動きを確かめられます。毎回同じデータができます。' }),
        ...sections,
        section('片付け', [total, clear, el('p', { className: 'pane-note', text: '消したあと 10 秒間は「元に戻す」で戻せます。' })], 'pane-section--end'),
      );

      return {
        update() {
          const loaded = ctx.samples.loadedIds();
          rows.forEach((row, id) => {
            const isLoaded = loaded.includes(id);
            row.node.classList.toggle('is-loaded', isLoaded);
            row.state.replaceChildren(...(isLoaded ? [icon('fa-check', '✓'), el('span', { text: '読み込み済み' })] : []));
            row.button.textContent = isLoaded ? '読み直す' : '読み込む';
          });
          const rowsCount = ctx.store.get().cache.status ? ctx.store.get().cache.status.rowCount || 0 : 0;
          total.textContent = loaded.length ? `今あるサンプル：${DS.util.formatNumber(rowsCount)} 件` : '今あるサンプル：なし';
          clear.disabled = loaded.length === 0;
          clear.title = loaded.length === 0 ? '消すサンプルがありません' : '';
        },
      };
    },
  });
})();
```

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

