"""
用户行为埋点：把前端的 impression / click / favorite / rating / watch 写进 events 表。

events 是【追加日志】：每次操作都插一行，绝不原地更新。
  - favorite / watch 是开关，add 还是 remove 记在 context.action 里；
    读状态时按「每 (user, movie, type) 取 event_id 最大的那一行」还原（latest wins），
    所以「收藏 → 取消 → 再收藏」跨会话也是对的。
  - rating 除写日志外还 upsert 一张 user_ratings —— 那是推荐算法的标准输入，
    同一 (user, movie) 只留最新分，查询直接用那张表就行。
  - impression / click 允许匿名（user_id 为 NULL），是推荐系统的曝光/点击样本。

响应包与 auth.py 一致：
    成功 {"status":"success","data":...}
    失败 {"status":"fail","errors":[{"field":..., "message":...}]}
"""
from __future__ import annotations

import json
from typing import Literal, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from auth import _fail, _ok, get_current_user_id
from db import execute, fetch_all, fetch_one

router = APIRouter()

EventType = Literal["impression", "click", "favorite", "rating", "watch"]

# 这些事件代表「用户的偏好」，必须知道是谁干的；匿名只放行曝光和点击
AUTH_REQUIRED = {"favorite", "rating", "watch"}


class EventIn(BaseModel):
    movie_id: int = Field(..., ge=1)
    event_type: EventType
    score: Optional[int] = Field(None, ge=1, le=5)  # 仅 rating 用，1-5 星
    context: Optional[dict] = None  # 来源页面 / 位置 / 模型版本等


def _still_on(user_id: int, event_type: str) -> list[int]:
    """开关类事件里当前还处于「开」状态的 movie_id 列表。

    每部电影只取 event_id 最大的那一行（最新动作），
    context.action 不是 "remove" 就算保留 —— 历史行没有 context，默认按保留算。
    """
    rows = fetch_all(
        """
        SELECT e.movie_id AS movie_id
          FROM events e
          JOIN (
                SELECT movie_id, MAX(event_id) AS max_id
                  FROM events
                 WHERE user_id = :u AND event_type = :t AND movie_id IS NOT NULL
                 GROUP BY movie_id
               ) AS latest ON latest.max_id = e.event_id
         WHERE COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.context, '$.action')), 'add') <> 'remove'
        """,
        {"u": user_id, "t": event_type},
    )
    return [int(r["movie_id"]) for r in rows]


@router.post("/api/events")
def record_event(body: EventIn, request: Request):
    """记一条行为。匿名可上报 impression / click，其余要登录。"""
    if not fetch_one(
        "SELECT movie_id FROM movies WHERE movie_id = :m LIMIT 1", {"m": body.movie_id}
    ):
        return _fail(404, "电影不存在", "movie_id")

    user_id = get_current_user_id(request)
    if body.event_type in AUTH_REQUIRED and user_id is None:
        # 故意不 clear_cookies：access 过期但 refresh 还有效时，
        # 前端刷新令牌后重试这把操作就能成功，清掉 Cookie 反而把会话毁了。
        return _fail(401, "请先登录")

    if body.event_type == "rating" and body.score is None:
        return _fail(400, "评分必须带上 score（1-5）", "score")

    execute(
        "INSERT INTO events (user_id, movie_id, event_type, score, context) "
        "VALUES (:u, :m, :t, :s, :c)",
        {
            "u": user_id,
            "m": body.movie_id,
            "t": body.event_type,
            # 只有 rating 的分数有意义，别的类型一律存 NULL，避免污染统计口径
            "s": body.score if body.event_type == "rating" else None,
            "c": json.dumps(body.context, ensure_ascii=False) if body.context else None,
        },
    )

    # 评分是推荐算法的燃料：顺手写进 user_ratings（同一对 user/movie 只留最新分）
    if body.event_type == "rating" and user_id is not None:
        execute(
            "INSERT INTO user_ratings (user_id, movie_id, score) VALUES (:u, :m, :s) "
            "ON DUPLICATE KEY UPDATE score = VALUES(score), rated_at = NOW()",
            {"u": user_id, "m": body.movie_id, "s": body.score},
        )

    return _ok({"movie_id": body.movie_id, "event_type": body.event_type})


@router.get("/api/events/mine")
def my_events(request: Request):
    """当前用户的收藏 / 看过 / 评分，前端用它点亮卡片上的操作条。"""
    user_id = get_current_user_id(request)
    if user_id is None:
        return _fail(401, "请先登录")

    rows = fetch_all(
        "SELECT movie_id, score FROM user_ratings WHERE user_id = :u AND score IS NOT NULL",
        {"u": user_id},
    )

    return _ok(
        {
            "favorites": _still_on(user_id, "favorite"),
            "watched": _still_on(user_id, "watch"),
            "ratings": [
                {"movie_id": int(r["movie_id"]), "score": float(r["score"])} for r in rows
            ],
        }
    )


# 「我的片单」要展示电影信息，这里统一取和 /movies 一致的字段
_LIB_MOVIE_COLS = (
    "m.movie_id, m.title, m.release_year, m.year, m.rating, "
    "m.comment_count, m.poster, m.genres, m.countries"
)


def _library_switches(user_id: int, event_type: str) -> list[dict]:
    """收藏 / 看过：取每部电影最新一条动作，过滤掉已取消的，返回电影详情。"""
    return fetch_all(
        f"""
        SELECT {_LIB_MOVIE_COLS}
          FROM (
                SELECT movie_id, MAX(event_id) AS max_id
                  FROM events
                 WHERE user_id = :u AND event_type = :t AND movie_id IS NOT NULL
                 GROUP BY movie_id
               ) latest
          JOIN events e ON e.event_id = latest.max_id
          JOIN v_movies_flat m ON m.movie_id = e.movie_id
         WHERE COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.context, '$.action')), 'add') <> 'remove'
         ORDER BY e.created_at DESC
        """,
        {"u": user_id, "t": event_type},
    )


@router.get("/api/events/mine/library")
def my_library(request: Request):
    """我的片单：收藏 / 看过 / 评分三部电影都带上电影信息，一次请求拿齐。"""
    user_id = get_current_user_id(request)
    if user_id is None:
        return _fail(401, "请先登录")

    ratings = fetch_all(
        f"""
        SELECT {_LIB_MOVIE_COLS}, r.score, r.rated_at
          FROM user_ratings r
          JOIN v_movies_flat m ON m.movie_id = r.movie_id
         WHERE r.user_id = :u AND r.score IS NOT NULL
         ORDER BY r.rated_at DESC
        """,
        {"u": user_id},
    )

    return _ok(
        {
            "favorites": _library_switches(user_id, "favorite"),
            "watched": _library_switches(user_id, "watch"),
            "ratings": ratings,
        }
    )
