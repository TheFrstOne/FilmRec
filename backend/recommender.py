"""
在线推荐器：加载离线训练好的产物，并处理三种用户（含冷启动）。

模型产物结构（由 pipeline/train/train_content_based.py 生成）：
    artifacts/content_v1/<version>/model.pkl   ->  {"movie_ids": np.ndarray, "item_matrix": np.ndarray}
    artifacts/content_v1/<version>/metadata.json
"""

from __future__ import annotations

import glob
import json
import os
from typing import Optional

import joblib
import numpy as np

from db import fetch_all


class Recommender:
    def __init__(self, artifact_dir: Optional[str] = None):
        here = os.path.dirname(os.path.abspath(__file__))
        self.artifact_dir = artifact_dir or os.getenv(
            "ARTIFACT_DIR", os.path.join(here, "..", "pipeline", "artifacts")
        )
        self.model = None
        self.metadata = None
        self.version = None
        self._index: dict[int, int] = {}
        self._movies: dict[int, dict] = {}

        # 相当于用函数初始化喽
        self._load_movie_lookup()
        self.load_active_model()

    # ---------- 启动时：加载电影字典 + 模型（只做一次） ----------
    def _load_movie_lookup(self):
        try:
            rows = fetch_all(
                "SELECT movie_id, title, rating, release_year, poster_url FROM movies"
            )
            self._movies = {r["movie_id"]: r for r in rows}
        except Exception as e:  # 表还没建也不该让服务起不来
            print(f"[recommender] 读取 movies 失败（服务继续启动）：{e}")
            self._movies = {}

    def load_active_model(self):
        candidates = sorted(
            glob.glob(os.path.join(self.artifact_dir, "*", "*", "model.pkl"))
        )
        if not candidates:
            print("[recommender] 未找到模型产物，推荐将只走热度兜底")
            return
        path = candidates[-1]
        self.model = joblib.load(path)
        with open(os.path.join(os.path.dirname(path), "metadata.json"), encoding="utf-8") as f:
            self.metadata = json.load(f)
        self.version = self.metadata.get("model_version")
        self._index = {int(mid): i for i, mid in enumerate(self.model["movie_ids"])}
        print(f"[recommender] 已加载模型 {self.version}（{len(self._index)} 部电影）")

    @property
    def ready(self) -> bool:
        return self.model is not None

    # ---------- 用户画像（从行为/评分里取） ----------
    def _seen_movies(self, user_id: int) -> set[int]:
        ids: set[int] = set()
        try:
            # 用户看过的电影
            rows = fetch_all(
                "SELECT DISTINCT movie_id FROM events WHERE user_id=:u AND movie_id IS NOT NULL",
                {"u": user_id},
            )
            ids |= {r["movie_id"] for r in rows}
        except Exception:
            pass
        return ids

    # 获取用户评分+收藏过的电影，作为“喜欢”的电影集合
    def _liked_movies(self, user_id: int) -> set[int]:
        ids: set[int] = set()
        try:
            rows = fetch_all(
                "SELECT DISTINCT movie_id FROM user_ratings WHERE user_id=:u AND score>=4",
                {"u": user_id},
            )
            ids |= {r["movie_id"] for r in rows}
        except Exception:
            pass
        try:
            rows = fetch_all(
                "SELECT DISTINCT movie_id FROM events "
                "WHERE user_id=:u AND event_type IN ('favorite','rating') "
                "AND (score IS NULL OR score>=4)",
                {"u": user_id},
            )
            ids |= {r["movie_id"] for r in rows}
        except Exception:
            pass
        return ids

    def _popular(self, exclude: set[int], top_n: int) -> list[dict]:
        rows = fetch_all(
            """
            SELECT movie_id,
                   COALESCE(rating, 0) * 10 + LOG10(COALESCE(comment_count, 0) + 1) AS pop
              FROM movies
             ORDER BY pop DESC
             LIMIT :lim
            """,
            {"lim": min(top_n + len(exclude) + 100, 1000)},
        )
        picked = [(r["movie_id"], r["pop"]) for r in rows if r["movie_id"] not in exclude]
        return self._enrich(picked[:top_n])

    #将推荐结果包装
    def _enrich(self, scored: list[tuple[int, float]]) -> list[dict]:
        out = []
        # (movie_id, 分数)
        for mid, score in scored:
            m = self._movies.get(mid, {})
            out.append(
                {
                    "movie_id": mid,
                    "title": m.get("title"),
                    "release_year": m.get("release_year"),
                    "rating": float(m["rating"]) if m.get("rating") is not None else None,
                    "poster": m.get("poster_url"),
                    "score": round(float(score), 4),
                }
            )
        return out

    def _brief(self, movie_ids, limit: int = 3) -> list[dict]:
        """给前端做「因为你喜欢…」的可解释展示：按评分从高到低取前几部。"""
        ordered = sorted(
            movie_ids,
            key=lambda mid: (self._movies.get(mid, {}).get("rating") or 0),
            reverse=True,
        )
        out = []
        for mid in ordered[:limit]:
            m = self._movies.get(mid)
            if m:
                out.append({"movie_id": mid, "title": m.get("title")})
        return out

    # ---------- 对外能力 ----------
    def popular(self, top_n: int = 10) -> dict:
        """访客 / 冷启动用的纯热度榜，不需要身份。"""
        return {"strategy": "popularity(cold-start)", "items": self._popular(set(), top_n)}

    def similar_movies(self, movie_id: int, top_n: int = 10) -> dict:
        if not self.ready or movie_id not in self._index:
            return {"strategy": "unavailable", "items": []}
        vec = self.model["item_matrix"][self._index[movie_id]]
        scores = self.model["item_matrix"] @ vec
        order = np.argsort(-scores)
        picked = []
        for i in order:
            mid = int(self.model["movie_ids"][i])
            if mid == movie_id:
                continue
            picked.append((mid, scores[i]))
            if len(picked) >= top_n:
                break
        return {"strategy": "content-based", "items": self._enrich(picked)}

    def recommend_for_user(self, user_id: int, top_n: int = 10) -> dict:
        seen = self._seen_movies(user_id)

        # (1) 模型没加载 -> 热度兜底
        if not self.ready:
            return {"strategy": "popularity(no-model)", "items": self._popular(seen, top_n)}

        # (2) 半新用户：有行为 -> 实时内容相似度
        liked = self._liked_movies(user_id)
        liked_idx = [self._index[mid] for mid in liked if mid in self._index]
        if liked_idx:
            vec = self.model["item_matrix"][liked_idx].mean(axis=0)
            scores = self.model["item_matrix"] @ vec
            order = np.argsort(-scores)
            picked = []
            for i in order:
                mid = int(self.model["movie_ids"][i])
                if mid in seen or mid in liked:
                    continue
                picked.append((mid, scores[i]))
                if len(picked) >= top_n:
                    break
            return {
                "strategy": "content-based",
                # 这条推荐是怎么来的：把你打过高分/收藏的电影亮出来，避免「黑盒推荐」
                "based_on": self._brief(liked),
                "items": self._enrich(picked),
            }

        # (3) 新用户：无任何行为 -> 热度榜
        return {"strategy": "popularity(cold-start)", "items": self._popular(seen, top_n)}
