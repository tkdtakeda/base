## 付録：1 件を決める列の選択・全列の絞り込みで足したバックエンドのファイルの全文

`python/data_search/column_model.py`

```python
"""DB の列（column_catalog）と設定（settings.ModelSettings）から、画面と検索で使う列の決まりを組み立てる。

    列の id   … DB の列名。画面の見出し・詳細・絞り込み・タグ・ブラウザに保存した表示の設定で共通
    設定の名前 … DB の列名か、schema.columns に書いた別名（論理名）のどちらでもよい。
                 DB に同じ名前の列があればその列、なければ別名として読み替える（DB にない列は使わない）
    並び順     … 1 件を決める列 → 番号で探す列 → 別名のある列（schema.columns の順）→ ほかの列（DB の順）
    種類       … date / text。schema.types の指定が優先。指定がなければ値から判定する
                 （1 件を決める列・番号で探す列は、数字だけの番号を日付と取り違えないよう text）

DB にない名前を設定に書いても止めず、notices（画面の「データ」パネルの注意）で知らせる。
1 件を決める列が DB にないときは record_key が空（ready=False）になり、画面は列を選ぶよう案内する。
"""

import hashlib
import json
from dataclasses import dataclass, field

KEY_PATH = "schema.recordKey"
SEARCH_PATH = "schema.searchColumn"
CHOOSE_ACTION = "画面左の「データ」→「1 件を決める列」で、DB の列から選んでください。"


@dataclass(frozen=True)
class Column:
    id: str
    kind: str    # "text" / "date"
    role: bool   # 主な項目（詳細で先にまとめる）

    def public(self):
        return {"id": self.id, "label": self.id, "kind": self.kind, "role": self.role}


@dataclass(frozen=True)
class Notice:
    path: str
    reason: str
    action: str

    def public(self):
        return {"path": self.path, "reason": self.reason, "action": self.action}


@dataclass(frozen=True)
class ColumnModel:
    columns: tuple            # Column の並び
    record_key: tuple         # 1 件を決める列（DB の列名）。DB に足りない列があれば空
    search_column: object     # 番号で探す列（DB の列名）か None
    default_sort: tuple       # (DB の列名, "asc" / "desc")。列がなければ (None, "asc")
    hidden: tuple             # 最初は隠しておく列
    fields: dict              # 列ごとの表示の補助（等幅・コピー・入力例・値の札）
    aliases: dict             # 別名 → DB の列名（DB にある列だけ）
    notices: tuple            # Notice の並び
    version: str = ""
    _kinds: dict = field(default_factory=dict, repr=False, compare=False)

    @property
    def ids(self):
        return tuple(column.id for column in self.columns)

    @property
    def ready(self):
        return bool(self.record_key)

    def has(self, name):
        return name in self._kinds

    def kind_of(self, name):
        return self._kinds.get(name)

    def public(self):
        """画面へ渡す表示定義。テーブル名・パスは含めない（列名は見出しとして画面に出す）。"""
        return {
            "columns": [column.public() for column in self.columns],
            "columnsVersion": self.version,
            "recordKey": list(self.record_key),
            "searchColumn": self.search_column,
            "defaultSort": {"field": self.default_sort[0], "order": self.default_sort[1]},
            "hiddenColumns": list(self.hidden),
            "fields": self.fields,
            "aliases": self.aliases,
            "notices": [notice.public() for notice in self.notices],
            "ready": self.ready,
        }


class _Resolver:
    """設定の名前 → DB の列名。DB にない名前は None。"""

    def __init__(self, aliases, db_names):
        self.db = set(db_names)
        self.aliases = {name: physical for name, physical in aliases.items() if physical in self.db}

    def __call__(self, name):
        if name in self.db:
            return name
        return self.aliases.get(name)


def missing_key_columns(settings, db_names):
    """1 件を決める列のうち、DB にない名前（接続テストで、保存の前に知らせるため）。"""
    resolve = _Resolver(settings.aliases, db_names)
    return [name for name in settings.record_key if resolve(name) is None]


def build_model(settings, catalog):
    """settings：settings.ModelSettings。catalog：column_catalog.DbColumn の並び（空ならキャッシュがない）。"""
    db_names = [column.name for column in catalog]
    resolve = _Resolver(settings.aliases, db_names)
    notices = []
    has_data = bool(db_names)

    def note(path, reason, action):
        if has_data:  # データがまだないときは、列がないのは当然なので知らせない
            notices.append(Notice(path, reason, action))

    # 1 件を決める列：1 つでも DB になければ使わない（一部の列だけでは 1 件に決まらないため）
    resolved_key = [resolve(name) for name in settings.record_key]
    missing = [name for name, physical in zip(settings.record_key, resolved_key) if physical is None]
    record_key = () if missing or not resolved_key else tuple(dict.fromkeys(resolved_key))
    if missing:
        note(KEY_PATH, f"1 件を決める列（{'、'.join(missing)}）がテーブルにありません。", CHOOSE_ACTION)
    elif not resolved_key:
        note(KEY_PATH, "1 件を決める列が決まっていません。", CHOOSE_ACTION)

    # 番号で探す列：指定がなければ 1 件を決める列の 1 つ目
    search_column = None
    if settings.search_column:
        search_column = resolve(settings.search_column)
        if search_column is None:
            note(SEARCH_PATH, f"番号で探す列（{settings.search_column}）がテーブルにありません。", CHOOSE_ACTION)
    if search_column is None:
        # 1 件を決める列の一部が DB になくても、1 つ目があれば番号では探せるようにする
        search_column = record_key[0] if record_key else (resolved_key[0] if resolved_key else None)

    # 種類：指定（schema.types）→ 値からの判定
    explicit = {}
    for name, kind in settings.types.items():
        physical = resolve(name)
        if physical is None:
            note(f"schema.types.{name}", "テーブルにない列のため、種類の指定を使っていません。", "列名を確認するか、その行を消してください。")
        else:
            explicit[physical] = kind
    identifiers = set(record_key) | ({search_column} if search_column else set())
    looks_date = {column.name: column.looks_date for column in catalog}

    def kind_of(name):
        if name in explicit:
            return explicit[name]
        return "date" if looks_date.get(name) and name not in identifiers else "text"

    # 並び：役割のある列を先頭に（1 件を決める列は左端に固定するため、必ず最初）
    leading = list(record_key) + ([search_column] if search_column else []) + list(resolve.aliases.values())
    leading = list(dict.fromkeys(leading))
    order = leading + [name for name in db_names if name not in leading]
    role = set(leading)
    columns = tuple(Column(name, kind_of(name), name in role) for name in order)

    # 既定の並べ替え：書いた列がなければ 1 件を決める列（なければ先頭の列）
    sort_name, sort_order = settings.default_sort
    sort_field = resolve(sort_name) if sort_name else None
    if sort_name and sort_field is None:
        note("view.defaultSort.field", f"並べ替えの列（{sort_name}）がテーブルにありません。",
             "列名を確認してください。今は 1 件を決める列の順に並べています。")
    if sort_field is None:
        sort_field, sort_order = (record_key[0] if record_key else (order[0] if order else None)), "asc"

    hidden = tuple(dict.fromkeys(physical for physical in map(resolve, settings.hidden)
                                 if physical and physical not in record_key))
    fields = {}
    for name, options in settings.fields.items():
        physical = resolve(name)
        if physical:
            fields[physical] = dict(fields.get(physical, {}), **options)

    signature = json.dumps([[(c.id, c.kind) for c in columns], record_key, search_column], ensure_ascii=False)
    return ColumnModel(
        columns=columns,
        record_key=record_key,
        search_column=search_column,
        default_sort=(sort_field, sort_order),
        hidden=hidden,
        fields=fields,
        aliases=dict(resolve.aliases),
        notices=tuple(notices),
        version=hashlib.sha256(signature.encode("utf-8")).hexdigest()[:12],
        _kinds={column.id: column.kind for column in columns},
    )


class ColumnModelProvider:
    """今の設定とキャッシュの列から作った ColumnModel を持つ。どちらかが変わったら作り直す。"""

    def __init__(self, config_getter, cache_service):
        self._config_getter = config_getter
        self._cache = cache_service
        self._source = (None, None)
        self._model = None

    def get(self):
        config = self._config_getter()
        catalog = self._cache.catalog()
        source = (config, catalog)
        if self._model is None or source[0] is not self._source[0] or source[1] is not self._source[1]:
            self._model = build_model(config.model, catalog)
            self._source = source
        return self._model
```

