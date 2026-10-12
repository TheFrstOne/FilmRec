# FilmRec 在线服务（FastAPI）

在线层：加载离线模型 + 读 MySQL + 出推荐。**不做训练**（训练在 `../pipeline`）。

```
浏览器 → Next.js(/api/backend/*) → FastAPI(/api/*) → MySQL
                                          ↑
                                  joblib.load(pipeline/artifacts/...)
```

## 跑起来

```powershell
cd D:\Study\FilmRec\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r ..\requirements.txt
python main.py
```

- 服务：http://127.0.0.1:8000
- **交互式 API 文档（FastAPI 自带）**：http://127.0.0.1:8000/docs

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 + 模型是否加载 |
| GET | `/api/tables` | 列出库里所有表 |
| GET | `/api/movies?page=1&size=12&keyword=` | 分页/搜索 |
| GET | `/api/movies/{id}` | 电影详情 |
| GET | `/api/movies/{id}/similar?top_n=10` | 相似电影（内容推荐） |
| GET | `/api/recommend/{user_id}?top_n=10` | 给用户推荐（自动冷启动） |
| GET | `/api/stats/genres` | 类型统计 |
| GET | `/api/stats/years` | 年份统计 |

## 冷启动逻辑（`recommender.py`）

```
请求 /api/recommend/{user_id}
  ├─ 模型没加载        → 热度兜底 popularity(no-model)
  ├─ 有评分/收藏行为    → 实时内容相似度 content-based
  └─ 全新用户          → 热度榜 popularity(cold-start)
```

返回值里的 `strategy` 字段告诉你走了哪条路径，方便调试和观测。

## 与训练层的关系

- 模型产物由 `pipeline/train/train_content_based.py` 生成到 `pipeline/artifacts/`。
- 本服务启动时扫描 `artifacts/*/*/model.pkl`，取最新版本加载。
- 生产化后改为读 `model_registry` 表里 `is_active=1` 的版本（见 DESIGN.md）。
