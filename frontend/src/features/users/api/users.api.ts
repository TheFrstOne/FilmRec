import { TAG_TYPES } from "@/constants/tag-type";
import { ServerDataResponse } from "@/features/users/types/ServerDataResponse";
import { UserPayload } from "@/features/users/types/UserPayload";
import { baseQueryWithAuth } from "@/shared/api/base-query";
import { LoginInput } from "../types/LoginInput";
import { RegisterInput } from "../types/RegisterInput";
import { createApi } from "@reduxjs/toolkit/query/react";

const transformResponse = (response: ServerDataResponse<UserPayload>) => {
	if (response.status === "success" && response.data) return response.data;
	throw new Error("Unexpected response from server");
};

export const usersApi = createApi({
	reducerPath: "usersApi",
	baseQuery: baseQueryWithAuth,
	// 登录 / 注册 / 登出都会换一个人，收藏、看过、评分自然也跟着换，
	// 所以这三个接口同时也让 MOVIE_EVENTS 失效，卡片操作条才会重新拉状态
	tagTypes: [TAG_TYPES.USER, TAG_TYPES.MOVIE_EVENTS],
	endpoints(builder) {
		return {
			getCurrentUser: builder.query<UserPayload, void>({
				query: () => "/users/currentuser",
				transformResponse,
				providesTags: [TAG_TYPES.USER],
			}),

			register: builder.mutation<UserPayload, RegisterInput>({
				query: (args) => ({
					url: "/auth/register",
					method: "POST",
					body: args,
				}),
				transformResponse,
				invalidatesTags: [TAG_TYPES.USER, TAG_TYPES.MOVIE_EVENTS],
			}),

			login: builder.mutation<UserPayload, LoginInput>({
				query: (args) => ({
					url: "/auth/login",
					method: "POST",
					body: args,
				}),
				transformResponse,
				invalidatesTags: [TAG_TYPES.USER, TAG_TYPES.MOVIE_EVENTS],
			}),

			logout: builder.mutation<void, void>({
				query: () => ({
					url: "/auth/logout",
					method: "POST",
				}),
				invalidatesTags: [TAG_TYPES.USER, TAG_TYPES.MOVIE_EVENTS],
			}),

			refreshToken: builder.mutation<void, void>({
				query: () => ({
					url: "/auth/refresh",
					method: "POST",
				}),
			}),
		};
	},
});

export const {
	useGetCurrentUserQuery,
	useRegisterMutation,
	useLoginMutation,
	useLogoutMutation,
	useRefreshTokenMutation,
} = usersApi;