`python/data_search/record_service.py`

```python
"""1 件を決める列（schema.recordKey）と、番号で探す列（schema.searchColumn）の確認・変更。

確認：選んだ列の組み合わせで 1 件に決まるかを数える（重なり・空欄の行の数）。保存はしない。
変更：schema.local.json の recordKey・searchColumn に DB の列名で保存 → 設定を読み直して検証 → 差し替える。
      キャッシュは作り直さない（列の決まりだけが変わる）。重なりがあっても保存はできる（画面で注意を出す）。
ログには列名を残さない（数だけ）。
"""

import os

from .errors import AppError
from .lot_service import parse_key_columns
from .settings.local_writer import local_file
from .settings_updater import file_label, save_local_values

KEY_PATH = ("recordKey",)
SEARCH_PATH = ("searchColumn",)


class RecordService:
    def __init__(self, context, app_root, local_dir):
        self.context = context      # http_server.AppContext（config・cache_service・lot_service を持つ）
        self.app_root = app_root
        self.local_dir = local_dir or os.path.join(app_root, "config", "local")

    def check(self, payload):
        return self.context.lot_service.check_record_key(payload)

    def update(self, payload):
        if not isinstance(payload, dict):
            raise AppError("INVALID_REQUEST", "payload must be an object")
        if not self.context.cache_service.cache_available():
            raise AppError("CACHE_UNAVAILABLE", "cache file not found")
        model = self.context.lot_service.model
        names = parse_key_columns(payload, model)
        search_column = payload.get("searchColumn")
        if search_column is not None and not (isinstance(search_column, str) and model.has(search_column)):
            raise AppError("INVALID_REQUEST", "unknown searchColumn",
                           user_message="番号で探す列は、一覧にある列から選んでください。")
        # 番号で探す列が 1 件を決める列の 1 つ目と同じなら null（あとで 1 つ目を変えたときに一緒に変わるように）
        stored_search = None if search_column in (None, names[0]) else search_column
        target = save_local_values(self.context, self.app_root, self.local_dir, "schema",
                                   {KEY_PATH: names, SEARCH_PATH: stored_search})
        updated = self.context.lot_service.model
        self.context.logger.info("record key updated columns=%d search=%s", len(names), "key" if stored_search is None else "other")
        return {
            "success": True,
            "saved": True,
            "recordKey": list(updated.record_key),
            "searchColumn": updated.search_column,
            "localFile": file_label(self.app_root, target),
            "message": "1 件を決める列を保存しました。",
        }

    def describe(self):
        return {"success": True, "localFile": file_label(self.app_root, local_file(self.local_dir, "schema"))}
```

