/* =========================================================
   画面だけで試すモード用の表示定義（自動生成。手で直さない）
   元: config/sample/view.sample.json と schema.sample.json の論理情報
   作り直し: python python/tools/sync_sample_view.py
   ========================================================= */
(function () {
  'use strict';

  window.DS = window.DS || {};
  window.DS.sampleView = /*VIEW_JSON_START*/{
  "logicalFields": [
    "lotNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "material",
    "temper",
    "size",
    "customer",
    "deliveryDate",
    "process",
    "equipment",
    "status"
  ],
  "recordKey": [
    "lotNo",
    "castingNo"
  ],
  "types": {
    "deliveryDate": "date"
  },
  "listColumns": [
    {
      "field": "lotNo",
      "label": "ロット番号",
      "visible": true,
      "searchable": true,
      "width": 170
    },
    {
      "field": "inspectionNo",
      "label": "検査番号",
      "visible": true,
      "searchable": true,
      "width": 150
    },
    {
      "field": "castingNo",
      "label": "鋳造番号",
      "visible": true,
      "searchable": true,
      "width": 150
    },
    {
      "field": "orderNo",
      "label": "受注番号",
      "visible": true,
      "searchable": true,
      "width": 120
    },
    {
      "field": "material",
      "label": "材質",
      "visible": true,
      "searchable": false,
      "width": 90
    },
    {
      "field": "temper",
      "label": "質別",
      "visible": true,
      "searchable": false,
      "width": 70
    },
    {
      "field": "size",
      "label": "寸法",
      "visible": true,
      "searchable": false,
      "width": 150
    },
    {
      "field": "customer",
      "label": "得意先",
      "visible": true,
      "searchable": false,
      "width": 130
    },
    {
      "field": "deliveryDate",
      "label": "納期",
      "visible": true,
      "searchable": false,
      "width": 110
    },
    {
      "field": "process",
      "label": "工程",
      "visible": true,
      "searchable": false,
      "width": 100
    },
    {
      "field": "equipment",
      "label": "設備",
      "visible": true,
      "searchable": false,
      "width": 90
    },
    {
      "field": "status",
      "label": "状態",
      "visible": true,
      "searchable": false,
      "width": 110
    }
  ],
  "detailFields": [
    "lotNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "material",
    "temper",
    "size",
    "customer",
    "deliveryDate",
    "process",
    "equipment",
    "status"
  ],
  "detailGroups": [
    {
      "id": "id",
      "label": "識別番号",
      "icon": "fa-hashtag"
    },
    {
      "id": "product",
      "label": "製品",
      "icon": "fa-cube"
    },
    {
      "id": "trade",
      "label": "取引",
      "icon": "fa-handshake"
    },
    {
      "id": "mfg",
      "label": "製造",
      "icon": "fa-industry"
    }
  ],
  "fields": {
    "lotNo": {
      "label": "ロット番号",
      "short": "ロット",
      "group": "id",
      "mono": true,
      "copy": true,
      "example": "LOT-2026-00012"
    },
    "inspectionNo": {
      "label": "検査番号",
      "short": "検査",
      "group": "id",
      "mono": true,
      "copy": true,
      "example": "INS-26-000012"
    },
    "castingNo": {
      "label": "鋳造番号",
      "short": "鋳造",
      "group": "id",
      "mono": true,
      "copy": true,
      "example": "CST-41000012"
    },
    "orderNo": {
      "label": "受注番号",
      "short": "受注",
      "group": "id",
      "mono": true,
      "copy": true,
      "example": "ORD-00003"
    },
    "material": {
      "label": "材質",
      "group": "product"
    },
    "temper": {
      "label": "質別",
      "group": "product"
    },
    "size": {
      "label": "寸法",
      "group": "product",
      "mono": true
    },
    "customer": {
      "label": "得意先",
      "group": "trade"
    },
    "deliveryDate": {
      "label": "納期",
      "group": "trade",
      "mono": true
    },
    "process": {
      "label": "工程",
      "group": "mfg"
    },
    "equipment": {
      "label": "設備",
      "group": "mfg",
      "mono": true
    },
    "status": {
      "label": "状態",
      "group": "mfg",
      "badge": [
        {
          "match": "不適合|不良|NG|異常|廃棄",
          "tone": "danger"
        },
        {
          "match": "保留|停止|要確認|遅延",
          "tone": "warning"
        },
        {
          "match": "完了|済|合格|OK",
          "tone": "success"
        },
        {
          "match": "仕掛|待ち|中$|予定",
          "tone": "info"
        }
      ]
    }
  },
  "filters": [
    {
      "field": "material",
      "type": "values"
    },
    {
      "field": "temper",
      "type": "values"
    },
    {
      "field": "customer",
      "type": "values"
    },
    {
      "field": "deliveryDate",
      "type": "date"
    },
    {
      "field": "process",
      "type": "values"
    },
    {
      "field": "equipment",
      "type": "values"
    },
    {
      "field": "status",
      "type": "values"
    }
  ],
  "defaultSort": {
    "field": "deliveryDate",
    "order": "asc"
  }
}/*VIEW_JSON_END*/;
})();
