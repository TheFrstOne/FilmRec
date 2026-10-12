import { NextRequest, NextResponse } from "next/server";

/**
 * 豆瓣海报代理。
 *
 * 为什么需要它：豆瓣图床有防盗链——
 *   不带 Referer          -> 418
 *   Referer 是本站(localhost) -> 403
 *   Referer movie.douban.com -> 200
 * 浏览器无法伪造 Referer（这是安全策略），所以只能由服务器替浏览器去取图，
 * 再以同源的方式吐给 <img>。
 *
 * 用法： <img src="/api/images/proxy?url=<encodeURIComponent(海报URL)>" />
 */

// 白名单：只有豆瓣的图床域名能过（同时也堵死了 SSRF——不能拿这个接口去请求内网）
const ALLOWED_HOST = /^https:\/\/img\d{1,2}\.doubanio\.com\//;
const DOUBAN_REFERER = "https://movie.douban.com/";
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_URL_LENGTH = 2048;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB，正常海报几十 KB

// 取不到图时统一返回这张内联占位图（HTTP 200，<img> 不会显示裂图）
const PLACEHOLDER_SVG =
	`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">` +
	`<rect width="100%" height="100%" fill="#e5e7eb"/>` +
	`<text x="50%" y="50%" font-size="72" text-anchor="middle" dominant-baseline="central">🎬</text>` +
	`</svg>`;

function placeholder(): NextResponse {
	return new NextResponse(PLACEHOLDER_SVG, {
		status: 200,
		headers: {
			"Content-Type": "image/svg+xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}

export async function GET(req: NextRequest) {
	const url = req.nextUrl.searchParams.get("url") ?? "";

	if (!url || url.length > MAX_URL_LENGTH || !ALLOWED_HOST.test(url)) {
		return new NextResponse("invalid url", { status: 400 });
	}

	try {
		const upstream = await fetch(url, {
			headers: {
				// ★ 关键：带上豆瓣自己的 Referer，否则 418/403
				Referer: DOUBAN_REFERER,
				"User-Agent": USER_AGENT,
			},
			// 不跟随跳转：万一上游被污染，也绝不会把请求带到别的地址去
			redirect: "manual",
			cache: "no-store",
		});

		if (!upstream.ok) return placeholder();

		const contentType = upstream.headers.get("content-type") ?? "";
		if (!contentType.startsWith("image/")) return placeholder();

		const contentLength = Number(upstream.headers.get("content-length") ?? 0);
		if (contentLength > MAX_BYTES) return placeholder();

		const buffer = await upstream.arrayBuffer();
		if (buffer.byteLength > MAX_BYTES) return placeholder();

		return new NextResponse(new Uint8Array(buffer), {
			status: 200,
			headers: {
				"Content-Type": contentType,
				// 海报内容不会变，让浏览器长期缓存，翻页/刷新就不用再打服务器
				"Cache-Control": "public, max-age=86400, immutable",
			},
		});
	} catch {
		return placeholder();
	}
}
