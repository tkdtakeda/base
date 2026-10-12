"""設定（config / schema / view）の読み込み・マージ・検証。

    merge.py      … 再帰マージ（サンプルにローカルを重ねる）
    validation.py … マージ後の検証（役割ごと）
    loader.py     … 読み込みの順序と、実行時に使う設定の組み立て
    defaults.py   … sample に書かない運用項目の既定値
    labels.py     … schema の列名から view の表示名の下書きを作る（tools/make_view_labels.py）
"""

from .loader import AppConfig, DataModel, SettingsError, load_settings, public_view_of
from .merge import deep_merge
from .validation import Issue

__all__ = ["AppConfig", "DataModel", "Issue", "SettingsError", "deep_merge", "load_settings", "public_view_of"]