`python/data_search/settings_updater.py`

```python
"""画面からの設定の変更（config/local・schema.local などへの書き込み）を、安全に動いている設定へ反映する。

流れ：書き込む（控えを .bak に残す）→ 設定を読み直して検証 → 誤りがあれば書き込みを取り消して止める
      → 誤りがなければ、動いている設定（context.config・キャッシュ・検索）を差し替える。
"""

import os

from .errors import AppError
from .settings import SettingsError, load_settings
from .settings.local_writer import local_file, restore_backup, set_local_values


def file_label(app_root, path):
    """画面に出すファイル名（アプリのルートからの相対。外にあればそのまま）。"""
    relative = os.path.relpath(path, app_root)
    return path if relative.startswith("..") else relative.replace("\\", "/")


def use_config(context, config):
    """動いている設定を差し替える。読み込み先が変わったら、前の読み込み先のキャッシュは使わない。"""
    context.config = config
    context.cache_service.use_config(config)
    context.lot_service.config = config


def save_local_values(context, app_root, local_dir, kind, values):
    """values（{path: 値}）を <kind>.local.json に書き、読み直して差し替える。書き込んだファイルのパスを返す。"""
    target = local_file(local_dir, kind)
    existed = os.path.isfile(target)
    try:
        set_local_values(local_dir, kind, values)
    except (OSError, ValueError) as exc:
        raise AppError("SETTINGS_WRITE_FAILED", f"write failed: {type(exc).__name__}") from exc
    try:
        config = load_settings(app_root, local_dir)
    except SettingsError as error:
        restore_backup(local_dir, kind, existed)
        reasons = " / ".join(f"{issue.path}：{issue.reason}" for issue in error.issues if issue.level == "error")
        raise AppError("SETTINGS_WRITE_FAILED", "reload failed",
                       user_message=f"保存すると設定に誤りが出るため、元に戻しました（{reasons}）。") from error
    use_config(context, config)
    return target
```
