"use client";

import { AuthProvider } from "@/features/users/providers/auth.provider";
import { UsersProvider } from "@/features/users/providers/users.provider";
import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { store } from "@/store";

/**
 * 全局 Provider。
 * UsersProvider 负责「当前登录用户是谁」（拉 /api/backend/users/currentuser），
 * 导航栏和个人中心都用它；登录/注册/登出动作则由 AuthProvider 提供。
 */
export function AppProviders({ children }: PropsWithChildren) {
	return (
		<Provider store={store}>
			<AuthProvider>
				<UsersProvider>{children}</UsersProvider>
			</AuthProvider>
		</Provider>
	);
}
