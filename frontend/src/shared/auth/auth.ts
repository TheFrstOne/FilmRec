import { JWTPayload, jwtVerify } from "jose";

/**
 * 校验 JWT（HS256）。
 *
 * 签发方是 FastAPI（backend/auth.py），前端只负责验签：
 * 中间件用它判断用户有没有登录、是不是管理员，做【页面】守卫。
 * API 的鉴权由 FastAPI 自己读 Cookie 完成。
 *
 *
 * 用 jose 而不是 jsonwebtoken，是因为中间件跑在 Edge Runtime，没有 Node 的 crypto。
 */
export async function verifyToken(
	token: string,
	secretKey: string,
): Promise<JWTPayload | null> {
	const key = new TextEncoder().encode(secretKey);

	try {
		const { payload } = await jwtVerify(token, key);
		return payload;
	} catch {
		return null;
	}
}
