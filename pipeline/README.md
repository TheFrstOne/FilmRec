# filmrec pipeline（离线层）

只做"数据 → 模型文件"。**不 import Flask/FastAPI，不碰前端**。

```
pipeline/
├── etl/        CSV → 规范化 MySQL
├── features/   ★离线/在线共用特征逻辑（features.py）
├── train/      训练脚本 → artifacts/
├── evaluate/   离线评估（Recall@K / NDCG@K）
├── data/       Parquet 快照
└── artifacts/  模型产物（版本化）
```

## 一、ETL：CSV → MySQL（先跑这个）

```powershell
cd D:\Study\FilmRec
backend\.venv\Scripts\activate
pip install -r requirements.txt

# 前置：先建表
#   mysql -u filmRec -p moviesrec < sql\schema.sql
python pipeline\etl\load_movies.py
```

- **幂等**：重复执行不会产生重复数据（movies 用 upsert，comments 先删这批电影再插）。
- **拆解**：`genres="剧情|喜剧"` → `movie_genres` 两行；`actors="A|B"` → `movie_credits` 两行。
- **验证**：`SELECT * FROM v_movies_flat LIMIT 5;`
- 换数据文件：`python pipeline\etl\load_movies.py ..\data\xxx.csv`

## 二、训练内容推荐模型

```powershell
cd D:\Study\FilmRec
backend\.venv\Scripts\activate
pip install -r requirements.txt   # 训练依赖 pandas / scikit-learn

# 前置：MySQL 里已经跑过 sql\schema.sql，且 v_movies_flat 有数据
python pipeline\train\train_content_based.py
```

产出：

```
pipeline/artifacts/content_v1/content_v1_2026-01-01/
├── model.pkl        # {"movie_ids": ndarray, "item_matrix": ndarray(已归一化)}
└── metadata.json    # 版本 / 训练时间 / 特征维度 / 指标
```

然后在 `model_registry` 表里激活该版本。重启 backend 即自动加载。

## 为什么特征代码放在这里

`features/features.py` 被**训练脚本**和**在线服务**同时引用是刻意设计：
保证离线训练和线上打分用的是**完全相同的特征**，避免 train/serve skew。

## 下一步

- `train/train_mf.py`：等 `user_ratings` / `events` 有数据后，上矩阵分解 / 协同过滤。
- `evaluate/`：按时间切分做离线评估（Recall@K / NDCG@K）。
- `etl/` 已提供 `load_movies.py`。
