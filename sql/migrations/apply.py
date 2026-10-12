"""
执行 sql/migrations/*.sql 里的迁移脚本。

用法（在 FilmRec 根目录，用 backend 的虚拟环境）：
    backend\\.venv\\Scripts\\python.exe sql\\migrations\\apply.py            # 跑全部
    backend\\.venv\\Scripts\\python.exe sql\\migrations\\apply.py 001_auth.sql  # 只跑指定文件

数据库连接信息从 backend/.env 读取（和 FastAPI 用同一份）。
迁移脚本本身不带记录表，重复执行可能报"字段已存在"，属正常现象。
"""
from __future__ import annotations

import os
import sys

import pymysql
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATIONS_DIR = os.path.dirname(os.path.abspath(__file__))


def load_config() -> dict:
    load_dotenv(os.path.join(ROOT, "backend", ".env"))
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME"),
        "charset": "utf8mb4",
        "autocommit": True,
    }


def split_statements(sql: str) -> list[str]:
    """按分号切分语句，丢掉注释行。迁移文件里没有字符串内含分号的情况。"""
    lines = [ln for ln in sql.splitlines() if not ln.strip().startswith("--")]
    body = "\n".join(lines)
    return [stmt.strip() for stmt in body.split(";") if stmt.strip()]


def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else None
    files = (
        [os.path.join(MIGRATIONS_DIR, target)]
        if target
        else sorted(
            os.path.join(MIGRATIONS_DIR, f)
            for f in os.listdir(MIGRATIONS_DIR)
            if f.endswith(".sql")
        )
    )

    config = load_config()
    print(f"连接 {config['user']}@{config['host']}:{config['port']}/{config['database']}")
    conn = pymysql.connect(**config)

    try:
        with conn.cursor() as cur:
            for path in files:
                name = os.path.basename(path)
                with open(path, encoding="utf-8") as fh:
                    statements = split_statements(fh.read())
                print(f"\n>>> {name}（{len(statements)} 条语句）")
                for stmt in statements:
                    try:
                        cur.execute(stmt)
                        print(f"    OK  {stmt.splitlines()[0][:70]}")
                    except pymysql.err.OperationalError as exc:
                        # 1060 字段已存在 / 1061 索引已存在 / 1050 表已存在 → 迁移重复执行
                        if exc.args[0] in (1050, 1060, 1061, 1091):
                            print(f"    跳过（已应用过）: {exc.args[1]}")
                        else:
                            raise
    finally:
        conn.close()

    print("\n迁移完成。")


if __name__ == "__main__":
    main()
