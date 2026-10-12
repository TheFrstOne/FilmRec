"""
FilmRec 在线服务（FastAPI）

启动：
    cd D:\\Study\\FilmRec\\backend
    .venv\\Scripts\\activate
    pip install -r requirements.txt
    python main.py            # 或 uvicorn main:app --reload --port 8000

自测文档：http://127.0.0.1:8000/docs
"""
from __future__ import annotations

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from auth import router as auth_router
from admin import router as admin_router
from db import fetch_all, fetch_one
from events import router as events_router
from recommender import Recommender
from starlette.exceptions import HTTPException as StarletteHTTPException

app = FastAPI(title="FilmRec API", version="2.0")
app.include_router(auth_router)
app.include_router(events_router)
app.include_router(admin_router)

# 走 Next 代理时用不到；直接跨域调用时需要
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ★ 模型只在进程启动时加载一次
recommender = Recommender()


@app.exception_handler(RequestValidationError)
def validation_error_handler(request: Request, exc: RequestValidationError):
    """把 FastAPI/Pydantic 默认的 422 {"detail": [...]} 转成项目统一的错误包，
    这样前端（依赖 {"status":"fail","errors":[...]}）能直接显示提示。"""
    errors = []
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        errors.append({"field": ".".join(loc) or None, "message": err.get("msg", "参数不合法")})
    return JSONResponse({"status": "fail", "errors": errors}, status_code=422)


@app.exception_handler(StarletteHTTPException)
def http_error_handler(request: Request, exc: StarletteHTTPException):
    """把 FastAPI 默认的 {"detail": ...}（如请求体不是合法 JSON）也转成统一错误包。"""
    message = exc.detail if isinstance(exc.detail, str) else "请求处理失败"
    return JSONResponse(
        {"status": "fail", "errors": [{"field": None, "message": message}]},
        status_code=exc.status_code,
        headers=getattr(exc, "headers", None),
    )


def ok(data):
    return {"status": "success", "data": data}


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_ready": recommender.ready,
        "model_version": recommender.version,
    }


@app.get("/api/tables")
def tables():
    rows = fetch_all("SHOW TABLES")
    return ok([list(r.values())[0] for r in rows])


@app.get("/api/movies")
def movies(
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=100),
    keyword: str = "",
):
    offset = (page - 1) * size
    where, params = "", {}
    if keyword:
        where = "WHERE title LIKE :kw"
        params["kw"] = f"%{keyword}%"

    total = fetch_one(f"SELECT COUNT(*) AS c FROM movies {where}", params)["c"]
    # v_movies_flat 里 year 和 release_year 是同一列的别名（兼容前后端两种叫法）
    # poster 就是 movies.poster_url，前端用它走图片代理加载豆瓣海报
    items = fetch_all(
        f"SELECT movie_id, title, release_year, year, countries, genres, rating, comment_count, poster "
        f"FROM v_movies_flat {where} ORDER BY rating DESC LIMIT :size OFFSET :offset",
        {**params, "size": size, "offset": offset},
    )
    return ok({"total": total, "page": page, "size": size, "items": items})


@app.get("/api/stats/genres")
def stats_genres():
    return ok(fetch_all("SELECT genre, movies_count AS count FROM v_stat_genre ORDER BY movies_count DESC"))


@app.get("/api/stats/years")
def stats_years():
    return ok(fetch_all("SELECT year, movies_count AS count FROM v_stat_year ORDER BY year"))


@app.get("/api/movies/{movie_id}")
def movie_detail(movie_id: int):
    row = fetch_one("SELECT * FROM v_movies_flat WHERE movie_id=:id", {"id": movie_id})
    if not row:
        return {"status": "fail", "errors": [{"message": "movie not found"}]}
    return ok(row)


@app.get("/api/movies/{movie_id}/similar")
def similar_movies(movie_id: int, top_n: int = Query(10, ge=1, le=50)):
    """内容相似度：给一部电影，找相似的。"""
    return ok(recommender.similar_movies(movie_id, top_n))


@app.get("/api/recommend/{user_id}")
def recommend(user_id: int, top_n: int = Query(10, ge=1, le=50)):
    """
    给用户推荐。内部自动处理：
      老用户 -> 实时内容推荐；新用户 -> 热度兜底（冷启动）
    生产环境老用户应先查 recommendations 批算表（见 DESIGN.md）。
    """
    return ok(recommender.recommend_for_user(user_id, top_n))


@app.get("/api/recommend")
def recommend_guest(top_n: int = Query(10, ge=1, le=50)):
    """访客（未登录）的热度榜，不需要用户身份。"""
    return ok(recommender.popular(top_n))

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
