from __future__ import annotations

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

def _build_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    return (
        f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
        f"@{os.getenv('DB_HOST', '127.0.0.1')}:{os.getenv('DB_PORT', '3306')}"
        f"/{os.getenv('DB_NAME')}?charset=utf8mb4"
    )

engine = create_engine(_build_url(), pool_pre_ping=True, pool_recycle=3600)

def fetch_all(sql: str, params: dict | None = None) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params or {}).mappings().all()
    return [dict(r) for r in rows]

def fetch_one(sql: str, params: dict | None = None) -> dict | None:
    rows = fetch_all(sql, params)
    return rows[0] if rows else None

def execute(sql: str, params: dict | None = None) -> dict:
    """执行写操作，返回 {"lastrowid": ..., "rowcount": ...}。

    在事务里执行，返回前就取好值（连接关闭后 CursorResult 不可再读）。
    """
    with engine.begin() as conn:
        result = conn.execute(text(sql), params or {})
        return {"lastrowid": result.lastrowid or 0, "rowcount": result.rowcount}
