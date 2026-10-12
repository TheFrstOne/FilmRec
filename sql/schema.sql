-- =============================================================
--  FilmRec 电影推荐系统  最终表结构（MySQL 8.x / InnoDB / utf8mb4）
--  本文件是唯一的 DDL 来源；recsys_tables.sql 已并入，可删除。
--
--  设计原则：
--   1) 电影/类型/地区/人物/用户 都是实体，各建一张表
--   2) "剧情|喜剧|动画" 一格多值 → 拆成关联表（多对多）
--   3) 正确数据类型；避开 MySQL 关键字 year/rank/comment
--   4) 索引只建在"查询会用到"的列上
--   5) 统计类数据（每年数量/类型数量…）一律做成【视图】，不再存表
--   6) 表结构由本文件定义 → 不要再用 df.to_sql 建表（它不建索引/主键）
-- =============================================================

SET NAMES utf8mb4;

DROP VIEW  IF EXISTS v_movies_flat, v_stat_year, v_stat_genre, v_stat_region,
                        v_stat_actor, v_top_rated_by_year;
DROP TABLE IF EXISTS movie_embeddings;
DROP TABLE IF EXISTS recommendations;
DROP TABLE IF EXISTS model_registry;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS user_ratings;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS movie_credits;
DROP TABLE IF EXISTS movie_genres;
DROP TABLE IF EXISTS movie_countries;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS persons;
DROP TABLE IF EXISTS genres;
DROP TABLE IF EXISTS countries;
DROP TABLE IF EXISTS movies;


-- =============================================================
--  A. 实体表
-- =============================================================

