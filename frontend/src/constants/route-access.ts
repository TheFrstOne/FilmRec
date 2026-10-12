import { RouteAccessMap } from "@/types/route-access-map";

/**
 * 中间件的访问控制表。
 *
 * ★ 只管【页面】：认证接口已经全部搬到 FastAPI（backend/auth.py），
 *   Next 这边不再有 /api/auth、/api/users 之类的自有接口，
 *   所以 api 一栏留空——/api/backend/* 和 /api/images/* 都不在表里，
 *   中间件会原样放行，由 FastAPI 自己读 Cookie 做鉴权。
 *
 *   （千万不要把 /api/backend 加进 protected：那会把登录、刷新、
 *     图片代理全部拦死，登录流程直接进死循环。）
 */
export const routeAccess: RouteAccessMap = {
	api: {
		public: [],
		protected: [],
		admin: [],
	},
	page: {
		public: ["/auth/login", "/auth/register"],
		protected: ["/user/dashboard", "/user/profile", "/user/library"],
		admin: ["/admin/dashboard"],
	},
};
