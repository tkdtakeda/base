"""設定（config / schema / view）の読み込み・マージ・検証。

    merge.py      … 再帰マージ（サンプルにローカルを重ねる）
    validation.py … マージ後の検証（役割ごと）
    loader.py     … 読み込みの順序と、実行時に使う設定の組み立て
    defaults.py   … sample に書かない運用項目の既定値
"""

from .loader import AppConfig, ModelSettings, SettingsError, load_settings, model_settings_of
from .merge import deep_merge
from .validation import Issue

__all__ = ["AppConfig", "Issue", "ModelSettings", "SettingsError", "deep_merge", "load_settings", "model_settings_of"]
