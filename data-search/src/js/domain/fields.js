/* =========================================================
   論理項目の登録簿。画面に出す名前・まとまり・幅・並びはここで決める。
   項目を増やすときは register() を 1 つ足すだけでよい（表・詳細・表示列の設定に自動で反映）。
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;
  const groups = DS.core.createRegistry('fieldGroups');
  const fields = DS.core.createRegistry('fields');

  [
    { id: 'id', label: '識別番号', icon: 'fa-hashtag', order: 10 },
    { id: 'product', label: '製品', icon: 'fa-cube', order: 20 },
    { id: 'trade', label: '取引', icon: 'fa-handshake', order: 30 },
    { id: 'mfg', label: '製造', icon: 'fa-industry', order: 40 },
  ].forEach((group) => groups.register(group));

  // searchable: 検索の種類に出す / key: 1 件を特定する鍵 / mono: 等幅で表示（0 と O などを見分けやすく）
  // filter: 絞り込みの種類（values＝値から選ぶ / date＝日付の範囲）。Python の fields.py の FILTER_FIELDS とそろえる。
  // 日付の項目（作業日など）を足すときは type: 'date', filter: 'date' を付けるだけで同じ絞り込みが使える。
  [
    { id: 'lotNo', label: 'ロット番号', short: 'ロット', group: 'id', order: 10, searchable: true, key: true, mono: true, copy: true, width: 170, example: 'LOT-2026-00012' },
    { id: 'inspectionNo', label: '検査番号', short: '検査', group: 'id', order: 20, searchable: true, mono: true, copy: true, width: 150, example: 'INS-26-000012' },
    { id: 'castingNo', label: '鋳造番号', short: '鋳造', group: 'id', order: 30, searchable: true, key: true, mono: true, copy: true, width: 150, example: 'CST-41000012' },
    { id: 'orderNo', label: '受注番号', short: '受注', group: 'id', order: 40, searchable: true, mono: true, copy: true, width: 120, example: 'ORD-00003' },
    { id: 'material', label: '材質', group: 'product', order: 50, width: 90, filter: 'values' },
    { id: 'temper', label: '質別', group: 'product', order: 60, width: 70, filter: 'values' },
    { id: 'size', label: '寸法', group: 'product', order: 70, width: 150, mono: true },
    { id: 'customer', label: '得意先', group: 'trade', order: 80, width: 130, filter: 'values' },
    { id: 'deliveryDate', label: '納期', group: 'trade', order: 90, width: 110, mono: true, type: 'date', filter: 'date' },
    { id: 'process', label: '工程', group: 'mfg', order: 100, width: 100, filter: 'values' },
    { id: 'equipment', label: '設備', group: 'mfg', order: 110, width: 90, mono: true, filter: 'values' },
    { id: 'status', label: '状態', group: 'mfg', order: 120, width: 110, render: 'status', filter: 'values' },
  ].forEach((field) => fields.register(field));

  DS.domain = DS.domain || {};
  DS.domain.fieldGroups = groups;
  DS.domain.fields = fields;
  DS.domain.searchableFields = () => fields.list().filter((field) => field.searchable);
  DS.domain.keyFields = () => fields.list().filter((field) => field.key);
  DS.domain.filterFields = () => fields.list().filter((field) => field.filter);
  DS.domain.DEFAULT_SORT = { key: 'deliveryDate', order: 'asc' };

  /** 1 件を特定する鍵（ロット番号＋鋳造番号）を文字列にする */
  DS.domain.recordKey = (item) =>
    DS.domain
      .keyFields()
      .map((field) => (item[field.id] == null ? '' : item[field.id]))
      .join('\u001f');
})();
