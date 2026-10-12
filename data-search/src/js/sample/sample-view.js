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
      "role": true
    },
    {
      "id": "BOX番号",
      "label": "BOX番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "検査番号",
      "label": "検査番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "鋳造番号",
      "label": "鋳造番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "オーダー番号",
      "label": "オーダー番号",
      "kind": "text",
      "role": true
    },
    {
      "id": "取引先名",
      "label": "取引先名",
      "kind": "text",
      "role": true
    },
    {
      "id": "工場納期",
      "label": "工場納期",
      "kind": "date",
      "role": true
    },
    {
      "id": "状態",
      "label": "状態",
      "kind": "text",
      "role": true
    },
    {
      "id": "製造材質",
      "label": "製造材質",
      "kind": "text",
      "role": true
    },
    {
      "id": "製造調質",
      "label": "製造調質",
      "kind": "text",
      "role": true
    },
    {
      "id": "残仕掛設備コース",
      "label": "残仕掛設備コース",
      "kind": "text",
      "role": true
    },
    {
      "id": "最終実績設備",
      "label": "最終実績設備",
      "kind": "text",
      "role": true
    },
    {
      "id": "仕掛区分",
      "label": "仕掛区分",
      "kind": "text",
      "role": true
    },
    {
      "id": "保留区分",
      "label": "保留区分",
      "kind": "text",
      "role": true
    },
    {
      "id": "plannedEquipmentName",
      "label": "plannedEquipmentName",
      "kind": "text",
      "role": false
    },
    {
      "id": "businessUnitCode",
      "label": "businessUnitCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "demandFieldCode",
      "label": "demandFieldCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "applicationCode",
      "label": "applicationCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "applicationName",
      "label": "applicationName",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderMaterial",
      "label": "orderMaterial",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderTemper",
      "label": "orderTemper",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderThickness",
      "label": "orderThickness",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderWidth",
      "label": "orderWidth",
      "kind": "text",
      "role": false
    },
    {
      "id": "orderLength",
      "label": "orderLength",
      "kind": "text",
      "role": false
    },
    {
      "id": "manufacturingThickness",
      "label": "manufacturingThickness",
      "kind": "text",
      "role": false
    },
    {
      "id": "manufacturingWidth",
      "label": "manufacturingWidth",
      "kind": "text",
      "role": false
    },
    {
      "id": "manufacturingLength",
      "label": "manufacturingLength",
      "kind": "text",
      "role": false
    },
    {
      "id": "productUnitWeight",
      "label": "productUnitWeight",
      "kind": "text",
      "role": false
    },
    {
      "id": "specificGravity",
      "label": "specificGravity",
      "kind": "text",
      "role": false
    },
    {
      "id": "shape",
      "label": "shape",
      "kind": "text",
      "role": false
    },
    {
      "id": "surface",
      "label": "surface",
      "kind": "text",
      "role": false
    },
    {
      "id": "processing",
      "label": "processing",
      "kind": "text",
      "role": false
    },
    {
      "id": "surfaceProcessing",
      "label": "surfaceProcessing",
      "kind": "text",
      "role": false
    },
    {
      "id": "cleaning",
      "label": "cleaning",
      "kind": "text",
      "role": false
    },
    {
      "id": "deliverySpecificationNo",
      "label": "deliverySpecificationNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationCategory",
      "label": "allocationCategory",
      "kind": "text",
      "role": false
    },
    {
      "id": "holdReleaseDate",
      "label": "holdReleaseDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "temporaryPackingFlag",
      "label": "temporaryPackingFlag",
      "kind": "text",
      "role": false
    },
    {
      "id": "urgentCategory",
      "label": "urgentCategory",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationCode",
      "label": "allocationCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationMethod",
      "label": "allocationMethod",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationQuantity",
      "label": "allocationQuantity",
      "kind": "text",
      "role": false
    },
    {
      "id": "allocationAdjustmentNo",
      "label": "allocationAdjustmentNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "salesDeliveryDate",
      "label": "salesDeliveryDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "promisedDeliveryDate",
      "label": "promisedDeliveryDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "shippingDate",
      "label": "shippingDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "wipRetentionTime",
      "label": "wipRetentionTime",
      "kind": "text",
      "role": false
    },
    {
      "id": "deliveryDestinationCode",
      "label": "deliveryDestinationCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "customerCode",
      "label": "customerCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "shippingDestinationCode",
      "label": "shippingDestinationCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "deliveryDestinationName",
      "label": "deliveryDestinationName",
      "kind": "text",
      "role": false
    },
    {
      "id": "shippingDestinationName",
      "label": "shippingDestinationName",
      "kind": "text",
      "role": false
    },
    {
      "id": "districtCode",
      "label": "districtCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "salespersonCode",
      "label": "salespersonCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "plannedEquipmentCourse",
      "label": "plannedEquipmentCourse",
      "kind": "text",
      "role": false
    },
    {
      "id": "actualEquipmentCourse",
      "label": "actualEquipmentCourse",
      "kind": "text",
      "role": false
    },
    {
      "id": "totalProcessCount",
      "label": "totalProcessCount",
      "kind": "text",
      "role": false
    },
    {
      "id": "pitPlannedDate",
      "label": "pitPlannedDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "pitActualDate",
      "label": "pitActualDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "specialSpecification",
      "label": "specialSpecification",
      "kind": "text",
      "role": false
    },
    {
      "id": "masterNo",
      "label": "masterNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "specificationNo",
      "label": "specificationNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "qualityNo",
      "label": "qualityNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "manufacturingNo",
      "label": "manufacturingNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "testNo",
      "label": "testNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "personInCharge",
      "label": "personInCharge",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedThickness",
      "label": "boxPlannedThickness",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedWidth",
      "label": "boxPlannedWidth",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedLength",
      "label": "boxPlannedLength",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedWorkPattern",
      "label": "boxPlannedWorkPattern",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedWeight",
      "label": "boxPlannedWeight",
      "kind": "text",
      "role": false
    },
    {
      "id": "boxPlannedCount",
      "label": "boxPlannedCount",
      "kind": "text",
      "role": false
    },
    {
      "id": "qualityCode",
      "label": "qualityCode",
      "kind": "text",
      "role": false
    },
    {
      "id": "annealingScheduleCategory",
      "label": "annealingScheduleCategory",
      "kind": "text",
      "role": false
    },
    {
      "id": "annealingFurnaceNo",
      "label": "annealingFurnaceNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualProcessBoxNo",
      "label": "lastActualProcessBoxNo",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualThickness",
      "label": "lastActualThickness",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualWidth",
      "label": "lastActualWidth",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualLength",
      "label": "lastActualLength",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualGoodWeight",
      "label": "lastActualGoodWeight",
      "kind": "text",
      "role": false
    },
    {
      "id": "lastActualCount",
      "label": "lastActualCount",
      "kind": "text",
      "role": false
    },
    {
      "id": "workStartDate",
      "label": "workStartDate",
      "kind": "date",
      "role": false
    },
    {
      "id": "workEndDate",
      "label": "workEndDate",
      "kind": "date",
      "role": false
    }
  ],
  "columnsVersion": "76e1bfa7f899",
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
