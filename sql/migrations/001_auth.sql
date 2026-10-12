-- =============================================================
--  FilmRec 迁移 001：给 users 表加登录凭据 + 刷新令牌黑名单
--
--  背景：原来的 users 表只存推荐系统需要的昵称/头像，没有邮箱密码。
--        认证从 Next.js(模板 Mongoose) 挪到 FastAPI 后，需要在这里存凭据。
--
--  执行一次（mysql 客户端不在 PATH 时用绝对路径）：
--    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" \
--        -u filmRec -p12344321 moviesrec < sql/migrations/001_auth.sql
--
--  注：schema.sql 已同步更新（新建库时不需要跑本文件）。
-- =============================================================

-- 1) 先加可空列，保证即使表里已有旧数据也能执行成功
ALTER TABLE users
  ADD COLUMN email         VARCHAR(255) NULL COMMENT '登录邮箱（唯一）' AFTER user_name,
  ADD COLUMN password_hash VARCHAR(255) NULL COMMENT 'bcrypt 哈希'      AFTER email,
  ADD COLUMN role          ENUM('admin','user') NOT NULL DEFAULT 'user' AFTER password_hash;

-- 2) 防御性回填：老行（预期没有）给一个占位邮箱和不可用密码
UPDATE users
   SET email         = CONCAT('legacy_', user_id, '@filmrec.local'),
       password_hash = '!'
 WHERE email IS NULL;

-- 3) 收紧约束
--    ★ 必须删掉 uk_users_name：昵称是展示用数据，允许重名；
--      唯一身份改为 email（utf8mb4_unicode_ci 排序规则天然大小写不敏感）
ALTER TABLE users
  MODIFY email         VARCHAR(255) NOT NULL COMMENT '登录邮箱（唯一）',
  MODIFY password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt 哈希',
  ADD UNIQUE KEY uk_users_email (email),
  DROP KEY uk_users_name;

-- 4) 刷新令牌轮换黑名单（替代模板里的 MongoDB TTL 集合）
--    expires_at 存 unix 秒（即 JWT 的 exp），避免 TIMESTAMP 时区/2038 问题
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti        VARCHAR(36)     NOT NULL COMMENT 'JWT ID (uuid4)',
  user_id    INT UNSIGNED    NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL COMMENT 'unix 秒，过期即可删除',
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (jti),
  KEY idx_rt_user (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='刷新令牌轮换黑名单';
