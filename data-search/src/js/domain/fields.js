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

  const OTHER_GROUP = { id: '__other', label: 'その他', icon: 'fa-ellipsis', order: 9999 };

  let lists = { list: [], detail: [], searchable: [], key: [], filter: [] };

  /** 表示定義を当てはめる。起動時に 1 回、画面の部品を作る前に呼ぶ */
  function applyView(view) {
    const groups = DS.core.createRegistry('fieldGroups');
    const fields = DS.core.createRegistry('fields');
    (view.detailGroups || []).forEach((group, index) => groups.register(Object.assign({ order: (index + 1) * 10 }, group)));

    const columns = new Map((view.listColumns || []).map((column, index) => [column.field, Object.assign({ index }, column)]));
    const filters = new Map((view.filters || []).map((filter) => [filter.field, filter.type]));
    const options = view.fields || {};
    const recordKey = view.recordKey || [];
    let usesOther = false;

    view.logicalFields.forEach((id, index) => {
      const column = columns.get(id) || {};
      const option = options[id] || {};
      const group = option.group && groups.has(option.group) ? option.group : OTHER_GROUP.id;
      if (group === OTHER_GROUP.id) usesOther = true;
      fields.register({
        id,
        order: (index + 1) * 10,
        // label：詳細・絞り込みなどで使う名前（fields.<項目>.label）。listLabel：一覧の見出し・検索の種類（listColumns の label）
        label: option.label || column.label || id,
        listLabel: column.label || option.label || id,
        short: option.short || null,
        group,
        mono: Boolean(option.mono),
        copy: Boolean(option.copy),
        example: option.example || '',
        width: column.width || 120,
        badge: (option.badge || []).map((rule) => ({ pattern: new RegExp(rule.match), tone: rule.tone })),
        filter: filters.get(id) || null,
        type: (view.types || {})[id] || 'text',
        searchable: column.searchable === true,
        key: recordKey.includes(id),
      });
    });
    if (usesOther) groups.register(OTHER_GROUP);

    const pick = (ids) => ids.map((id) => fields.get(id)).filter(Boolean);
    lists = {
      // 一覧に出す列：listColumns の順。visible: false の列は一覧に出さない
      list: pick((view.listColumns || []).filter((column) => column.visible).map((column) => column.field)),
      detail: pick(view.detailFields || []),
      searchable: pick((view.listColumns || []).filter((column) => column.searchable).map((column) => column.field)),
      key: pick(recordKey),
      filter: pick((view.filters || []).map((filter) => filter.field)),
    };

    DS.domain.fieldGroups = groups;
    DS.domain.fields = fields;
    DS.domain.DEFAULT_SORT = { key: view.defaultSort.field, order: view.defaultSort.order };
  }

  DS.domain.applyView = applyView;
  DS.domain.listFields = () => lists.list;
  DS.domain.detailFields = () => lists.detail;
  DS.domain.searchableFields = () => lists.searchable;
  DS.domain.keyFields = () => lists.key;
  DS.domain.filterFields = () => lists.filter;

  /** 1 件を特定する鍵（schema の recordKey。例：ロット番号＋鋳造番号）を文字列にする */
  DS.domain.recordKey = (item) =>
    lists.key.map((field) => (item[field.id] == null ? '' : item[field.id])).join('\u001f');
})();
