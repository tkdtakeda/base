/* =========================================================
   画面だけで試すモード用の表示定義（自動生成。手で直さない）
   元: config/sample/view.sample.json と schema.sample.json の論理情報、python/tools/sample_columns.json（列）
   作り直し: python python/tools/sync_sample_view.py
   ========================================================= */
(function () {
  'use strict';

  window.DS = window.DS || {};
  window.DS.sampleView = /*VIEW_JSON_START*/{
  "roleFields": [
    "lotNo",
    "boxNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "customerName",
    "factoryDeliveryDate",
    "cfStatus",
    "manufacturingMaterial",
    "manufacturingTemper",
    "remainingEquipmentCourse",
    "lastActualEquipmentName",
    "wipCategory",
    "holdCategory"
  ],
  "recordKey": [
    "lotNo",
    "boxNo"
  ],
  "types": {},
  "searchFields": [
    "lotNo",
    "boxNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "customerName"
  ],
  "hiddenColumns": [],
  "fields": {},
  "filters": [
    {
      "field": "manufacturingMaterial",
      "type": "values"
    },
    {
      "field": "manufacturingTemper",
      "type": "values"
    },
    {
      "field": "customerName",
      "type": "values"
    },
    {
      "field": "remainingEquipmentCourse",
      "type": "values"
    },
    {
      "field": "lastActualEquipmentName",
      "type": "values"
    },
    {
      "field": "wipCategory",
      "type": "values"
    },
    {
      "field": "holdCategory",
      "type": "values"
    },
    {
      "field": "cfStatus",
      "type": "values"
    }
  ],
  "defaultSort": {
    "field": "factoryDeliveryDate",
    "order": "asc"
  },
  "columns": [
    {
      "id": "lotNo",
      "label": "ロット番号",
      "role": true
    },
    {
      "id": "boxNo",
      "label": "BOX番号",
      "role": true
    },
    {
      "id": "inspectionNo",
      "label": "検査番号",
      "role": true
    },
    {
      "id": "castingNo",
      "label": "鋳造番号",
      "role": true
    },
    {
      "id": "orderNo",
      "label": "オーダー番号",
      "role": true
    },
    {
      "id": "customerName",
      "label": "取引先名",
      "role": true
    },
    {
      "id": "factoryDeliveryDate",
      "label": "工場納期",
      "role": true
    },
    {
      "id": "cfStatus",
      "label": "状態",
      "role": true
    },
    {
      "id": "manufacturingMaterial",
      "label": "製造材質",
      "role": true
    },
    {
      "id": "manufacturingTemper",
      "label": "製造調質",
      "role": true
    },
    {
      "id": "remainingEquipmentCourse",
      "label": "残仕掛設備コース",
      "role": true
    },
    {
      "id": "lastActualEquipmentName",
      "label": "最終実績設備",
      "role": true
    },
    {
      "id": "wipCategory",
      "label": "仕掛区分",
      "role": true
    },
    {
      "id": "holdCategory",
      "label": "保留区分",
      "role": true
    },
    {
      "id": "plannedEquipmentName",
      "label": "plannedEquipmentName",
      "role": false
    },
    {
      "id": "businessUnitCode",
      "label": "businessUnitCode",
      "role": false
    },
    {
      "id": "demandFieldCode",
      "label": "demandFieldCode",
      "role": false
    },
    {
      "id": "applicationCode",
      "label": "applicationCode",
      "role": false
    },
    {
      "id": "applicationName",
      "label": "applicationName",
      "role": false
    },
    {
      "id": "orderMaterial",
      "label": "orderMaterial",
      "role": false
    },
    {
      "id": "orderTemper",
      "label": "orderTemper",
      "role": false
    },
    {
      "id": "orderThickness",
      "label": "orderThickness",
      "role": false
    },
    {
      "id": "orderWidth",
      "label": "orderWidth",
      "role": false
    },
    {
      "id": "orderLength",
      "label": "orderLength",
      "role": false
    },
    {
      "id": "manufacturingThickness",
      "label": "manufacturingThickness",
      "role": false
    },
    {
      "id": "manufacturingWidth",
      "label": "manufacturingWidth",
      "role": false
    },
    {
      "id": "manufacturingLength",
      "label": "manufacturingLength",
      "role": false
    },
    {
      "id": "productUnitWeight",
      "label": "productUnitWeight",
      "role": false
    },
    {
      "id": "specificGravity",
      "label": "specificGravity",
      "role": false
    },
    {
      "id": "shape",
      "label": "shape",
      "role": false
    },
    {
      "id": "surface",
      "label": "surface",
      "role": false
    },
    {
      "id": "processing",
      "label": "processing",
      "role": false
    },
    {
      "id": "surfaceProcessing",
      "label": "surfaceProcessing",
      "role": false
    },
    {
      "id": "cleaning",
      "label": "cleaning",
      "role": false
    },
    {
      "id": "deliverySpecificationNo",
      "label": "deliverySpecificationNo",
      "role": false
    },
    {
      "id": "allocationCategory",
      "label": "allocationCategory",
      "role": false
    },
    {
      "id": "holdReleaseDate",
      "label": "holdReleaseDate",
      "role": false
    },
    {
      "id": "temporaryPackingFlag",
      "label": "temporaryPackingFlag",
      "role": false
    },
    {
      "id": "urgentCategory",
      "label": "urgentCategory",
      "role": false
    },
    {
      "id": "allocationCode",
      "label": "allocationCode",
      "role": false
    },
    {
      "id": "allocationMethod",
      "label": "allocationMethod",
      "role": false
    },
    {
      "id": "allocationQuantity",
      "label": "allocationQuantity",
      "role": false
    },
    {
      "id": "allocationAdjustmentNo",
      "label": "allocationAdjustmentNo",
      "role": false
    },
    {
      "id": "salesDeliveryDate",
      "label": "salesDeliveryDate",
      "role": false
    },
    {
      "id": "promisedDeliveryDate",
      "label": "promisedDeliveryDate",
      "role": false
    },
    {
      "id": "shippingDate",
      "label": "shippingDate",
      "role": false
    },
    {
      "id": "wipRetentionTime",
      "label": "wipRetentionTime",
      "role": false
    },
    {
      "id": "deliveryDestinationCode",
      "label": "deliveryDestinationCode",
      "role": false
    },
    {
      "id": "customerCode",
      "label": "customerCode",
      "role": false
    },
    {
      "id": "shippingDestinationCode",
      "label": "shippingDestinationCode",
      "role": false
    },
    {
      "id": "deliveryDestinationName",
      "label": "deliveryDestinationName",
      "role": false
    },
    {
      "id": "shippingDestinationName",
      "label": "shippingDestinationName",
      "role": false
    },
    {
      "id": "districtCode",
      "label": "districtCode",
      "role": false
    },
    {
      "id": "salespersonCode",
      "label": "salespersonCode",
      "role": false
    },
    {
      "id": "plannedEquipmentCourse",
      "label": "plannedEquipmentCourse",
      "role": false
    },
    {
      "id": "actualEquipmentCourse",
      "label": "actualEquipmentCourse",
      "role": false
    },
    {
      "id": "totalProcessCount",
      "label": "totalProcessCount",
      "role": false
    },
    {
      "id": "pitPlannedDate",
      "label": "pitPlannedDate",
      "role": false
    },
    {
      "id": "pitActualDate",
      "label": "pitActualDate",
      "role": false
    },
    {
      "id": "specialSpecification",
      "label": "specialSpecification",
      "role": false
    },
    {
      "id": "masterNo",
      "label": "masterNo",
      "role": false
    },
    {
      "id": "specificationNo",
      "label": "specificationNo",
      "role": false
    },
    {
      "id": "qualityNo",
      "label": "qualityNo",
      "role": false
    },
    {
      "id": "manufacturingNo",
      "label": "manufacturingNo",
      "role": false
    },
    {
      "id": "testNo",
      "label": "testNo",
      "role": false
    },
    {
      "id": "personInCharge",
      "label": "personInCharge",
      "role": false
    },
    {
      "id": "boxPlannedThickness",
      "label": "boxPlannedThickness",
      "role": false
    },
    {
      "id": "boxPlannedWidth",
      "label": "boxPlannedWidth",
      "role": false
    },
    {
      "id": "boxPlannedLength",
      "label": "boxPlannedLength",
      "role": false
    },
    {
      "id": "boxPlannedWorkPattern",
      "label": "boxPlannedWorkPattern",
      "role": false
    },
    {
      "id": "boxPlannedWeight",
      "label": "boxPlannedWeight",
      "role": false
    },
    {
      "id": "boxPlannedCount",
      "label": "boxPlannedCount",
      "role": false
    },
    {
      "id": "qualityCode",
      "label": "qualityCode",
      "role": false
    },
    {
      "id": "annealingScheduleCategory",
      "label": "annealingScheduleCategory",
      "role": false
    },
    {
      "id": "annealingFurnaceNo",
      "label": "annealingFurnaceNo",
      "role": false
    },
    {
      "id": "lastActualProcessBoxNo",
      "label": "lastActualProcessBoxNo",
      "role": false
    },
    {
      "id": "lastActualThickness",
      "label": "lastActualThickness",
      "role": false
    },
    {
      "id": "lastActualWidth",
      "label": "lastActualWidth",
      "role": false
    },
    {
      "id": "lastActualLength",
      "label": "lastActualLength",
      "role": false
    },
    {
      "id": "lastActualGoodWeight",
      "label": "lastActualGoodWeight",
      "role": false
    },
    {
      "id": "lastActualCount",
      "label": "lastActualCount",
      "role": false
    },
    {
      "id": "workStartDate",
      "label": "workStartDate",
      "role": false
    },
    {
      "id": "workEndDate",
      "label": "workEndDate",
      "role": false
    }
  ],
  "columnsVersion": "919bfde851dc"
}/*VIEW_JSON_END*/;
})();
