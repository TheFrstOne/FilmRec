"""
★ 离线/在线共用的特征逻辑（唯一来源，避免 train/serve skew）。

目前用"内容特征"（类型 + 地区 + 年份 + 评分）构造电影向量：
  - 类型权重最高（1.0），因为类型最能代表"像不像"
  - 地区 0.5、年份 0.3、评分 0.3
数据来源直接复用 v_movies_flat 视图，所以和你熟悉的 pandas 写法一致。
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler, MultiLabelBinarizer, normalize

WEIGHTS = {"genres": 1.0, "countries": 0.5, "year": 0.3, "rating": 0.3}


def _split_multi(value) -> list[str]:
    """把 "剧情|喜剧" 拆成 ["剧情", "喜剧"]，并去掉空串。"""
    if not isinstance(value, str):
        return []
    return [t.strip() for t in value.split("|") if t.strip()]


def build_item_features(engine):
    """
    返回 (movie_ids, item_matrix)
      movie_ids : np.ndarray[int]   长度 N
      item_matrix: np.ndarray[float32]  形状 (N, F)，每行已做 L2 归一化
    """
    df = pd.read_sql(
        "SELECT movie_id, genres, countries, release_year, rating FROM v_movies_flat",
        engine,
    )
    if df.empty:
        raise RuntimeError("v_movies_flat 没有数据，先跑 ETL 把数据灌进库")

    genre_lists = df["genres"].map(_split_multi)
    country_lists = df["countries"].map(_split_multi)

    # 电影特征矩阵：
    #   - 类型 one-hot
    #   - 地区 one-hot
    genre_matrix = MultiLabelBinarizer().fit_transform(genre_lists).astype("float32")
    country_matrix = MultiLabelBinarizer().fit_transform(country_lists).astype("float32")

    year = df["release_year"].fillna(df["release_year"].median()).astype(float)
    rating = df["rating"].fillna(0).astype(float)
    # 归一化
    year_vec = MinMaxScaler().fit_transform(year.to_numpy().reshape(-1, 1)).astype("float32")
    rating_vec = MinMaxScaler().fit_transform(rating.to_numpy().reshape(-1, 1)).astype("float32")
    
    matrix = np.hstack(
        [
            genre_matrix * WEIGHTS["genres"],
            country_matrix * WEIGHTS["countries"],
            year_vec * WEIGHTS["year"],
            rating_vec * WEIGHTS["rating"],
        ]
    ).astype("float32")

    matrix = normalize(matrix)  # L2 归一化 -> 点积即余弦相似度
    return df["movie_id"].to_numpy(), matrix
