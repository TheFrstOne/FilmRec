"""
离线训练：内容相似度模型（先用它跑通"训练 -> 产物 -> 在线加载"整条链路）。

用法（在 FilmRec 根目录）：
    cd D:\\Study\\FilmRec
    backend\\.venv\\Scripts\\activate
    python pipeline\\train\\train_content_based.py

产物：
    pipeline/artifacts/content_v1/content_v1_<日期>/model.pkl
    pipeline/artifacts/content_v1/content_v1_<日期>/metadata.json
并在 model_registry 表登记（若表存在）。
"""
from __future__ import annotations

import datetime
import json
import os
import sys

import joblib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from pipeline.features.features import WEIGHTS, build_item_features  # noqa: E402

MODEL_NAME = "content_v1"


def get_engine():
    from dotenv import load_dotenv
    from sqlalchemy import create_engine

    load_dotenv(os.path.join(ROOT, "backend", ".env"))
    url = os.getenv("DATABASE_URL") or (
        f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
        f"@{os.getenv('DB_HOST', '127.0.0.1')}:{os.getenv('DB_PORT', '3306')}"
        f"/{os.getenv('DB_NAME')}?charset=utf8mb4"
    )
    return create_engine(url, pool_pre_ping=True)


def register_model(engine, version: str, artifact_path: str, metadata: dict):
    """把新版本登记进 model_registry，并把旧版本置为非激活。"""
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            conn.execute(text("UPDATE model_registry SET is_active=0"))
            conn.execute(
                text(
                    "INSERT INTO model_registry "
                    "(model_version, model_name, artifact_path, metrics, is_active) "
                    "VALUES (:v, :n, :p, :m, 1) "
                    "ON DUPLICATE KEY UPDATE artifact_path=VALUES(artifact_path), is_active=1"
                ),
                {
                    "v": version,
                    "n": MODEL_NAME,
                    "p": artifact_path,
                    "m": json.dumps(metadata.get("metrics", {})),
                },
            )
        print(f"✅ 已登记模型版本 {version}（is_active=1）")
    except Exception as e:
        print(f"ℹ️ 跳过 model_registry 登记（表可能还没建）：{e}")


def main():
    engine = get_engine()

    print("▶ 构建电影特征…")
    # 得到电影的id，以及
    movie_ids, matrix = build_item_features(engine)

    version = f"{MODEL_NAME}_{datetime.date.today().isoformat()}"
    out_dir = os.path.join(ROOT, "pipeline", "artifacts", MODEL_NAME, version)
    os.makedirs(out_dir, exist_ok=True)

    model_path = os.path.join(out_dir, "model.pkl")
    joblib.dump({"movie_ids": movie_ids, "item_matrix": matrix}, model_path)

    metadata = {
        "model_name": MODEL_NAME,
        "model_version": version,
        "trained_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "algorithm": "content-based cosine similarity",
        "n_movies": int(len(movie_ids)),
        "n_features": int(matrix.shape[1]),
        "weights": WEIGHTS,
        "metrics": {},  # 后面在 evaluate/ 里回填 Recall@K / NDCG@K
    }
    with open(os.path.join(out_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    register_model(engine, version, model_path, metadata)

    print(f"✅ 训练完成：{out_dir}")
    print(f"   电影数 {metadata['n_movies']}，特征维度 {metadata['n_features']}")
    print("   重启 backend 即会自动加载该版本。")


if __name__ == "__main__":
    main()
