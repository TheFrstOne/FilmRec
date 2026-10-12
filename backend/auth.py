"""
FilmRec 认证模块：注册 / 登录 / 刷新 / 登出 / 当前用户。

设计要点：
  - 用户存 MySQL（users 表），密码存 bcrypt 哈希，登录身份是 email（唯一、大小写不敏感）
  - 签发的 JWT 与前端 Next 中间件共用密钥：Next 用 jose 验签做「页面守卫」，
    真正的 API 鉴权由本模块读 Cookie 完成
  - access token 很短（默认 1 分钟），refresh token 7 天且【一次一换】：
    每次刷新把旧 jti 写进 refresh_tokens 黑名单，重放旧 token 会被拒
  - 响应包和 FastAPI 其它接口保持一致：
      成功 {"status":"success","data":...}
      失败 {"status":"fail","errors":[{"field":..., "message":...}]}
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from db import execute, fetch_one

# 显式按文件位置加载 backend/.env，避免「从别的目录启动」时读不到密钥
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

router = APIRouter()

# ---------------------------------------------------------------- 配置

ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "1"))
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "7"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

ACCESS_COOKIE = "accessToken"
REFRESH_COOKIE = "refreshToken"

# 和 frontend/.env.local 里的值保持一致（HS256 对称密钥）
JWT_ACCESS_SECRET = os.getenv("JWT_ACCESS_SECRET", "dev_access_secret_change_me")
JWT_REFRESH_SECRET = os.getenv("JWT_REFRESH_SECRET", "dev_refresh_secret_change_me")
JWT_ALGORITHM = "HS256"

# 前端 zod 用同一个规则，这里做服务端兜底校验
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


# ---------------------------------------------------------------- 请求模型

class RegisterIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    email: str = Field(..., pattern=EMAIL_PATTERN, max_length=255)
    # 上限 64 字符：bcrypt 只取前 72 字节，限制长度避免「密码后半段无效」的困惑
    password: str = Field(..., min_length=6, max_length=64)


class LoginIn(BaseModel):
    email: str = Field(..., pattern=EMAIL_PATTERN, max_length=255)
    password: str = Field(..., min_length=6, max_length=64)


# ---------------------------------------------------------------- 响应 / 令牌工具

def _ok(data: dict) -> JSONResponse:
    # 用 jsonable_encoder 统一处理 Decimal / datetime 等类型：
    # 直接 JSONResponse 会绕过 FastAPI 的编码器，返回带 DECIMAL 的查询结果
    # （如 movies.rating）时会在 json.dumps 处 500。
    return JSONResponse(jsonable_encoder({"status": "success", "data": data}))


def _fail(
    status_code: int, message: str, field: Optional[str] = None, clear_cookies: bool = False
) -> JSONResponse:
    """失败响应。

    注意：Cookie 必须设在【返回的】Response 上——FastAPI 注入的 response 参数
    在直接 return Response 时会被丢弃。
    """
    resp = JSONResponse(
        {"status": "fail", "errors": [{"field": field, "message": message}]},
        status_code=status_code,
    )
    if clear_cookies:
        _clear_auth_cookies(resp)
    return resp


def _public_user(row: dict) -> dict:
    """给前端的用户对象：不含 password_hash，id 用字符串（与 JWT 的 sub 一致）。"""
    return {
        "id": str(row["user_id"]),
        "name": row["user_name"] or "",
        "email": row["email"],
        "role": row["role"],
    }


def _sign_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),  # JWT 规范要求 sub 是字符串
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_ACCESS_SECRET, algorithm=JWT_ALGORITHM)


def _sign_refresh_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        # 前端中间件在 access token 过期时会退回 refresh token 做页面守卫，
        # 那里也需要 role，所以一并签进去（续期时后端仍以数据库为准重新读 role）
        "role": role,
        "jti": str(uuid.uuid4()),  # 用于黑名单追踪
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=REFRESH_TOKEN_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_REFRESH_SECRET, algorithm=JWT_ALGORITHM)


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=ACCESS_TOKEN_MINUTES * 60,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=REFRESH_TOKEN_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")


def _is_blacklisted(jti: str) -> bool:
    row = fetch_one("SELECT 1 AS x FROM refresh_tokens WHERE jti = :jti LIMIT 1", {"jti": jti})
    return row is not None


def _blacklist(jti: str, user_id: int, expires_at: int) -> None:
    """把用过的 refresh token 拉黑；顺手清理已过期行（替代 MongoDB 的 TTL 索引）。"""
    execute("DELETE FROM refresh_tokens WHERE expires_at < UNIX_TIMESTAMP()")
    execute(
        "INSERT IGNORE INTO refresh_tokens (jti, user_id, expires_at) VALUES (:jti, :uid, :exp)",
        {"jti": jti, "uid": user_id, "exp": expires_at},
    )


def _verify(token: Optional[str], secret: str) -> Optional[dict]:
    if not token:
        return None
    try:
        return jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def get_current_user_id(request: Request) -> Optional[int]:
    """从 accessToken Cookie 解出 user_id；未登录 / 过期 / 载荷异常 -> None。

    给别的模块（如 events.py）复用：不抛异常、不返回 401，由调用方决定
    「必须登录」还是「登录了就用、没登录也放行」。
    """
    payload = _verify(request.cookies.get(ACCESS_COOKIE), JWT_ACCESS_SECRET)
    if not payload:
        return None
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None


def get_current_user(request: Request) -> Optional[dict]:
    """从 accessToken Cookie 解出 {id, role}；未登录 / 过期 -> None。

    给需要区分角色的模块（如 admin.py）复用。role 直接取自 JWT 载荷——
    令牌是我们自己签的，且 admin 接口另有数据库侧校验兜底。
    """
    payload = _verify(request.cookies.get(ACCESS_COOKIE), JWT_ACCESS_SECRET)
    if not payload:
        return None
    try:
        return {"id": int(payload["sub"]), "role": payload.get("role", "user")}
    except (KeyError, TypeError, ValueError):
        return None


# ---------------------------------------------------------------- 接口

def _ok_with_tokens(data: dict, user_id: int, role: str) -> JSONResponse:
    """成功响应 + 写新的 access/refresh Cookie。"""
    resp = _ok(data)
    _set_auth_cookies(
        resp, _sign_access_token(user_id, role), _sign_refresh_token(user_id, role)
    )
    return resp


@router.post("/api/auth/register")
def register(body: RegisterIn):
    """注册：建用户 + 直接登录（写好 Cookie，前端无需再登一次）。"""
    email = body.email.strip().lower()
    name = body.name.strip()

    if fetch_one("SELECT user_id FROM users WHERE email = :e LIMIT 1", {"e": email}):
        return _fail(400, "该邮箱已被注册", "email")

    password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt(rounds=10))

    try:
        result = execute(
            "INSERT INTO users (user_name, email, password_hash) VALUES (:name, :email, :pw)",
            {"name": name, "email": email, "pw": password_hash.decode("utf-8")},
        )
    except Exception as exc:  # 并发注册同一邮箱会撞唯一索引（1062）
        if "1062" in str(exc) or "Duplicate" in str(exc):
            return _fail(400, "该邮箱已被注册", "email")
        raise

    user = {"user_id": result["lastrowid"], "user_name": name, "email": email, "role": "user"}
    return _ok_with_tokens({"user": _public_user(user)}, user["user_id"], user["role"])


@router.post("/api/auth/login")
def login(body: LoginIn):
    email = body.email.strip().lower()
    row = fetch_one(
        "SELECT user_id, user_name, email, password_hash, role FROM users WHERE email = :e LIMIT 1",
        {"e": email},
    )

    # 用户不存在 / 密码错误 → 同一个提示，不泄露邮箱是否注册过
    if not row or not bcrypt.checkpw(
        body.password.encode("utf-8"), row["password_hash"].encode("utf-8")
    ):
        return _fail(401, "邮箱或密码错误")

    return _ok_with_tokens({"user": _public_user(row)}, row["user_id"], row["role"])


@router.post("/api/auth/refresh")
def refresh(request: Request):
    """刷新令牌轮换：验旧 refresh → 拉黑它的 jti → 发新的 access + refresh。"""
    payload = _verify(request.cookies.get(REFRESH_COOKIE), JWT_REFRESH_SECRET)
    jti = (payload or {}).get("jti")
    if not payload or not jti:
        return _fail(401, "刷新令牌无效或已过期", clear_cookies=True)

    if _is_blacklisted(jti):
        return _fail(401, "刷新令牌已被使用，请重新登录", clear_cookies=True)

    user_id = int(payload["sub"])
    row = fetch_one(
        "SELECT user_id, user_name, email, role FROM users WHERE user_id = :u LIMIT 1",
        {"u": user_id},
    )
    if not row:
        return _fail(401, "用户不存在", clear_cookies=True)

    _blacklist(jti, user_id, int(payload.get("exp") or 0))

    return _ok_with_tokens({"user": _public_user(row)}, user_id, row["role"])


@router.post("/api/auth/logout")
def logout():
    resp = _ok({"message": "已退出登录"})
    _clear_auth_cookies(resp)
    return resp

@router.get("/api/users/currentuser")
def current_user(request: Request):
    """当前登录用户。access token 过期返回 401，前端会自动走 refresh 重试。"""
    payload = _verify(request.cookies.get(ACCESS_COOKIE), JWT_ACCESS_SECRET)
    if not payload:
        return _fail(401, "未登录或登录已过期")

    row = fetch_one(
        "SELECT user_id, user_name, email, role FROM users WHERE user_id = :u LIMIT 1",
        {"u": int(payload["sub"])},
    )
    if not row:
        return _fail(404, "用户不存在")

    return _ok({"user": _public_user(row)})
