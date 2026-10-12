# FilmRec 前端（Next.js）说明

技术栈：Next.js 15（App Router）+ TypeScript + Tailwind + Redux Toolkit(RTK Query) + next-intl。

## 一、跑起来

```powershell
# 先起后端（认证接口在那边，不启动的话登录注册会失败）
cd D:\Study\FilmRec\backend
.venv\Scripts\activate
python main.py            # http://127.0.0.1:8000

# 再起前端
cd D:\Study\FilmRec\frontend
npm install
npm run dev               # http://localhost:3000
```

访问 `http://localhost:3000` 会自动跳到 `http://localhost:3000/zh`（默认中文）。

> 改了 `.env.local` 必须重启 dev server（环境变量只在启动时读一次）。

## 二、目录

```
src/
├── app/[locale]/          # 页面（[locale] 是语言段，如 /zh/movies）
│   ├── page.tsx           # 首页     → /
│   ├── movies/page.tsx    # 电影库   → /movies
│   ├── recommend/page.tsx # 推荐     → /recommend
│   ├── auth/login|register/page.tsx   # 登录/注册
│   ├── user/dashboard/page.tsx        # 个人中心（需登录）
│   ├── layout.tsx         # 全局布局（导航栏在这里）
│   └── providers.tsx      # Redux / Auth / Users Provider
├── app/api/images/proxy/  # ★ 豆瓣海报代理（防盗链，见第五节）
├── components/            # 公共组件（nav-bar、LanguageSwitcher）
├── features/movies/       # ★ 电影的接口 + 组件（PosterImage）
├── features/users/        # ★ 用户的接口 + 表单 + Provider
├── middleware.ts          # 页面访问守卫（验 JWT）
├── messages/{zh,en}.json  # ★ 文案（所有界面文字都从这里取）
└── i18n/routing.ts        # 支持的语言
```

## 三、数据是怎么来的

前端**不直接连数据库**，所有数据走后端 API：

```
页面 → RTK Query(/api/backend/*) → Next 反向代理 → FastAPI(127.0.0.1:8000) → MySQL
```

接口都定义在 `src/features/movies/api/movies.api.ts`，例如：

| Hook | 实际请求 | 说明 |
|---|---|---|
| `useGetMoviesQuery({page,size,keyword})` | `/api/backend/movies` | 电影列表 |
| `useGetGenreStatsQuery()` | `/api/backend/stats/genres` | 类型统计 |
| `useGetRecommendationsQuery({userId})` | `/api/backend/recommend/1` | 推荐 |

后端地址在 `.env.local` 的 `BACKEND_API_URL`（默认 `http://127.0.0.1:8000`）。

## 四、怎么加一个新页面（照抄套路）

1. **加接口**：在 `features/movies/api/movies.api.ts` 的 `endpoints` 里加一个 `builder.query`。
2. **建页面**：新建 `app/[locale]/你的路由/page.tsx`，首行写 `"use client"`，用上面的 hook：
   ```tsx
   "use client";
   import { useGetMoviesQuery } from "@/features/movies/api/movies.api";
   export default function Page() {
     const { data, isLoading } = useGetMoviesQuery({ page: 1, size: 12 });
     if (isLoading) return <p>加载中…</p>;
     return <div>{data?.items.map((m) => <p key={m.movie_id}>{m.title}</p>)}</div>;
   }
   ```
3. **加文案**：往 `src/messages/zh.json` 和 `en.json` 加一段，用 `useTranslations("Xxx")` 取。
4. **加导航**：在 `components/nav-bar.tsx` 加一个 `<Link href="/你的路由">`。

> 动态路由（详情页）：`app/[locale]/movies/[id]/page.tsx`。

## 五、i18n（多语言）

- 语言列表在 `src/i18n/routing.ts`，当前是 `["zh", "en"]`，默认 `zh`。
- 所有界面文字不要写死，放 `messages/zh.json`。
- 页面里用 `const t = useTranslations("MoviesPage"); t("title")`。
- 切换语言用顶部右上角的 `LanguageSwitcher`。

