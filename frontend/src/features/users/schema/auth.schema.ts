import { z } from "zod";

/**
 * 表单校验规则，与后端 backend/auth.py 的 Pydantic 模型保持一致
 * （两边都对，前端是为了即时提示，后端是为了安全）。
 */
export const registerSchema = z.object({
	name: z.string().min(2, "昵称至少 2 个字符").max(50, "昵称最多 50 个字符"),
	email: z.string().email("请输入有效的邮箱地址"),
	// 上限 64：bcrypt 只取前 72 字节，太长会被静默截断
	password: z.string().min(6, "密码至少 6 位").max(64, "密码最多 64 位"),
});

export const loginSchema = z.object({
	email: z.string().email("请输入有效的邮箱地址"),
	password: z.string().min(6, "密码至少 6 位").max(64, "密码最多 64 位"),
});
