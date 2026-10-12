"""SQLite に足す関数。数値の読み方・文字の条件（含む・始まる…）・曖昧な比べ方を 1 か所で決める。
画面だけで試すモード（js/domain/filters.js）にも同じ決まりを書いている。

    ds_number(x)                  … 数値として読めれば float、読めなければ NULL
                                    （全角数字・前後の空白・桁区切りのカンマ・先頭の 0 も読む。単位つきは読まない）
    ds_auto_number(x)             … 種類の自動判定用。ds_number で読めて、先頭が 0 の番号（007 など）でなければ 1
    ds_text(x, op, needle, fuzzy) … 文字の条件に当てはまれば 1
        op     … contains / starts / ends / not_contains / not_starts / not_ends
        fuzzy  … 1 なら記号・空白を無視して比べる（LOT2026-0012 と LOT-2026-00012 を同じとみなす）
        含む・含まない は、空白で区切った語ごとに見る（含む＝すべての語を含む／含まない＝どの語も含まない）
        空欄の行は「〜ない」に当てはまる（Excel と同じ）
大文字小文字・全角半角はいつも区別しない（NFKC でそろえる）。
"""

import re
import unicodedata
from functools import lru_cache

TEXT_OPS = ("contains", "starts", "ends", "not_contains", "not_starts", "not_ends")
WORD_OPS = ("contains", "not_contains")
NUMBER_PATTERN = re.compile(r"[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")


def to_number(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    text = unicodedata.normalize("NFKC", str(value)).strip()
    if not NUMBER_PATTERN.fullmatch(text):
        return None
    return float(text.replace(",", ""))


def looks_number(value):
    """自動判定：数値として読めて、先頭が 0 の番号（0 と 0.5 などは除く）でないとき True。"""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return True
    if to_number(value) is None:
        return False
    digits = unicodedata.normalize("NFKC", str(value)).strip().lstrip("+-")
    return not (len(digits) > 1 and digits[0] == "0" and digits[1] != ".")


def fold(value, fuzzy):
    """比べるための形：NFKC・小文字。fuzzy なら英数字と文字（日本語を含む）以外を取り除く。"""
    text = unicodedata.normalize("NFKC", "" if value is None else str(value)).lower()
    if fuzzy:
        text = "".join(ch for ch in text if ch.isalnum())
    return text


@lru_cache(maxsize=256)
def terms_of(needle, op, fuzzy):
    """条件の語。含む・含まない は空白で区切る。比べられる語がなければ空のタプル。"""
    text = unicodedata.normalize("NFKC", needle or "")
    words = text.split() if op in WORD_OPS else [text.strip()]
    return tuple(word for word in (fold(w, fuzzy) for w in words) if word)


def text_matches(value, op, needle, fuzzy):
    terms = terms_of(needle, op, bool(fuzzy))
    if not terms:
        return True
    target = fold(value, bool(fuzzy))
    if op == "contains":
        return all(term in target for term in terms)
    if op == "not_contains":
        return not any(term in target for term in terms)
    term = terms[0]
    if op == "starts":
        return target.startswith(term)
    if op == "ends":
        return target.endswith(term)
    if op == "not_starts":
        return not target.startswith(term)
    if op == "not_ends":
        return not target.endswith(term)
    return False


def register(conn):
    """接続に関数を足す（キャッシュを開くたびに呼ぶ）。"""
    conn.create_function("ds_number", 1, to_number, deterministic=True)
    conn.create_function("ds_auto_number", 1, lambda value: 1 if looks_number(value) else 0, deterministic=True)
    conn.create_function("ds_text", 4, lambda value, op, needle, fuzzy: 1 if text_matches(value, op, needle, fuzzy) else 0,
                         deterministic=True)
    return conn
