"""ログ出力の設定。検索値や検索結果の全文はログへ出さない。"""

import logging
import logging.handlers
import os

LOGGER_NAME = "data_search"
LOG_FILE_NAME = "data-search.log"


def setup_logging(directory, level="info"):
    os.makedirs(directory, exist_ok=True)
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(getattr(logging, str(level).upper(), logging.INFO))
    logger.handlers.clear()

    file_handler = logging.handlers.RotatingFileHandler(
        os.path.join(directory, LOG_FILE_NAME),
        maxBytes=1_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(file_handler)

    console = logging.StreamHandler()
    console.setLevel(logging.WARNING)
    console.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    logger.addHandler(console)
    return logger


def get_logger():
    return logging.getLogger(LOGGER_NAME)
