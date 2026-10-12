# FilmRec 推荐系统 —— 架构设计（v2）

> 本文档回答四件事：目录结构、表结构、离线模型如何上线（含冷启动）、技术栈选型。

---

## 0. 一句话总览

```
离线 pipeline  ── 训练出 model.pkl ──►  artifacts/  ──►  在线 backend 加载并出推荐
    ▲                                                        │
    └──────────────  events 行为日志回流  ◄──────────────────┘
```

**离线负责"把数据变成模型文件"，在线负责"把模型文件变成接口响应"，两者只通过产物文件 + 契约交接。**

---

## 1. 目标目录结构

```
FilmRec/
├── frontend/                      # Next.js（原 next.js-fullstack-architecture-template-main）
├── backend/                       # ★ 在线服务（FastAPI）
│   ├── main.py                    #   路由入口（电影 / 推荐 / 统计）
│   ├── auth.py                    #   注册 / 登录 / 刷新 / 登出 / 当前用户
│   ├── db.py                      #   MySQL 连接
│   ├── recommender.py             #   加载模型 + 出推荐 + 冷启动兜底
│   └── .env
├── pipeline/                      # ★ 离线层（和线上物理隔离）
│   ├── etl/                       #   CSV → 规范化 MySQL
│   ├── features/features.py       #   ★离线/在线共用特征逻辑
│   ├── train/train_content_based.py
│   ├── evaluate/                  #   Recall@K / NDCG@K
│   ├── data/                      #   Parquet 快照（带日期）
│   └── artifacts/                 #   模型产物（版本化）
│       └── content_v1/content_v1_2026-01-01/{model.pkl, metadata.json}
├── requirements.txt              #   ★全项目统一依赖（backend + pipeline + tools）
├── sql/
│   └── schema.sql                 #   唯一的 DDL 文件
├── data/movie_data_clean.csv
└── DESIGN.md
```

### 迁移命令（PowerShell，我不能帮你执行）
```powershell
cd D:\Study\FilmRec
Rename-Item next.js-fullstack-architecture-template-main frontend
# 如果是 git 仓库：git mv next.js-fullstack-architecture-template-main frontend
# 旧后端：backend\app.py(Flask) 已被 main.py(FastAPI) 取代，确认后删掉
Remove-Item backend\app.py
Remove-Item sql\recsys_tables.sql   # 已并入 schema.sql
```

---

## 2. 表结构（见 `sql/schema.sql`）

设计原则：**实体建表、多值拆关联表、只建必要索引、聚合结果做成视图**。

```
movies ─┬─ movie_genres ── genres
        ├─ movie_countries ── countries
        ├─ movie_credits ── persons            (role: director/actor)
        ├─ comments ── users
        ├─ user_ratings ── users               (推荐算法燃料)
        ├─ movie_embeddings                    (向量召回用)
        └─ recommendations                     (离线批算结果，在线只查这里)

events            # 行为日志（曝光/点击/收藏/评分）→ 训练数据来源
model_registry    # 模型版本注册表，支持一键回滚

-- 聚合统计不再建表，改成视图：
v_movies_flat, v_stat_year, v_stat_genre, v_stat_region, v_stat_actor, ...
```

关键点：
- **不再用 `df.to_sql` 建表**（它不建索引/主键）。表结构由 `schema.sql` 定义，`to_sql` 只负责写数据。
- 原来的 `count_by_year` 等**派生表全部改成视图**，永远不会过期、不会重复。
- `events` 是推荐系统的燃料，数据量大会按月分区（`schema.sql` 里留了注释）。

---

## 3. ★ 离线训练好了怎么用？新用户怎么办？

这是你问题的核心。答案是 **"批算 + 实时"混合**，工业界都这么做。

### 3.1 模型产物的生命周期

```
train 脚本 ──► artifacts/content_v1/<版本>/model.pkl + metadata.json
           ──► 写 model_registry(is_active=1)
在线服务启动 ──► 读 model_registry / 扫最新版本 ──► joblib.load（只加载一次，放全局）
回滚        ──► UPDATE model_registry SET is_active 切到旧版本，重启即可
```

### 3.2 三种请求，三种处理（这就是冷启动方案）

| 用户类型 | 处理方式 | 延迟 | 说明 |
|---|---|---|---|
| **老用户**（有行为） | 查 `recommendations` 表（离线批算好） | ~1ms | 主力路径 |
| **新用户**（刚注册，无行为） | **热度兜底**（Popularity） | ~1ms | 直接查 `movies` 按热度排 |
| **半新用户**（有 1~2 次行为） | **实时内容推荐**：取他喜欢的电影向量求平均，算余弦相似 | ~5ms | 见 `recommender.py` |

**所以新用户完全不会"没效率"**：
- 不需要为新用户重训模型（训练是模型级别，不是用户级别）；
- 不需要给新用户单独跑一个大任务（内容是 O(1) 的矩阵乘，几毫秒）；
- 系统靠"降级策略"保证任何时候都有推荐结果可返回。

### 3.3 为什么不做"每个用户都实时推理"

- 实时全量推理成本高、延迟不稳；
- 离线批算可以跑很重的模型（深度召回等），在线只查表；
- 工业界标准：**离线批算做召回（粗筛几百个）→ 在线轻量模型做排序（精排 Top-10）**。
- 你现在的规模，先把"批算 + 兜底"做扎实就够了。

