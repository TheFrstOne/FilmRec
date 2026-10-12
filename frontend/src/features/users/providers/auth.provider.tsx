import { useTranslations } from "next-intl";
import { PropsWithChildren } from "react";
import toast from "react-hot-toast";
import { useDispatch } from "react-redux";
import { useRouter } from "@/i18n/navigation";
import { eventsApi } from "@/features/movies/api/events.api";
import { adminApi } from "@/features/admin/api/admin.api";
import {
	usersApi,
	useLoginMutation,
	useLogoutMutation,
	useRegisterMutation,
} from "../api/users.api";
import { AuthContext } from "../context/auth.context";
import { AuthContextType } from "../types/AuthContextType";
import { RTKQueryErrorResponse } from "../types/RTKQueryErrorResponse";

/** 后端返回的错误包里第一条 message（没有就用兜底文案） */
function firstErrorMessage(error: unknown, fallback: string): string {
	return (error as RTKQueryErrorResponse)?.data?.errors?.[0]?.message || fallback;
}

/**
 * 登录 / 注册成功后的去向。
 *
 * 默认去个人中心；但如果是被中间件拦下来、或者点收藏时被操作条拦下来的
 * （URL 上带着 ?redirect=），就回到原来那一页。
 *
 * 这里只接受站内相对路径 —— 否则 ?redirect=https://evil.com 就成了
 * 开放重定向漏洞（拿自己的域名把用户送去钓鱼站）。
 */
function getSafeRedirect(fallback = "/user/dashboard"): string {
	if (typeof window === "undefined") return fallback;

	const raw = new URLSearchParams(window.location.search).get("redirect");
	if (!raw) return fallback;

	// 必须以单个 "/" 开头：这样就排除了 "https://..."、"//evil.com"、"\\evil.com"
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
		return fallback;
	}
	// 回登录 / 注册页会绕成死循环
	if (/^\/(?:en|zh)?\/?auth\//.test(raw)) return fallback;

	// 中间件写进来的是带语言前缀的路径（/zh/movies），而 next-intl 的 router
	// 会自己补上前缀，不剥掉就变成 /zh/zh/movies
	return raw.replace(/^\/(?:en|zh)(?=\/|$)/, "") || "/";
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
	const dispatch = useDispatch();
	// 用 next-intl 的 router，跳转时会自动带上当前语言前缀（/zh、/en）
	const router = useRouter();
	const t = useTranslations("AuthToast");

	const [loginMutation] = useLoginMutation();
	const [registerMutation] = useRegisterMutation();
	const [logoutMutation] = useLogoutMutation();

	const loginRequest = async (email: string, password: string): Promise<void> => {
		try {
			await loginMutation({ email, password }).unwrap();
			// 登录成功后 getCurrentUser 会因 invalidatesTags 自动重新拉取
			toast.success(t("loginSuccess"));
			router.push(getSafeRedirect());
		} catch (error) {
			toast.error(firstErrorMessage(error, t("loginFailed")));
		}
	};

	const registerRequest = async (
		name: string,
		email: string,
		password: string,
	): Promise<void> => {
		try {
			await registerMutation({ name, email, password }).unwrap();
			toast.success(t("registerSuccess"));
			router.push(getSafeRedirect());
		} catch (error) {
			toast.error(firstErrorMessage(error, t("registerFailed")));
		}
	};

	const logoutRequest = async (): Promise<void> => {
		try {
			await logoutMutation().unwrap();
			// 清空 RTK Query 缓存，把已登录状态也一起重置掉；
			// eventsApi 也要清，否则卡片上的收藏/评分还留着上一个人的
			dispatch(usersApi.util.resetApiState());
			dispatch(eventsApi.util.resetApiState());
			dispatch(adminApi.util.resetApiState());
			toast.success(t("logoutSuccess"));
			router.push("/");
			router.refresh();
		} catch (error) {
			toast.error(firstErrorMessage(error, t("logoutFailed")));
		}
	};

	const value: AuthContextType = {
		loginRequest,
		logoutRequest,
		registerRequest,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
