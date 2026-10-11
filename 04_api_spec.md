## Tauri Command API仕様

### 1. search_lots

対象データを論理項目で検索する。

#### 入力
```json
{
  "searchType": "lotNo",
  "keyword": "SAMPLE-001",
  "matchMode": "partial",
  "page": 1,
  "pageSize": 100
}
```

#### 入力項目
- searchType: lotNo / inspectionNo / castingNo / orderNo
- keyword: 検索文字列
- matchMode: exact / partial
- page: 1以上のページ番号
- pageSize: 1ページの最大件数

#### 成功時の戻り値
```json
{
  "success": true,
  "count": 1,
  "totalCount": 1,
  "page": 1,
  "pageSize": 100,
  "items": [
    {
      "lotNo": "SAMPLE-LOT-001",
      "inspectionNo": "SAMPLE-INSPECTION-001",
      "castingNo": "SAMPLE-CASTING-001",
      "orderNo": "SAMPLE-ORDER-001",
      "material": "Sample Material",
      "temper": "Sample Temper",
      "size": "Sample Size",
      "customer": "Sample Customer",
      "deliveryDate": "2099-01-01",
      "process": "Sample Process",
      "equipment": "Sample Equipment",
      "status": "Sample Status"
    }
  ]
}
```

### 2. get_lot_detail

一覧で選択したデータの詳細を取得する。

#### 入力
```json
{
  "lotNo": "SAMPLE-LOT-001"
}
```

#### 戻り値

search_lots の items と同じ論理項目構造を使用する。

### 3. refresh_cache

共有SQLiteからローカルキャッシュを安全に更新する。

#### 入力
```json
{}
```

#### 成功時の戻り値
```json
{
  "success": true,
  "sourceModifiedAt": "2099-01-01T12:00:00+09:00",
  "cacheUpdatedAt": "2099-01-01T12:01:00+09:00",
  "usingPreviousCache": false,
  "message": "キャッシュを更新しました。"
}
```

### 4. get_cache_status

現在のキャッシュ状態を取得する。

#### 成功時の戻り値
```json
{
  "available": true,
  "lastRefreshSucceeded": true,
  "sourceModifiedAt": "2099-01-01T12:00:00+09:00",
  "cacheUpdatedAt": "2099-01-01T12:01:00+09:00",
  "usingPreviousCache": false,
  "message": "最新のキャッシュを参照しています。"
}
```

### 5. get_application_info

アプリケーション情報を取得する。

#### 成功時の戻り値
```json
{
  "id": "data-search",
  "name": "Data Search",
  "version": "0.1.0"
}
```

### 6. 共通エラー形式
```json
{
  "success": false,
  "error": {
    "code": "CACHE_REFRESH_FAILED",
    "userMessage": "データを更新できなかったため、前回のデータを表示しています。",
    "detailId": "SAMPLE-DETAIL-ID"
  }
}
```

userMessage には利用者が次に取るべき行動を示す。技術的な詳細はログへ記録し、画面へ直接露出させない。
