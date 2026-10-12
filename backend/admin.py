"""
FilmRec 管理后台接口：数据概览 + 模型版本管理。仅 role='admin' 可访问。

为什么单独一个文件：管理接口和面向用户的接口关注点不同（统计口径、权限），
拆开后 main.py 只负责挂载，职责清晰。

权限：前端中间件已经拦了 /admin/* 页面，但 /api/backend/* 是原样代理给 FastAPI 的，
所以真正的边界在这里 —— 每个接口都调 _require_admin()。

响应包与其它模块一致：
    成功 {"status":"success","data":...}
    失败 {"status":"fail","errors":[{"field":...,"message":...}]}
"""
from __future__ import annotations

from fastapi import APIRouter, Request

from auth import _fail, _ok, get_current_user
from db import execute, fetch_all, fetch_one

router = APIRouter(prefix="/api/admin")

# 概览趋势看最近多少天
TREND_DAYS = 14


def _require_admin(request: Request):
    """通过返回 (user, None)，不通过返回 (None, 错误响应)。"""
    user = get_current_user(request)
    if not user:
        return None, _fail(401, "请先登录")
    if user["role"] != "admin":
        return None, _fail(403, "需要管理员权限")
    return user, None


def _count(sql: str) -> int:
    row = fetch_one(sql)
    if not row:
        return 0
    return int(list(row.values())[0] or 0)


@router.get("/overview")
def overview(request: Request):
    """后台首页：核心计数、行为分布、曝光点击率(CTR)、热门电影、近两周趋势。"""
    _, err = _require_admin(request)
    if err:
        return err

    counts = {
        "users": _count("SELECT COUNT(*) FROM users"),
        "movies": _count("SELECT COUNT(*) FROM movies"),
        "events": _count("SELECT COUNT(*) FROM events"),
        "ratings": _count("SELECT COUNT(*) FROM user_ratings"),
        "comments": _count("SELECT COUNT(*) FROM comments"),
    }

    by_type = {
        str(r["event_type"]): int(r["c"])
        for r in fetch_all(
            "SELECT event_type, COUNT(*) AS c FROM events GROUP BY event_type"
        )
    }
    impressions = by_type.get("impression", 0)
    clicks = by_type.get("click", 0)
    ctr = round(clicks / impressions, 4) if impressions else 0.0

    top_movies = [
        {
            "movie_id": int(r["movie_id"]),
            "title": r["title"],
            "impressions": int(r["impressions"] or 0),
            "clicks": int(r["clicks"] or 0),
            "events": int(r["events"] or 0),
        }
        for r in fetch_all(
            """
            SELECT e.movie_id,
                   m.title,
                   COUNT(*) AS events,
                   SUM(e.event_type = 'impression') AS impressions,
                   SUM(e.event_type = 'click') AS clicks
              FROM events e
              JOIN movies m ON m.movie_id = e.movie_id
             WHERE e.movie_id IS NOT NULL
             GROUP BY e.movie_id, m.title
             ORDER BY events DESC
             LIMIT 10
            """
        )
    ]

    # 近 TREND_DAYS 天按天聚合，前端画个简单的柱状趋势
    rows = fetch_all(
        f"""
        SELECT DATE(created_at) AS d, event_type, COUNT(*) AS c
          FROM events
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL {TREND_DAYS - 1} DAY)
         GROUP BY d, event_type
         ORDER BY d
        """
    )
    trend_map: dict[str, dict] = {}
    for r in rows:
        day = str(r["d"])
        bucket = trend_map.setdefault(
            day, {"date": day, "impressions": 0, "clicks": 0, "saves": 0}
        )
        c = int(r["c"])
        etype = str(r["event_type"])
        if etype == "impression":
            bucket["impressions"] += c
        elif etype == "click":
            bucket["clicks"] += c
        elif etype in ("favorite", "watch", "rating"):
            bucket["saves"] += c
    trend = [trend_map[k] for k in sorted(trend_map)]

    return _ok(
        {
            "counts": counts,
            "eventsByType": by_type,
            "ctr": ctr,
            "topMovies": top_movies,
            "trend": trend,
        }
    )


@router.get("/models")
def models(request: Request):
    """模型注册表：版本、指标、是否激活。"""
    _, err = _require_admin(request)
    if err:
        return err

    rows = fetch_all(
        """
        SELECT model_version, model_name, artifact_path, data_version,
               metrics, is_active, trained_at
          FROM model_registry
         ORDER BY trained_at DESC
        """
    )
    return _ok(
        [
            {
                "model_version": r["model_version"],
                "model_name": r["model_name"],
                "artifact_path": r["artifact_path"],
                "data_version": r["data_version"],
                "metrics": r["metrics"],
                "is_active": bool(r["is_active"]),
                "trained_at": str(r["trained_at"]) if r["trained_at"] else None,
            }
            for r in rows
        ]
    )


@router.post("/models/{version}/activate")
def activate_model(version: str, request: Request):
    """把某个模型版本设为激活。

    注意：在线 Recommender 是【进程启动时】从 artifacts 目录加载 pkl 的，
    这里只改 model_registry.is_active（离线训练/回滚的真相来源），
    要让正在跑的服务换模型，还需要重启后端。见 DESIGN.md。
    """
    _, err = _require_admin(request)
    if err:
        return err

    if not fetch_one(
        "SELECT 1 FROM model_registry WHERE model_version = :v LIMIT 1", {"v": version}
    ):
        return _fail(404, "模型版本不存在", "version")

    execute(
        "UPDATE model_registry SET is_active = (model_version = :v)", {"v": version}
    )
    return _ok({"active": version, "note": "重启后端后生效"})
