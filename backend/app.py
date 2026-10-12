"""
Flask 后端：只负责「查 MySQL -> 返回 JSON」，完全不碰前端渲染。
Next.js 通过 /api/py/* 反代到这里（见 next.config.ts）。

启动：
    cd D:\\Study\\FilmRec\\backend
    python -m venv .venv
    .venv\\Scripts\\activate
    pip install -r requirements.txt
    python app.py
默认监听 http://127.0.0.1:5000
"""
import os

from sql.db_manager import MySQLManager
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymysql.cursors import DictCursor

load_dotenv()

app = Flask(__name__)
# 走 Next 代理时其实用不到 CORS；加上是为了你直接 curl / 或用别的前端调时也不报错
CORS(app, supports_credentials=True)

# 你的电影主表名，先用 /api/tables 查出来，再改这里或改 .env
MOVIES_TABLE = os.getenv("MOVIES_TABLE", "movies")


def get_conn():
    pass



def query_all(sql: str, params=None):
    pass


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/tables")
def tables():
    """列出 moviesrec 库里所有表名，方便确认主表叫什么。"""
    pass


@app.get("/api/movies")
def movies():
    """分页 + 按标题搜索。对应前端 /api/py/movies"""
    page = max(int(request.args.get("page", 1)), 1)
    size = min(int(request.args.get("size", 12)), 100)
    keyword = request.args.get("keyword", "").strip()
    offset = (page - 1) * size

    where, params = "", []
    if keyword:
        where = "WHERE title LIKE %s"
        params.append(f"%{keyword}%")

    total = query_all(f"SELECT COUNT(*) AS c FROM {MOVIES_TABLE} {where}", params)[0]["c"]
    rows = query_all(
        f"SELECT * FROM {MOVIES_TABLE} {where} ORDER BY rating DESC LIMIT %s OFFSET %s",
        params + [size, offset],
    )
    return jsonify(
        {
            "status": "success",
            "data": {"total": total, "page": page, "size": size, "items": rows},
        }
    )


@app.get("/api/stats/genres")
def stats_genres():
    """
    统计每个类型的电影数量。
    genres 是 "剧情|喜剧|动画|奇幻" 这种一格多值，所以拆开再计数。
    这里用 Python 拆（和你 pandas 里的 explode 是一个思路）。
    """
    rows = query_all(
        f"SELECT genres FROM {MOVIES_TABLE} WHERE genres IS NOT NULL AND genres <> ''"
    )
    counter: dict[str, int] = {}
    for r in rows:
        for g in str(r["genres"]).split("|"):
            g = g.strip()
            if g:
                counter[g] = counter.get(g, 0) + 1
    data = sorted(
        ({"genre": k, "count": v} for k, v in counter.items()),
        key=lambda x: -x["count"],
    )
    return jsonify({"status": "success", "data": data})


@app.get("/api/stats/years")
def stats_years():
    """每年电影数量（对应你之前 pandas 的 count_by_year）。"""
    rows = query_all(
        f"SELECT year, COUNT(*) AS count FROM {MOVIES_TABLE} "
        "WHERE year IS NOT NULL GROUP BY year ORDER BY year"
    )
    return jsonify({"status": "success", "data": rows})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
