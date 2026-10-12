# FilmRec 数据库表结构说明

建表：`mysql -u filmRec -p moviesrec < schema.sql`

## 一、三层结构

### 1. 实体表（存"是什么"）

| 表 | 说明 |
|---|---|
| `movies` | 电影主表，一部电影一行（片名/年份/评分/评论数/海报）|
| `genres` | 类型字典（剧情、喜剧…）|
| `countries` | 地区字典（中国大陆、美国…）|
| `persons` | 人物字典（导演+演员共用）|
| `users` | 用户 |
| `comments` | 评论 |
| `user_ratings` | 用户评分（推荐算法燃料）|

### 2. 关联表（把"一格多值"拆开）

| 表 | 说明 | 对应原字段 |
|---|---|---|
| `movie_genres` | 电影↔类型 | `genres="剧情\|喜剧"` |
| `movie_countries` | 电影↔地区 | `countries="中国大陆\|香港"` |
| `movie_credits` | 电影↔人物，`role` 区分导演/演员 | `directors`、`actors` |

### 3. 推荐系统运行表

| 表 | 说明 |
|---|---|
| `events` | 用户行为日志（曝光/点击/收藏/评分）→ 训练数据来源 |
| `recommendations` | 离线批算好的 Top-N 推荐，在线只查这张表 |
| `model_registry` | 模型版本表，`is_active=1` 是线上版本 |
| `movie_embeddings` | 电影向量（Faiss 召回用，暂时空着）|

## 二、统计不存表，用视图

| 视图 | 说明 |
|---|---|
| `v_movies_flat` | 拼回 CSV 扁平格式，pandas 直接读 |
| `v_stat_year` | 每年电影数量 |
| `v_stat_genre` | 每个类型数量 |
| `v_stat_region` | 各地区平均分 |
| `v_stat_actor` | 演员出演次数排行 |
| `v_top_rated_by_year` | 每年评分最高的电影 |

> 视图是"现算的"，所以永远不会过期、不会重复，也不需要你手动更新。

## 三、关系图

```
movies ─┬─ movie_genres ── genres
        ├─ movie_countries ── countries
        ├─ movie_credits ── persons
        ├─ comments ── users
        ├─ user_ratings ── users
        └─ recommendations ── users
events ── users / movies
model_registry（独立）
```

## 四、常用查询

```sql
-- 每秒电影数
SELECT * FROM v_stat_year;
-- 类型统计
SELECT * FROM v_stat_genre ORDER BY movies_count DESC;
-- 某电影的所有类型（join 而不是拆字符串）
SELECT g.name FROM movie_genres mg JOIN genres g ON g.genre_id = mg.genre_id
 WHERE mg.movie_id = 34780991;
-- 读成 pandas（和读 CSV 一样）
-- pd.read_sql("SELECT * FROM v_movies_flat", engine)
```

## 五、关于你原来的旧表

`schema.sql` **不会**动你之前用 pandas `to_sql` 建的表（`count_by_year`、`average_score_by_region`、`count_by_type`、`rating_vs_comment_count`、`top_rated_movie_by_year`、`top_actors_by_movie_count` 等），需要你手动删。

先看看有哪些表：

```sql
SHOW TABLES;
```

确认没用后删掉（下面按你的旧表名写，多退少补）：

```sql
DROP TABLE IF EXISTS count_by_year;
DROP TABLE IF EXISTS average_score_by_region;
DROP TABLE IF EXISTS count_by_type;
DROP TABLE IF EXISTS rating_vs_comment_count;
DROP TABLE IF EXISTS top_rated_movie_by_year;
DROP TABLE IF EXISTS top_actors_by_movie_count;
```

> 也可以直接 `DROP DATABASE moviesrec; CREATE DATABASE moviesrec ...;` 重建，但**会连数据一起删**，慎用。

## 六、以后别再做的事

- ❌ 不要再用 `df.to_sql` 来**建表**（它不建主键/索引）。表结构只认 `schema.sql`。
- ❌ 不要再把统计结果存成表（用视图）。
