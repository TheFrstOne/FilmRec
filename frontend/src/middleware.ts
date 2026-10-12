import { routeAccess } from "@/constants/route-access";
import { verifyToken } from "@/shared/auth/auth";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { AccessLevel } from "./types/access-level";

// Create the internationalization middleware
const intlMiddleware = createMiddleware(routing);

// Check if pathname starts with any of the given prefixes
function matchesPrefix(pathname: string, prefixes: string[]) {
	return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function getRouteAccessLevel(pathname: string, type: "api" | "page"): AccessLevel | null {
	for (const level of ["public", "protected", "admin"] as AccessLevel[]) {
		if (matchesPrefix(pathname, routeAccess[type][level])) {
			return level;
		}
	}
	return null;
}

// Middleware entry point
export async function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	// Handle API routes (no i18n)
	if (pathname.startsWith("/api")) {
		return await handleApiAuth(req);
	}

	// Handle page routes (i18n-aware)
	return await handlePageAuth(req);
}

// API Auth Logic
async function handleApiAuth(req: NextRequest) {
	const { pathname } = req.nextUrl;

	const accessLevel = getRouteAccessLevel(pathname, "api");

	if (accessLevel === "public" || accessLevel === null) {
		return NextResponse.next();
	}

	const token = req.cookies.get("accessToken")?.value;
	if (!token) {
		return NextResponse.json({ error: "Authentication required" }, { status: 401 });
	}

	const secret = process.env.JWT_ACCESS_SECRET;
	if (!secret) throw new Error("JWT_ACCESS_SECRET is not set");

	const payload = (await verifyToken(token, secret)) as { sub: string; role: string };
	if (!payload) {
		return NextResponse.json({ error: "Invalid token" }, { status: 401 });
	}

	if (accessLevel === "admin" && payload.role !== "admin") {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const response = NextResponse.next();
	response.headers.set("x-user-id", payload.sub ?? "");
	response.headers.set("x-user-role", payload.role ?? "");

	return response;
}

/**
 * 页面守卫用的会话信息。
 *
 * access token 只有 1 分钟寿命，而页面跳转不会自动续期（续期发生在浏览器侧的
 * API 层）：如果只看 access token，用户闲置一分钟后点任何受保护页面都会被
 * 踢回登录页 —— 但此时 refresh token 其实还有效。所以这里做两级降级：
 *   1) access 有效 -> 用它（拿到最新的 role）
 *   2) access 过期/缺失 -> 退回 refresh 验签，只要它没到期就放行
 * 真正的续期交给 baseQueryWithAuth（API 返回 401 时调 /auth/refresh 换新令牌）。
 *
 * 注意：这里只验签 + 看 exp，不查数据库的 refresh 黑名单（中间件跑在 Edge）。
 * 所以它只是「别把用户挡在门外」的体验优化，真正的安全边界始终是 FastAPI。
 */
type PageSession = { sub?: string; role?: string };

async function getPageSession(req: NextRequest): Promise<PageSession | null> {
	const accessSecret = process.env.JWT_ACCESS_SECRET;
	const refreshSecret = process.env.JWT_REFRESH_SECRET;
	if (!accessSecret || !refreshSecret) {
		throw new Error("JWT_ACCESS_SECRET / JWT_REFRESH_SECRET is not set");
	}

	const accessToken = req.cookies.get("accessToken")?.value;
	if (accessToken) {
		const payload = await verifyToken(accessToken, accessSecret);
		if (payload) return payload as PageSession;
	}

	const refreshToken = req.cookies.get("refreshToken")?.value;
	if (refreshToken) {
		const payload = await verifyToken(refreshToken, refreshSecret);
		if (payload) return payload as PageSession;
	}

	return null;
}

// Page Auth Logic
async function handlePageAuth(req: NextRequest) {
	const { pathname } = req.nextUrl;
	// 剥掉语言前缀，让 /zh/user/dashboard 也能匹配到路由表里的 /user/dashboard
	// 用 (?=\/|$) 确保不会把 /english 这类路径误剥
	const pathWithoutLocale = pathname.replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
	const accessLevel = getRouteAccessLevel(pathWithoutLocale, "page");

	// Public or neutral
	if (accessLevel === "public" || accessLevel === null) {
		return intlMiddleware(req);
	}

	// access 优先，过期则退回 refresh token
	const session = await getPageSession(req);
	if (!session) return redirectToLogin(req);

	// Check admin role if needed
	if (accessLevel === "admin") {
		// 由旧版后端签发的 refresh token 里没有 role（本项目后来才加）。
		// 此时无法判断权限，送去登录页重新拿一张带 role 的令牌，
		// 而不是直接 403 —— 否则真正的管理员会被莫名其妙地拒绝。
		if (!session.role) return redirectToLogin(req);
		if (session.role !== "admin") return redirectToForbidden(req);
	}

	return intlMiddleware(req);
}

/**
 * 取 URL 里的语言段。
 * 没带语言前缀（用户直接敲 /user/dashboard）时不能直接用第 1 段——
 * 否则会生成 /user/auth/login 这种无效地址，所以只在确实是语言时才用它。
 */
function localeFromPath(pathname: string): string {
	const segment = pathname.split("/")[1];
	return routing.locales.includes(segment as (typeof routing.locales)[number])
		? segment
		: routing.defaultLocale;
}

// Redirection for unauthenticated users
function redirectToLogin(req: NextRequest) {
	const locale = localeFromPath(req.nextUrl.pathname);
	const loginUrl = new URL(`/${locale}/auth/login`, req.url);
	loginUrl.searchParams.set("redirect", req.nextUrl.pathname + req.nextUrl.search);
	return NextResponse.redirect(loginUrl);
}

// Redirection for forbidden access
function redirectToForbidden(req: NextRequest) {
	const locale = localeFromPath(req.nextUrl.pathname);
	const url = new URL(`/${locale}/403`, req.url);
	return NextResponse.redirect(url);
}

// Middleware Matcher
export const config = {
	matcher: "/((?!_next|_vercel|.*\\..*).*)",
};
