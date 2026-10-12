/* =========================================================
   列の登録簿。中身はソースコードに書かず、表示定義（get_view_config）から組み立てる。

     columns      … DB のテーブルの全列。id も見出しも DB の列名
                    並び：固定列 → 番号で探す列 → 別名のある列 → ほかの列（DB の順）
                    kind：date（日付）／ number（数値）／ text（文字列）。autoKind：自動にしたときの種類、manual：手動で決めたか
                    使える絞り込みは種類で決まる（KIND_FILTERS。先頭が既定）
     recordKey    … 固定列（一覧の左端に固定）。DB に足りなければ空（ready=false）
     searchColumn … 番号で探す列（上部バーの入力欄）
     aliases      … 別名（論理名）→ DB の列名。以前の形（論理名）で保存したタグ・表示の設定を読み替える
     hiddenColumns… 最初は隠しておく列。各自が「表示列」で変えられる
     notices      … 設定と DB の食い違い（「データ」パネルに出す）

   表示定義の出どころ
     Python 版・デスクトップ版 … get_view_config 命令（設定 ＋ キャッシュのテーブルの列）
     画面だけで試すモード     … js/sample/sample-view.js（公開サンプルとダミーの列一覧から自動生成）
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  DS.domain = DS.domain || {};

  const SECTIONS = [
    { id: 'role', label: '主な項目', icon: 'fa-key' },
    { id: 'other', label: 'そのほかの項目', icon: 'fa-table-columns' },
  ];

  // 種類 → 使える絞り込み（先頭が既定）。Python 版の lot_service.FILTERS_BY_KIND と同じ
  const KIND_FILTERS = {
    date: ['date'],
    number: ['number', 'values'],
    text: ['values', 'text'],
  };
  const KIND_LABELS = { date: '日付', number: '数値', text: '文字列' };

  let lists = { list: [], key: [], search: null, sections: [], hidden: [] };
  let meta = { version: null, aliases: {}, notices: [], ready: false, settingsFile: '' };

  /** 表示定義を当てはめる。起動時に 1 回、画面の部品を作る前に呼ぶ */
  function applyView(view) {
    const fields = DS.core.createRegistry('fields');
    const options = view.fields || {};
    const recordKey = view.recordKey || [];
    const hiddenNames = new Set(view.hiddenColumns || []);

    (view.columns || []).forEach((column, index) => {
      const option = options[column.id] || {};
      const searchable = column.id === view.searchColumn;
      const key = recordKey.includes(column.id);
      const kind = KIND_FILTERS[column.kind] ? column.kind : 'text';
      fields.register({
        id: column.id,
        order: (index + 1) * 10,
        // 表示名は DB の列名。詳細・一覧の見出し・絞り込みのすべてで同じ
        label: column.label || column.id,
        listLabel: column.label || column.id,
        role: Boolean(column.role),
        // 番号の列（探す列・固定列）は、指定がなければ等幅で表示し、コピーできるようにする（0 と O を見分けやすく、転記しやすく）
        mono: option.mono === undefined ? searchable || key : Boolean(option.mono),
        copy: option.copy === undefined ? searchable || key : Boolean(option.copy),
        example: option.example || '',
        badge: (option.badge || []).map((rule) => ({ pattern: new RegExp(rule.match), tone: rule.tone })),
        type: kind,
        autoKind: KIND_FILTERS[column.autoKind] ? column.autoKind : kind,
        manual: Boolean(column.manual),
        // どの列でも絞り込める。使える絞り込みは種類で決まる（filter は既定）
        filters: KIND_FILTERS[kind].slice(),
        filter: KIND_FILTERS[kind][0],
        searchable,
        key,
      });
    });

    const all = fields.list();
    lists = {
      list: all,
      key: recordKey.map((id) => fields.get(id)).filter(Boolean),
      search: fields.get(view.searchColumn) || null,
      // 詳細は全項目。役割のある列を先にまとめる
      sections: SECTIONS.map((group) => ({ group, fields: all.filter((field) => (group.id === 'role') === field.role) }))
        .filter((section) => section.fields.length),
      hidden: all.filter((field) => hiddenNames.has(field.id)).map((field) => field.id),
    };
    meta = {
      version: view.columnsVersion || null,
      aliases: view.aliases || {},
      notices: view.notices || [],
      ready: Boolean(view.ready),
      settingsFile: view.recordSettingsFile || '',
    };

    DS.domain.fields = fields;
    const sort = view.defaultSort || {};
    DS.domain.DEFAULT_SORT = { key: sort.field || (all[0] && all[0].id) || null, order: sort.order === 'desc' ? 'desc' : 'asc' };
  }

  /** 以前の形（別名＝論理名）で保存した列の名前を、今の列の id（DB の列名）に読み替える。知らない名前はそのまま */
  function migrateId(id) {
    if (DS.domain.fields && DS.domain.fields.has(id)) return id;
    return Object.prototype.hasOwnProperty.call(meta.aliases, id) ? meta.aliases[id] : id;
  }

  DS.domain.applyView = applyView;
  DS.domain.KIND_LABELS = KIND_LABELS;
  DS.domain.migrateId = migrateId;
  DS.domain.listFields = () => lists.list;
  DS.domain.detailFields = () => lists.list;
  DS.domain.detailSections = () => lists.sections;
  /** 番号で探す列（決まっていなければ null） */
  DS.domain.searchField = () => lists.search;
  DS.domain.keyFields = () => lists.key;
  /** 絞り込める列（全列） */
  DS.domain.filterFields = () => lists.list;
  /** 設定で「最初は隠す」とした列の id */
  DS.domain.defaultHiddenColumns = () => lists.hidden.slice();
  /** 列の並びの印（データの更新や固定列の変更で、列の決まりが変わったかを見分ける） */
  DS.domain.columnsVersion = () => meta.version;
  /** 固定列がそろっているか（そろっていなければ詳細は開けない） */
  DS.domain.isReady = () => meta.ready && lists.key.length > 0;
  /** 設定と DB の食い違い [{ path, reason, action }] */
  DS.domain.columnNotices = () => meta.notices.slice();
  /** 固定列の保存先（画面に出すファイル名） */
  DS.domain.recordSettingsFile = () => meta.settingsFile;

  /** 1 件を特定する鍵（例：ロット番号＋BOX番号）を文字列にする。鍵が決まっていなければ行の中身全体 */
  DS.domain.recordKey = (item) => {
    const fields = lists.key.length ? lists.key : lists.list;
    return fields.map((field) => (item[field.id] == null ? '' : item[field.id])).join('\u001f');
  };
})();
