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
