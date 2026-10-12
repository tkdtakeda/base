"""サンプルに書かれていないときだけ使う、内部の既定値。

config/sample の 3 ファイルが正式な設定スキーマ兼初期値である。
ここには「サンプルから省いてよい（環境や社内情報に関係しない）」項目の既定値だけを置く。
サンプルに同じキーがあれば、必ずサンプルの値が優先される。

ここに既定値があるキーは、ローカルのファイルで上書きしてもよい（未知のキーとして扱わない）。
"""

BUILTIN_DEFAULTS = {
    "config": {
        # キャッシュの作り方（一時ファイルの拡張子・失敗時は前回のキャッシュを使い続ける）
        "cache": {"temporaryExtension": ".tmp", "keepPreviousOnFailure": True},
        # Python 版の画面サーバー（手元の PC だけで待ち受ける）。デスクトップ版では使わない
        "devServer": {"host": "127.0.0.1", "port": 8765, "openBrowser": True},
    },
    "schema": {
        # 日付として比べる論理項目（例：{"factoryDeliveryDate": "date"}）。日付の絞り込みに必要
        "types": {},
    },
    "view": {
        "detailGroups": [],
        # 項目ごとの表示（表示名・等幅・コピー・入力例・値の札）。論理項目を足せる場所
        "fields": {},
        "filters": [],
    },
}
