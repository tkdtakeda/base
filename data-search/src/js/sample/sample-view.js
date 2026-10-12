/* =========================================================
   画面だけで試すモード用の表示定義（自動生成。手で直さない）
   元: config/sample/view.sample.json と schema.sample.json、python/tools/sample_columns.json（DB の列）
   作り直し: python python/tools/sync_sample_view.py
   ========================================================= */
(function () {
  'use strict';

  window.DS = window.DS || {};
  window.DS.sampleView = /*VIEW_JSON_START*/{
  "columns": [
    {
      "id": "ロット番号",
      "label": "ロット番号",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "BOX番号",
      "label": "BOX番号",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "検査番号",
      "label": "検査番号",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "鋳造番号",
      "label": "鋳造番号",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "オーダー番号",
      "label": "オーダー番号",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "取引先名",
      "label": "取引先名",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "工場納期",
      "label": "工場納期",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": true
    },
    {
      "id": "状態",
      "label": "状態",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "製造材質",
      "label": "製造材質",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "製造調質",
      "label": "製造調質",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "残仕掛設備コース",
      "label": "残仕掛設備コース",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "最終実績設備",
      "label": "最終実績設備",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "仕掛区分",
      "label": "仕掛区分",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "保留区分",
      "label": "保留区分",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": true
    },
    {
      "id": "plannedEquipmentName",
      "label": "plannedEquipmentName",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "businessUnitCode",
      "label": "businessUnitCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "demandFieldCode",
      "label": "demandFieldCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "applicationCode",
      "label": "applicationCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "applicationName",
      "label": "applicationName",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "orderMaterial",
      "label": "orderMaterial",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "orderTemper",
      "label": "orderTemper",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "orderThickness",
      "label": "orderThickness",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "orderWidth",
      "label": "orderWidth",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "orderLength",
      "label": "orderLength",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "manufacturingThickness",
      "label": "manufacturingThickness",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "manufacturingWidth",
      "label": "manufacturingWidth",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "manufacturingLength",
      "label": "manufacturingLength",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "productUnitWeight",
      "label": "productUnitWeight",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "specificGravity",
      "label": "specificGravity",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "shape",
      "label": "shape",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "surface",
      "label": "surface",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "processing",
      "label": "processing",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "surfaceProcessing",
      "label": "surfaceProcessing",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "cleaning",
      "label": "cleaning",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "deliverySpecificationNo",
      "label": "deliverySpecificationNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "allocationCategory",
      "label": "allocationCategory",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "holdReleaseDate",
      "label": "holdReleaseDate",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": false
    },
    {
      "id": "temporaryPackingFlag",
      "label": "temporaryPackingFlag",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "urgentCategory",
      "label": "urgentCategory",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "allocationCode",
      "label": "allocationCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "allocationMethod",
      "label": "allocationMethod",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "allocationQuantity",
      "label": "allocationQuantity",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "allocationAdjustmentNo",
      "label": "allocationAdjustmentNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "salesDeliveryDate",
      "label": "salesDeliveryDate",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": false
    },
    {
      "id": "promisedDeliveryDate",
      "label": "promisedDeliveryDate",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": false
    },
    {
      "id": "shippingDate",
      "label": "shippingDate",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": false
    },
    {
      "id": "wipRetentionTime",
      "label": "wipRetentionTime",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "deliveryDestinationCode",
      "label": "deliveryDestinationCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "customerCode",
      "label": "customerCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "shippingDestinationCode",
      "label": "shippingDestinationCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "deliveryDestinationName",
      "label": "deliveryDestinationName",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "shippingDestinationName",
      "label": "shippingDestinationName",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "districtCode",
      "label": "districtCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "salespersonCode",
      "label": "salespersonCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "plannedEquipmentCourse",
      "label": "plannedEquipmentCourse",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "actualEquipmentCourse",
      "label": "actualEquipmentCourse",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "totalProcessCount",
      "label": "totalProcessCount",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "pitPlannedDate",
      "label": "pitPlannedDate",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": false
    },
    {
      "id": "pitActualDate",
      "label": "pitActualDate",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": false
    },
    {
      "id": "specialSpecification",
      "label": "specialSpecification",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "masterNo",
      "label": "masterNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "specificationNo",
      "label": "specificationNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "qualityNo",
      "label": "qualityNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "manufacturingNo",
      "label": "manufacturingNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "testNo",
      "label": "testNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "personInCharge",
      "label": "personInCharge",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "boxPlannedThickness",
      "label": "boxPlannedThickness",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "boxPlannedWidth",
      "label": "boxPlannedWidth",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "boxPlannedLength",
      "label": "boxPlannedLength",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "boxPlannedWorkPattern",
      "label": "boxPlannedWorkPattern",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "boxPlannedWeight",
      "label": "boxPlannedWeight",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "boxPlannedCount",
      "label": "boxPlannedCount",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "qualityCode",
      "label": "qualityCode",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "annealingScheduleCategory",
      "label": "annealingScheduleCategory",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "annealingFurnaceNo",
      "label": "annealingFurnaceNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "lastActualProcessBoxNo",
      "label": "lastActualProcessBoxNo",
      "kind": "text",
      "autoKind": "text",
      "manual": false,
      "role": false
    },
    {
      "id": "lastActualThickness",
      "label": "lastActualThickness",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "lastActualWidth",
      "label": "lastActualWidth",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "lastActualLength",
      "label": "lastActualLength",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "lastActualGoodWeight",
      "label": "lastActualGoodWeight",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "lastActualCount",
      "label": "lastActualCount",
      "kind": "number",
      "autoKind": "number",
      "manual": false,
      "role": false
    },
    {
      "id": "workStartDate",
      "label": "workStartDate",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": false
    },
    {
      "id": "workEndDate",
      "label": "workEndDate",
      "kind": "date",
      "autoKind": "date",
      "manual": false,
      "role": false
    }
  ],
  "columnsVersion": "2dbca40873ae",
  "recordKey": [
    "ロット番号",
    "BOX番号"
  ],
  "searchColumn": "ロット番号",
  "defaultSort": {
    "field": "工場納期",
    "order": "asc"
  },
  "hiddenColumns": [],
  "fields": {},
  "aliases": {
    "lotNo": "ロット番号",
    "boxNo": "BOX番号",
    "inspectionNo": "検査番号",
    "castingNo": "鋳造番号",
    "orderNo": "オーダー番号",
    "customerName": "取引先名",
    "factoryDeliveryDate": "工場納期",
    "cfStatus": "状態",
    "manufacturingMaterial": "製造材質",
    "manufacturingTemper": "製造調質",
    "remainingEquipmentCourse": "残仕掛設備コース",
    "lastActualEquipmentName": "最終実績設備",
    "wipCategory": "仕掛区分",
    "holdCategory": "保留区分"
  },
  "notices": [],
  "ready": true
}/*VIEW_JSON_END*/;
})();
