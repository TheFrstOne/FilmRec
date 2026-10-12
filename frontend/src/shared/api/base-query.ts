import type { BaseQueryApi } from "@reduxjs/toolkit/query";
import {
	BaseQueryFn,
	FetchArgs,
	FetchBaseQueryError,
	fetchBaseQuery,
} from "@reduxjs/toolkit/query/react";

/**
 * 所有业务 API 共用的 baseQuery。
 *
 * baseUrl = "/api/backend"
 * -> 浏览器请求 /api/backend/movies
 * -> next.config.ts 的 rewrites 转发到 FastAPI 的 http://127.0.0.1:8000/api/movies
 *
 * 认证逻辑全在后端（backend/auth.py），前端只负责调用：
 * 令牌写在 httpOnly Cookie 里，JS 读不到，所以必须带 credentials: "include"。
 */
const baseQuery = fetchBaseQuery({
	baseUrl: "/api/backend",
	credentials: "include",
	prepareHeaders: (headers) => {
		headers.set("Content-Type", "application/json");
		return headers;
	},
});

/**
 * 单飞刷新（single-flight）。
 *
 * access token 只有 1 分钟寿命，页面一加载往往有好几个请求同时发现它过期。
 * 如果每个请求都各自去 /auth/refresh，refresh token 的「一次一换」机制会让
 * 后到的请求拿着已被拉黑的 jti 被拒，表现为随机几个模块「加载失败」。
 *
 * 这里保证同一时刻只有一个刷新在飞，其余请求复用同一个 Promise。
 * 该模块只在浏览器里被调用（RTK Query 查询都在客户端副作用里跑），
 * 所以这个模块级变量等价于「每个标签页一个」。
 */
let refreshPromise: Promise<void> | null = null;

// fetchBaseQuery 期望的 extraOptions 类型（用 Parameters 推导，避免手写 {}）
type BaseQueryExtraOptions = Parameters<typeof baseQuery>[2];

function refreshAccessToken(
	api: BaseQueryApi,
	extraOptions: BaseQueryExtraOptions,
): Promise<void> {
	if (!refreshPromise) {
		refreshPromise = (async () => {
			const result = await baseQuery(
				{ url: "/auth/refresh", method: "POST" },
				api,
				extraOptions,
			);
			if (result.error) throw result.error;
		})().finally(() => {
			// 无论成功失败都要清掉，否则失败后永远不会再尝试刷新
			refreshPromise = null;
		});
	}
	return refreshPromise;
}

/**
 * 401 时自动用 refreshToken 换新的 accessToken 再重试一次。
 *
 * 刷新也失败（refresh 过期 / 被重放拉黑）就原样把 401 抛给调用方，
 * 由它决定是跳登录页还是静默丢弃（比如埋点）。
 */
export const baseQueryWithAuth: BaseQueryFn<
	string | FetchArgs,
	unknown,
	FetchBaseQueryError
> = async (args, api, extraOptions) => {
	let result = await baseQuery(args, api, extraOptions);

	// 认证接口自身不走重试，否则 refresh 失败会无限递归
	const url = typeof args === "string" ? args : args.url;
	const isAuthEndpoint = url.includes("/auth/");

	if (result.error && result.error.status === 401 && !isAuthEndpoint) {
		try {
			await refreshAccessToken(api, extraOptions);
			result = await baseQuery(args, api, extraOptions);
		} catch {
			// 刷新失败：把原始 401 交给调用方。
			// 这里【不能】全局跳登录页 —— 匿名用户访问首页时 getCurrentUser
			// 本来就会 401 + 刷新失败，全局跳转会把游客也强制送去登录。
			// 页面级的登录跳转由 middleware 负责。
		}
	}

	return result;
};