-- A1. 电影主表：一部电影一行，只放"电影自己"的属性
CREATE TABLE movies (
  movie_id      BIGINT UNSIGNED NOT NULL           COMMENT '豆瓣 movie_id',
  title         VARCHAR(255)    NOT NULL,
  release_year  SMALLINT        NULL               COMMENT '原 year',
  rating        DECIMAL(3,1)    NULL,
  star_count    DECIMAL(3,1)    NULL,
  comment_count INT UNSIGNED    NULL,
  poster_url    VARCHAR(512)    NULL,
  hot_rank      INT             NULL               COMMENT '原 rank',
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (movie_id),
  KEY idx_movies_year_rating (release_year, rating),  -- 每年最高分/每年数量
  KEY idx_movies_popular     (rating, comment_count)  -- 热度榜兜底
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='电影主表';

-- A2. 类型字典 + 关联
CREATE TABLE genres (
  genre_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name     VARCHAR(50)       NOT NULL,
  PRIMARY KEY (genre_id),
  UNIQUE KEY uk_genres_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='类型字典';

CREATE TABLE movie_genres (
  movie_id BIGINT UNSIGNED   NOT NULL,
  genre_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (movie_id, genre_id),
  KEY idx_mg_genre (genre_id),
  CONSTRAINT fk_mg_movie FOREIGN KEY (movie_id) REFERENCES movies(movie_id) ON DELETE CASCADE,
  CONSTRAINT fk_mg_genre FOREIGN KEY (genre_id) REFERENCES genres(genre_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='电影-类型';

-- A3. 地区字典 + 关联
CREATE TABLE countries (
  country_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50)       NOT NULL,
  PRIMARY KEY (country_id),
  UNIQUE KEY uk_countries_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地区字典';

CREATE TABLE movie_countries (
  movie_id   BIGINT UNSIGNED   NOT NULL,
  country_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (movie_id, country_id),
  KEY idx_mc_country (country_id),
  CONSTRAINT fk_mc_movie   FOREIGN KEY (movie_id)   REFERENCES movies(movie_id)   ON DELETE CASCADE,
  CONSTRAINT fk_mc_country FOREIGN KEY (country_id) REFERENCES countries(country_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='电影-地区';

-- A4. 人物（导演/演员共用）+ 关联
CREATE TABLE persons (
  person_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name      VARCHAR(100) NOT NULL,
  PRIMARY KEY (person_id),
  UNIQUE KEY uk_persons_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='人物字典';

CREATE TABLE movie_credits (
  movie_id  BIGINT UNSIGNED NOT NULL,
  person_id INT UNSIGNED    NOT NULL,
  role      ENUM('director','actor') NOT NULL,
  ord       SMALLINT        NULL COMMENT '片内排序（主演顺序）',
  PRIMARY KEY (movie_id, person_id, role),
  KEY idx_credits_person_role (person_id, role),
  CONSTRAINT fk_credits_movie  FOREIGN KEY (movie_id)  REFERENCES movies(movie_id)   ON DELETE CASCADE,
  CONSTRAINT fk_credits_person FOREIGN KEY (person_id) REFERENCES persons(person_id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='电影-人物（导演+演员）';

-- A5. 用户 / 评论 / 评分
-- 登录凭据由 FastAPI 认证模块维护（backend/auth.py）：
--   密码存 bcrypt 哈希，认证身份是 email（大小写不敏感），user_name 仅作展示、允许重名
CREATE TABLE users (
  user_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_name     VARCHAR(100) NULL               COMMENT '昵称（可重复）',
  email         VARCHAR(255) NOT NULL           COMMENT '登录邮箱（唯一）',
  password_hash VARCHAR(255) NOT NULL           COMMENT 'bcrypt 哈希',
  role          ENUM('admin','user') NOT NULL DEFAULT 'user',
  avatar_url    VARCHAR(512) NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户';

-- 刷新令牌轮换黑名单（替代已废弃的 MongoDB TTL 集合）
-- 每次刷新都把旧 jti 写进来，重放旧 refresh token 会被拒
CREATE TABLE refresh_tokens (
  jti        VARCHAR(36)     NOT NULL COMMENT 'JWT ID (uuid4)',
  user_id    INT UNSIGNED    NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL COMMENT 'unix 秒，过期即可删除',
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (jti),
  KEY idx_rt_user (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='刷新令牌轮换黑名单';

CREATE TABLE comments (
  comment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movie_id   BIGINT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED    NULL,
  content    TEXT            NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id),
  KEY idx_comments_movie (movie_id),
  CONSTRAINT fk_comments_movie FOREIGN KEY (movie_id) REFERENCES movies(movie_id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user  FOREIGN KEY (user_id)  REFERENCES users(user_id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='电影评论';

-- ★ 推荐系统的燃料：用户-电影评分（协同过滤最小数据集）
CREATE TABLE user_ratings (
  user_id  INT UNSIGNED    NOT NULL,
  movie_id BIGINT UNSIGNED NOT NULL,
  score    DECIMAL(3,1)    NULL,
  rated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, movie_id),
  KEY idx_ur_movie (movie_id),
  CONSTRAINT fk_ur_user  FOREIGN KEY (user_id)  REFERENCES users(user_id)  ON DELETE CASCADE,
  CONSTRAINT fk_ur_movie FOREIGN KEY (movie_id) REFERENCES movies(movie_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-电影评分';


-- =============================================================
--  B. 推荐系统运行表
-- =============================================================

-- B1. 行为日志（前端埋点写这里，离线训练读这里）
CREATE TABLE events (
  event_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED    NULL,
  movie_id   BIGINT UNSIGNED NULL,
  event_type ENUM('impression','click','favorite','rating','watch') NOT NULL,
  score      DECIMAL(3,1)    NULL,
  context    JSON            NULL COMMENT '来源/位置/模型版本',
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_events_user_time (user_id, created_at),
  KEY idx_events_movie     (movie_id, event_type),
  KEY idx_events_type_time (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='用户行为日志（数据量大后按月分区）'
  /* 数据量大后启用：
  PARTITION BY RANGE (UNIX_TIMESTAMP(created_at)) (
    PARTITION p2026_01 VALUES LESS THAN (UNIX_TIMESTAMP('2026-02-01')),
    PARTITION p2026_02 VALUES LESS THAN (UNIX_TIMESTAMP('2026-03-01'))
  ) */;

-- B2. 离线批算的 Top-N 推荐结果（在线只查这张表）
CREATE TABLE recommendations (
  user_id       INT UNSIGNED    NOT NULL,
  movie_id      BIGINT UNSIGNED NOT NULL,
  rank_no       SMALLINT        NOT NULL,
  score         DECIMAL(8,5)    NOT NULL,
  model_version VARCHAR(64)     NOT NULL,
  reason        VARCHAR(64)     NULL COMMENT 'popular/genre/cf...',
  generated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, movie_id, model_version),
  KEY idx_rec_lookup (user_id, model_version, rank_no),
  KEY idx_rec_movie  (movie_id),
  CONSTRAINT fk_rec_user  FOREIGN KEY (user_id)  REFERENCES users(user_id)  ON DELETE CASCADE,
  CONSTRAINT fk_rec_movie FOREIGN KEY (movie_id) REFERENCES movies(movie_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='离线批算推荐结果';

-- B3. 模型注册表（版本 + 指标 + 激活状态，支持回滚）
CREATE TABLE model_registry (
  model_version VARCHAR(64)  NOT NULL,
  model_name    VARCHAR(64)  NOT NULL,
  artifact_path VARCHAR(512) NOT NULL,
  data_version  VARCHAR(128) NULL,
  metrics       JSON         NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 0,
  trained_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (model_version),
  KEY idx_reg_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型版本注册表';

-- B4. 电影向量（Faiss/Milvus 召回用；float32 存 BLOB）
CREATE TABLE movie_embeddings (
  movie_id      BIGINT UNSIGNED   NOT NULL,
  model_version VARCHAR(64)       NOT NULL,
  dim           SMALLINT UNSIGNED NOT NULL,
  vector        BLOB              NOT NULL,
  created_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (movie_id, model_version),
  CONSTRAINT fk_emb_movie FOREIGN KEY (movie_id) REFERENCES movies(movie_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='电影向量';


-- =============================================================
--  C. 视图（替代原来的 count_by_year 等派生表：永不过期、不重复）
-- =============================================================

-- C1. 扁平视图：拼回 CSV 的样子，让现有 pandas 代码零改动
CREATE VIEW v_movies_flat AS
SELECT
  m.movie_id,
  m.title,
  m.release_year                                             AS release_year,
  m.release_year                                             AS year,   -- 兼容 CSV 列名
  m.rating,
  m.star_count,
  m.comment_count,
  m.poster_url                                               AS poster,
  m.hot_rank                                                 AS `rank`,
  (SELECT GROUP_CONCAT(g.name ORDER BY g.genre_id SEPARATOR '|')
     FROM movie_genres mg JOIN genres g ON g.genre_id = mg.genre_id
    WHERE mg.movie_id = m.movie_id)                          AS genres,
  (SELECT GROUP_CONCAT(c.name ORDER BY c.country_id SEPARATOR '|')
     FROM movie_countries mc JOIN countries c ON c.country_id = mc.country_id
    WHERE mc.movie_id = m.movie_id)                          AS countries,
  (SELECT GROUP_CONCAT(p.name ORDER BY cr.ord SEPARATOR '|')
     FROM movie_credits cr JOIN persons p ON p.person_id = cr.person_id
    WHERE cr.movie_id = m.movie_id AND cr.role = 'director') AS directors,
  (SELECT GROUP_CONCAT(p.name ORDER BY cr.ord SEPARATOR '|')
     FROM movie_credits cr JOIN persons p ON p.person_id = cr.person_id
    WHERE cr.movie_id = m.movie_id AND cr.role = 'actor')    AS actors
FROM movies m;

-- C2. 统计视图（对应你 data_analysis.py 里那几个函数）
CREATE VIEW v_stat_year AS
SELECT release_year AS year, COUNT(*) AS movies_count
  FROM movies WHERE release_year IS NOT NULL
 GROUP BY release_year;

CREATE VIEW v_stat_genre AS
SELECT g.name AS genre, COUNT(*) AS movies_count
  FROM movie_genres mg JOIN genres g ON g.genre_id = mg.genre_id
 GROUP BY g.name;

CREATE VIEW v_stat_region AS
SELECT c.name AS countries, ROUND(AVG(m.rating), 2) AS average_score
  FROM movie_countries mc
  JOIN movies m    ON m.movie_id = mc.movie_id
  JOIN countries c ON c.country_id = mc.country_id
 GROUP BY c.name;

CREATE VIEW v_stat_actor AS
SELECT p.name AS actor, COUNT(*) AS movie_count
  FROM movie_credits cr JOIN persons p ON p.person_id = cr.person_id
 WHERE cr.role = 'actor'
 GROUP BY p.name;

CREATE VIEW v_top_rated_by_year AS
SELECT m.release_year AS year, m.movie_id, m.title, m.rating, m.comment_count
  FROM movies m
  JOIN (SELECT release_year, MAX(rating) AS mx
          FROM movies GROUP BY release_year) t
    ON t.release_year = m.release_year AND t.mx = m.rating;


-- =============================================================
-- D. 在线服务常用查询示例
-- =============================================================
-- 老用户推荐：SELECT r.rank_no, m.title, r.score FROM recommendations r
--   JOIN movies m ON m.movie_id=r.movie_id
--  WHERE r.user_id=? AND r.model_version=? ORDER BY r.rank_no LIMIT 10;
-- 当前激活模型：SELECT * FROM model_registry WHERE is_active=1;