### 3.4 推荐的请求流程图

```
GET /api/recommend/{user_id}
        │
        ├─ 模型没加载？ → 直接热度兜底
        │
        ├─ 查 recommendations 表命中？ → 直接返回（老用户）
        │
        ├─ 有历史行为？ → 实时内容相似度打分（半新用户）
        │
        └─ 啥都没有？ → 热度榜（新用户 cold-start）
```

---

## 3.5 用户认证（谁在用这个系统）

**认证只有一个入口：FastAPI。** 前端（Next.js）只画界面，不碰数据库也不碰密码。

```
注册/登录表单 ──► /api/backend/auth/*  ──► FastAPI(backend/auth.py) ──► MySQL.users
                        （Next 反向代理）                │
                                                         └─ 签发 JWT，写进 httpOnly Cookie
```

| 设计点 | 做法 | 为什么 |
|---|---|---|
| 密码 | bcrypt 哈希存 `users.password_hash` | 明文/可逆加密都是事故 |
| 登录身份 | `email`（唯一、大小写不敏感） | 昵称 `user_name` 允许重名 |
| 会话 | JWT 放在 **httpOnly** Cookie | JS 读不到，防 XSS 偷 token |
| access token | 1 分钟 | 短到被偷也几乎没用 |
| refresh token | 7 天，**一次一换** | 用过的 jti 进 `refresh_tokens` 黑名单，重放直接拒 |
| 前端鉴权 | `middleware.ts` 用 jose 验签 | 只做**页面**守卫（未登录跳登录页） |
| 接口鉴权 | FastAPI 自己读 Cookie | 真正的安全边界在服务端 |

> 前后端共用同一个 HS256 密钥：`backend/.env` 与 `frontend/.env.local` 里的
> `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` **必须一致**，否则中间件验不过 FastAPI 签的 token。

对应到推荐系统：登录用户的 `users.user_id` 直接就是 `user_ratings` / `events` /
`recommendations` 的外键，所以「注册 → 打分 → 拿推荐」这条链路天然打通。

---

## 4. 技术栈升级（面向就业/实习）

> 先明确：**不同岗位方向，栈不一样**。下面默认按 **推荐算法 / 数据开发方向**，这也是"电影推荐系统"最自然的落点。
> 若你目标是**后端开发（Java）**，告诉我，我把在线层换成 Spring Boot。

| 层 | 你原来 | 换成 | 为什么（面试怎么说） |
|---|---|---|---|
| 在线框架 | Flask | **FastAPI** | 异步、Pydantic 校验、自带 Swagger 文档、类型提示；算法/数据岗服务层标配 |
| 参数校验 | 无 | **Pydantic** | 请求/响应模型化，自动校验 + 文档 |
| 训练 | pandas+sklearn | pandas/sklearn → **LightFM / implicit / PyTorch** | 真正能写进简历的推荐模型（MF / 双塔） |
| 向量召回 | 无 | **Faiss**（或 Milvus） | 面试高频：ANN 近似最近邻检索 |
| 缓存/在线特征 | 无 | **Redis** | 缓存推荐结果、存放实时特征 |
| 行为日志流 | 无 | **Kafka**（可选，加分项） | 异步写日志、解耦、削峰 |
| 调度 | 手动跑 | **APScheduler**（简单）/ Airflow（进阶） | 定时训练 + 批算 |
| 实验管理 | 无 | **MLflow** | 记录参数/指标/产物，简历加分 |
| 容器化 | 无 | **Docker + docker-compose** | 面试必问，一键起全套环境 |
| 数据库 | MySQL | MySQL + **Redis** | 关系数据 + 缓存/特征 |
| 前端 | Next.js | **保持** | 已经够现代 |

**别一上来全上**：按 `Docker → FastAPI → Redis → LightFM → Faiss → MLflow` 的顺序加，每加一个都要能讲清"解决了什么问题"。

---

## 5. 落地路线

| 阶段 | 做什么 | 产出 |
|---|---|---|
| Phase 0 ✅ | 规范化 schema | `sql/schema.sql` |
| Phase 1 | ETL：CSV → 规范化表 | `pipeline/etl/load_movies.py` |
| Phase 2 ✅ | 内容推荐训练 + FastAPI 服务（含冷启动兜底） | `pipeline/train/` + `backend/` |
| Phase 3 | 前端埋点，收集行为 | `events` 表开始有数据 |
| Phase 4 | 协同过滤 / 矩阵分解 + 离线评估 | `pipeline/train/train_mf.py`、`pipeline/evaluate/` |
| Phase 5 | Redis 缓存 + Faiss 召回 + Docker + MLflow | 生产化 |

---

## 6. 避坑清单

1. **数据泄漏**：评估按时间切分，绝不随机切分用户-物品交互。
2. **train/serve skew**：特征函数唯一来源（`pipeline/features/features.py`）。
3. **模型只加载一次**：FastAPI 启动时 `joblib.load`，别每个请求都读盘。
4. **冷启动三层兜底**：批算 → 实时内容 → 热度。
5. **特征列顺序固定**：写进 `metadata.json`，加载时校验。
6. **曝光日志爆量**：`events` 按月分区。
7. **接口契约统一**：`{"status":"success","data":...}`。