## 六、登录注册 & 图片（重点）

### 6.1 认证在后端，前端只管界面

```
表单(login-form/register-form)
  → useAuth().loginRequest()
  → RTK Query usersApi（features/users/api/users.api.ts）
  → /api/backend/auth/login
  → Next 反向代理 → FastAPI（backend/auth.py）→ MySQL users 表
```

- 密码由 FastAPI 用 bcrypt 校验，前端不碰密码哈希。
- 登录成功后后端把 JWT 写进 **httpOnly Cookie**（JS 读不到），
  所以 `usersApi` 里必须带 `credentials: "include"`。
- access token 只有 1 分钟；过期后 `usersApi` 会自动调 `/auth/refresh` 重试，用户无感。
- `middleware.ts` 只做**页面**守卫（拿 jose 验 Cookie 里的 JWT）；
  接口鉴权由 FastAPI 自己读 Cookie 完成。
- 前后端共用 JWT 密钥：`frontend/.env.local` 和 `backend/.env` 里的
  `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` **必须一致**。

改文案：`messages/zh.json` 的 `LoginPage` / `RegisterPage` / `AuthToast` / `NavBar`。

### 6.2 电影海报为什么不能直接 `<img src={豆瓣地址}>`

豆瓣图床有防盗链，实测：

| 请求 | 结果 |
|---|---|
| 不带 Referer | 418 |
| Referer = localhost（浏览器自动带的） | 403 |
| Referer = `https://movie.douban.com/` | 200 |

浏览器没法伪造 Referer，所以由**自己的服务器**带 Referer 去取图再转发：

```
<img src="/api/images/proxy?url=<encodeURIComponent(海报URL)>">
        ↓
app/api/images/proxy/route.ts  →  带 Referer 请求豆瓣  →  把图片字节吐回浏览器
```

用现成的组件就行（**不要**自己写 `<img src={movie.poster}>`）：

```tsx
import { PosterImage } from "@/features/movies/components/poster-image";

<PosterImage src={movie.poster} alt={movie.title} className="w-full h-56 object-cover" />
```

没有海报、或取图失败时，它会自动显示灰色 🎬 占位块。

## 七、这次为 FilmRec 改了什么

| 文件 | 改动 |
|---|---|
| `i18n/routing.ts` | 语言改成 `zh/en`，默认中文 |
| `messages/{zh,en}.json` | 中文文案；删掉没用的 `fa.json` |
| `components/nav-bar.tsx` | FilmRec 导航 + 登录/注册/个人中心/退出 |
| `app/[locale]/page.tsx` | 首页改成 FilmRec 落地页 |
| `app/[locale]/recommend/page.tsx` | 推荐页，带海报卡片 |
| `app/[locale]/providers.tsx` | 挂上 UsersProvider（当前登录用户） |
| `features/movies/api/movies.api.ts` | 接口指向 `/api/backend` |
| `app/api/images/proxy/route.ts` | ★ 新增：豆瓣海报代理 |
| `features/movies/components/poster-image.tsx` | ★ 新增：海报组件 |
| `features/users/**` | 认证改为调用 FastAPI；删掉模板的 Mongoose 数据层 |
| `app/api/{auth,users}/**` | ★ 删除：Next 自带的认证路由（已搬到 FastAPI） |
| `middleware.ts` | 修 locale 正则（原来是 `en/fa`，现在是 `en/zh`） |

## 八、遗留（后面再说）

- 登录后没有跳回登录前的页面：`middleware` 已经传了 `?redirect=`，
  但表单目前固定跳 `/user/dashboard`，想用的话在 `login-form.tsx` 里读一下。
- `/admin/dashboard` 页面还是空的，管理员角色（`users.role='admin'`）已经有了，
  但没做「怎么变成管理员」的入口——直接在数据库里改。
