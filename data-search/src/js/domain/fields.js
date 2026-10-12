/* =========================================================
   列の登録簿。中身はソースコードに書かず、表示定義（get_view_config）から組み立てる。

     columns      … 表示する列（DB のテーブルから読み取った全列）。label は DB の列名
                    並び：役割のある列（schema.columns の順）→ ほかの列（DB の順）
     roleFields   … 役割のある列の論理名（1 件を決める・検索・絞り込み・並べ替え）
     searchFields … 番号で探せる列
     hiddenColumns… 最初は隠しておく列（論理名か DB の列名）。各自が「表示列」で変えられる

   表示定義の出どころ
     Python 版・デスクトップ版 … get_view_config 命令（config の schema / view ＋ キャッシュのテーブルの列）
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

  let lists = { list: [], searchable: [], key: [], filter: [], sections: [], hidden: [] };
  let version = null;

  /** 表示定義を当てはめる。起動時に 1 回、画面の部品を作る前に呼ぶ */
  function applyView(view) {
    const fields = DS.core.createRegistry('fields');
    const filters = new Map((view.filters || []).map((filter) => [filter.field, filter.type]));
    const searchFields = view.searchFields || [];
    const options = view.fields || {};
    const recordKey = view.recordKey || [];
    const hiddenNames = new Set(view.hiddenColumns || []);

    (view.columns || []).forEach((column, index) => {
      // 表示の補助（等幅・コピー・入力例・値の札）は、論理名か DB の列名のどちらで書いてもよい
      const option = options[column.id] || options[column.label] || {};
      const searchable = searchFields.includes(column.id);
      fields.register({
        id: column.id,
        order: (index + 1) * 10,
        // 表示名は DB の列名。詳細・一覧の見出し・検索の種類・絞り込みのすべてで同じ
        label: column.label,
        listLabel: column.label,
        role: Boolean(column.role),
        // 番号で探せる列は、指定がなければ等幅で表示し、コピーできるようにする（0 と O を見分けやすく、転記しやすく）
        mono: option.mono === undefined ? searchable : Boolean(option.mono),
        copy: option.copy === undefined ? searchable : Boolean(option.copy),
        example: option.example || '',
        badge: (option.badge || []).map((rule) => ({ pattern: new RegExp(rule.match), tone: rule.tone })),
        filter: filters.get(column.id) || null,
        type: (view.types || {})[column.id] || (view.types || {})[column.label] || 'text',
        searchable,
        key: recordKey.includes(column.id),
      });
    });

    const all = fields.list();
    const pick = (ids) => ids.map((id) => fields.get(id)).filter(Boolean);
    lists = {
      list: all,
      searchable: pick(searchFields),
      key: pick(recordKey),
      filter: pick((view.filters || []).map((filter) => filter.field)),
      // 詳細は全項目。役割のある列を先にまとめる
      sections: SECTIONS.map((group) => ({ group, fields: all.filter((field) => (group.id === 'role') === field.role) }))
        .filter((section) => section.fields.length),
      hidden: all.filter((field) => hiddenNames.has(field.id) || hiddenNames.has(field.label)).map((field) => field.id),
    };
    version = view.columnsVersion || null;

    DS.domain.fields = fields;
    DS.domain.DEFAULT_SORT = { key: view.defaultSort.field, order: view.defaultSort.order };
  }

  DS.domain.applyView = applyView;
  DS.domain.listFields = () => lists.list;
  DS.domain.detailFields = () => lists.list;
  DS.domain.detailSections = () => lists.sections;
  DS.domain.searchableFields = () => lists.searchable;
  DS.domain.keyFields = () => lists.key;
  DS.domain.filterFields = () => lists.filter;
  /** 設定で「最初は隠す」とした列の id */
  DS.domain.defaultHiddenColumns = () => lists.hidden.slice();
  /** 列の並びの印（データの更新で列が変わったかを見分ける） */
  DS.domain.columnsVersion = () => version;

  /** 1 件を特定する鍵（schema の recordKey。例：ロット番号＋BOX番号）を文字列にする */
  DS.domain.recordKey = (item) =>
    lists.key.map((field) => (item[field.id] == null ? '' : item[field.id])).join('\u001f');
})();
