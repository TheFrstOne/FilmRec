import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// 后端服务地址（服务器端读取，不需要 NEXT_PUBLIC_ 前缀）
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
	experimental: {
		authInterrupts: true,
	},
	// 把前端发往 /api/backend/xxx 的请求转发给后端的 /api/xxx
	// 好处：浏览器侧是同源请求，不用配置 CORS，也不会暴露后端真实地址
	async rewrites() {
		return [
			{
				source: "/api/backend/:path*",
				destination: `${BACKEND_API_URL}/api/:path*`,
			},
		];
	},
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
