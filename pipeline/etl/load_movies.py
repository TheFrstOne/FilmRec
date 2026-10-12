"""
ETL：把扁平 CSV 拆进规范化后的 MySQL 表。

    Extract  : pd.read_csv(movie_data_clean.csv)
    Transform: 拆 "剧情|喜剧"、去重、类型转换
    Load     : 写入 movies / genres / movie_genres / countries / ...
               全部用 upsert，**可重复执行**（幂等，不会产生重复行）

用法（在 FilmRec 根目录）：
    backend\\.venv\\Scripts\\activate
    pip install -r pipeline\\requirements.txt
    python pipeline\\etl\\load_movies.py
    # 也可指定文件：python pipeline\\etl\\load_movies.py ..\\data\\xxx.csv

前置：先跑过 sql\\schema.sql 建好表。
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd
from sqlalchemy import MetaData, Table, bindparam, create_engine, text
from sqlalchemy.dialects.mysql import insert as mysql_insert

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_CSV = os.path.join(ROOT, "data", "movie_data_clean.csv")


# ------------------------------------------------------------------
# 基础工具
# ------------------------------------------------------------------
def get_engine():
    from dotenv import load_dotenv

    load_dotenv(os.path.join(ROOT, "backend", ".env"))
    url = os.getenv("DATABASE_URL") or (
        f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
        f"@{os.getenv('DB_HOST', '127.0.0.1')}:{os.getenv('DB_PORT', '3306')}"
        f"/{os.getenv('DB_NAME')}?charset=utf8mb4"
    )
    return create_engine(url, pool_pre_ping=True)


def _s(value):
    """转成干净字符串，空值返回 None。"""
    if value is None:
        return None
    if isinstance(value, float) and np.isnan(value):
        return None
    text_value = str(value).strip()
    return text_value or None


def _i(value):
    if value is None:
        return None
    if isinstance(value, float) and np.isnan(value):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _f(value):
    if value is None:
        return None
    if isinstance(value, float) and np.isnan(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def split_multi(value) -> list[str]:
    """'剧情|喜剧' -> ['剧情', '喜剧']；空值 -> []"""
    s = _s(value)
    if not s:
        return []
    return [t.strip() for t in s.split("|") if t.strip()]


def upsert(engine, table_name: str, records: list[dict], key_cols: list[str], chunksize: int = 1000):
    """
    INSERT ... ON DUPLICATE KEY UPDATE（幂等）。

    ⚠️ 刻意不用 INSERT IGNORE：IGNORE 会把“数据过长 / 编码错误”等行静默丢弃，
    导致后面按名字查 id 时 KeyError。ON DUPLICATE 只忽略主键重复，其它错误会正常抛出。
    """
    if not records:
        return
    table = Table(table_name, MetaData(), autoload_with=engine)
    update_cols = [c for c in records[0].keys() if c not in key_cols]
    if not update_cols:
        # 字典表 / 关联表没有要更新的字段，重复时自我赋值即可
        update_cols = [key_cols[0]]

    with engine.begin() as conn:
        for start in range(0, len(records), chunksize):
            chunk = records[start : start + chunksize]
            stmt = mysql_insert(table).values(chunk)
            stmt = stmt.on_duplicate_key_update(
                **{c: stmt.inserted[c] for c in update_cols}
            )
            conn.execute(stmt)


def _norm(name) -> str:
    """Python 侧匹配用的归一化 key（首尾空格/大小写不敏感）。"""
    return str(name).strip().casefold()


def _read_id_map(engine, table: str, id_col: str, name_col: str = "name") -> dict[str, int]:
    with engine.connect() as conn:
        rows = conn.execute(text(f"SELECT {id_col}, {name_col} FROM {table}")).all()
    return {_norm(nm): pid for pid, nm in rows if nm is not None}


def resolve_ids(engine, table: str, id_col: str, names, name_col: str = "name") -> dict[str, int]:
    """
    保证 names 都存在于字典表，返回 {归一化名字: id}。三层保险，避免 KeyError：
      1) 批量 upsert（坏数据会抛错，不再静默丢弃）
      2) 回查建映射 + casefold 归一化（MySQL *_ci 排序不区分大小写）
      3) 仍缺失的名字逐个插入，并用 MySQL 排序规则回查（兜住重音/变体字符）
    """
    unique = sorted({_s(n) for n in names if _s(n)})
    if not unique:
        return {}

    try:
        upsert(engine, table, [{name_col: n} for n in unique], key_cols=[name_col])
    except Exception as e:
        print(f"  ⚠️ {table} 批量插入失败，改为逐条插入：{e}")
        for n in unique:
            try:
                upsert(engine, table, [{name_col: n}], key_cols=[name_col])
            except Exception as e2:
                print(f"     ✗ 跳过 {n!r}：{e2}")

    mapping = _read_id_map(engine, table, id_col, name_col)

    missing = [n for n in unique if _norm(n) not in mapping]
    if missing:
        print(f"  ⚠️ {table}: {len(missing)} 个名字未命中，逐个兜底（示例 {missing[:3]}）")
        for n in missing:
            try:
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            f"INSERT INTO {table} ({name_col}) VALUES (:n) "
                            f"ON DUPLICATE KEY UPDATE {name_col} = :n"
                        ),
                        {"n": n},
                    )
                    row = conn.execute(
                        text(f"SELECT {id_col} FROM {table} WHERE {name_col} = :n LIMIT 1"),
                        {"n": n},
                    ).first()
                if row:
                    mapping[_norm(n)] = row[0]
                else:
                    print(f"     ✗ 无法解析 {n!r}，跳过该条关联")
            except Exception as e:
                print(f"     ✗ 处理 {n!r} 失败：{e}")
    return mapping


# ------------------------------------------------------------------
# 各表加载
# ------------------------------------------------------------------
def load_movies(engine, df: pd.DataFrame):
    records = [
        {
            "movie_id": _i(r.get("movie_id")),
            "title": _s(r.get("title")) or "",
            "release_year": _i(r.get("year")),
            "rating": _f(r.get("rating")),
            "star_count": _f(r.get("star_count")),
            "comment_count": _i(r.get("comment_count")),
            "poster_url": _s(r.get("poster")),
            "hot_rank": _i(r.get("rank")),
        }
        for _, r in df.iterrows()
    ]
    records = [r for r in records if r["movie_id"] is not None]
    upsert(engine, "movies", records, key_cols=["movie_id"])
    print(f"  movies          : {len(records)}")


def _load_dictionary_and_pairs(engine, dict_table, dict_id, pair_table, pairs):
    """通用：建字典表 + 建关联表。pairs 由调用方预先算好。"""
    if not pairs:
        print(f"  {dict_table:<15} : 0")
        return
    names = {name for _, name in pairs}
    name2id = resolve_ids(engine, dict_table, dict_id, names)
    mappings = [
        {"movie_id": mid, dict_id: name2id[_norm(name)]}
        for mid, name in pairs
        if _norm(name) in name2id
    ]
    upsert(engine, pair_table, mappings, key_cols=["movie_id", dict_id])
    print(f"  {dict_table:<15} : {len(names)}  |  {pair_table}: {len(mappings)}")


def load_genres(engine, df):
    pairs = []
    for _, r in df.iterrows():
        mid = _i(r.get("movie_id"))
        if mid is None:
            continue
        pairs += [(mid, g) for g in split_multi(r.get("genres"))]
    _load_dictionary_and_pairs(engine, "genres", "genre_id", "movie_genres", pairs)


def load_countries(engine, df):
    pairs = []
    for _, r in df.iterrows():
        mid = _i(r.get("movie_id"))
        if mid is None:
            continue
        pairs += [(mid, c) for c in split_multi(r.get("countries"))]
    _load_dictionary_and_pairs(engine, "countries", "country_id", "movie_countries", pairs)


def load_credits(engine, df):
    credits = []  # (movie_id, name, role, ord)
    for _, r in df.iterrows():
        mid = _i(r.get("movie_id"))
        if mid is None:
            continue
        for i, name in enumerate(split_multi(r.get("directors"))):
            credits.append((mid, name, "director", i))
        for i, name in enumerate(split_multi(r.get("actors"))):
            credits.append((mid, name, "actor", i))
    if not credits:
        return

    names = {c[1] for c in credits}
    name2id = resolve_ids(engine, "persons", "person_id", names)

    records = [
        {"movie_id": mid, "person_id": name2id[_norm(name)], "role": role, "ord": order}
        for mid, name, role, order in credits
        if _norm(name) in name2id
    ]
    missing = sum(1 for _, name, _, _ in credits if _norm(name) not in name2id)
    if missing:
        print(f"  ⚠️ 有 {missing} 条 credits 因人名无法解析被跳过")
    upsert(engine, "movie_credits", records, key_cols=["movie_id", "person_id", "role"])
    print(f"  persons         : {len(names)}  |  movie_credits: {len(records)}")


def load_users_and_comments(engine, df):
    # --- 用户 ---
    users = {}
    for _, r in df.iterrows():
        name = _s(r.get("user_name"))
        if name:
            users[name] = {"user_name": name, "avatar_url": _s(r.get("user_avatar"))}
    upsert(engine, "users", list(users.values()), key_cols=["user_name"])
    name2id = resolve_ids(engine, "users", "user_id", users.keys(), name_col="user_name")
    print(f"  users           : {len(users)}")

    # --- 评论：先删这批电影的旧评论，再插入（保证可重复执行）---
    movie_ids = [mid for mid in (_i(x) for x in df["movie_id"].tolist()) if mid is not None]
    delete_sql = text("DELETE FROM comments WHERE movie_id IN :ids").bindparams(
        bindparam("ids", expanding=True)
    )
    with engine.begin() as conn:
        for start in range(0, len(movie_ids), 1000):
            conn.execute(delete_sql, {"ids": movie_ids[start : start + 1000]})

    records = []
    for _, r in df.iterrows():
        content = _s(r.get("comment"))
        mid = _i(r.get("movie_id"))
        if not content or mid is None:
            continue
        name = _s(r.get("user_name"))
        records.append(
            {"movie_id": mid, "user_id": name2id.get(_norm(name)) if name else None, "content": content}
        )

    if records:
        comments = Table("comments", MetaData(), autoload_with=engine)
        with engine.begin() as conn:
            for start in range(0, len(records), 500):
                conn.execute(comments.insert(), records[start : start + 500])
    print(f"  comments        : {len(records)}")


# ------------------------------------------------------------------
def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    engine = get_engine()

    df = pd.read_csv(csv_path)
    before = len(df)
    df = df.drop_duplicates(subset=["movie_id"], keep="last")
    print(f"▶ 读取 {before} 行（去重后 {len(df)} 行）：{csv_path}")

    load_movies(engine, df)
    load_genres(engine, df)
    load_countries(engine, df)
    load_credits(engine, df)
    load_users_and_comments(engine, df)

    print("✅ ETL 完成。可执行 SELECT * FROM v_movies_flat LIMIT 5 验证。")


if __name__ == "__main__":
    main()
