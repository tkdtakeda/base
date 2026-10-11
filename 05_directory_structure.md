## 推奨ディレクトリ構成

```text
data-search/
├─ README.md
├─ APPLICATION_DESIGN_POLICY.md
├─ package.json
├─ .gitignore
├─ config/
│  ├─ config.sample.json
│  └─ config.local.json
├─ src/
│  ├─ index.html
│  ├─ css/
│  │  └─ app.css
│  ├─ js/
│  │  ├─ app.js
│  │  ├─ api.js
│  │  └─ views/
│  └─ assets/
├─ src-tauri/
│  ├─ Cargo.toml
│  ├─ tauri.conf.json
│  └─ src/
│     ├─ main.rs
│     ├─ commands/
│     │  ├─ mod.rs
│     │  ├─ search.rs
│     │  └─ cache.rs
│     ├─ config/
│     │  ├─ mod.rs
│     │  └─ loader.rs
│     ├─ db/
│     │  ├─ mod.rs
│     │  ├─ connection.rs
│     │  └─ query.rs
│     ├─ models/
│     │  ├─ mod.rs
│     │  ├─ lot.rs
│     │  └─ cache_status.rs
│     ├─ services/
│     │  ├─ mod.rs
│     │  └─ lot_service.rs
│     ├─ cache/
│     │  ├─ mod.rs
│     │  ├─ copier.rs
│     │  └─ validator.rs
│     ├─ logging/
│     │  └─ mod.rs
│     └─ errors/
│        └─ mod.rs
├─ data/
│  └─ cache/
├─ logs/
└─ tests/
   ├─ fixtures/
   └─ dummy-data/
```

### ソースコード管理対象外

```text
config/config.local.json
data/cache/*
logs/*
*.tmp
```

config.local.json、ローカルキャッシュ、ログ、一時ファイルはリポジトリへ登録しない。
