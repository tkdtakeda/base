"""対象データ検索ツールの Python 版バックエンド（試用・検証用）。

Rust/Tauri 版へ移植しやすいよう、モジュール構成を src-tauri/src の構成に合わせている。

    settings/       ↔ config/（loader.rs・merge.rs・validation.rs）
    settings_updater↔ config/updater.rs
    fields          ↔ models/lot.rs
    column_catalog  ↔ models/catalog.rs（DB の列と、値から見た種類）
    column_model    ↔ models/column_model.rs（設定と DB の列から、列の決まりを作る）
    cache_copier    ↔ cache/copier.rs
    cache_validator ↔ cache/validator.rs
    cache_service   ↔ cache/mod.rs
    query           ↔ db/query.rs
    lot_service     ↔ services/lot_service.rs
    source_service  ↔ services/source_service.rs
    record_service  ↔ services/record_service.rs
    commands        ↔ commands/*.rs
    errors          ↔ errors/mod.rs
    logging_setup   ↔ logging/mod.rs
"""
