import { TAG_TYPES } from "@/constants/tag-type";
import { ServerDataResponse } from "@/features/users/types/ServerDataResponse";
import { baseQueryWithAuth } from "@/shared/api/base-query";
import { createApi } from "@reduxjs/toolkit/query/react";

/** GET /admin/overview 的返回 */
export interface AdminOverview {
	counts: {
		users: number;
		movies: number;
		events: number;
		ratings: number;
		comments: number;
	};
	eventsByType: Record<string, number>;
	/** 点击率 = click / impression */
	ctr: number;
	topMovies: {
		movie_id: number;
		title: string;
		impressions: number;
		clicks: number;
		events: number;
	}[];
	trend: { date: string; impressions: number; clicks: number; saves: number }[];
}

/** GET /admin/models 的一行 */
export interface ModelVersion {
	model_version: string;
	model_name: string;
	artifact_path: string;
	data_version: string | null;
	metrics: Record<string, unknown> | null;
	is_active: boolean;
	trained_at: string | null;
}

/**
 * 管理后台接口。全部要求 role='admin'，后端 admin.py 会再校验一次
 * （前端中间件只拦页面，/api/backend/* 是原样代理的）。
 */
export const adminApi = createApi({
	reducerPath: "adminApi",
	baseQuery: baseQueryWithAuth,
	tagTypes: [TAG_TYPES.ADMIN],
	endpoints(builder) {
		return {
			getAdminOverview: builder.query<AdminOverview, void>({
				query: () => "/admin/overview",
				transformResponse: (res: ServerDataResponse<AdminOverview>) => res.data,
				providesTags: [TAG_TYPES.ADMIN],
			}),

			getModels: builder.query<ModelVersion[], void>({
				query: () => "/admin/models",
				transformResponse: (res: ServerDataResponse<ModelVersion[]>) => res.data,
				providesTags: [TAG_TYPES.ADMIN],
			}),

			activateModel: builder.mutation<{ active: string; note?: string }, string>({
				query: (version) => ({
					url: `/admin/models/${encodeURIComponent(version)}/activate`,
					method: "POST",
				}),
				transformResponse: (res: ServerDataResponse<{ active: string; note?: string }>) =>
					res.data,
				invalidatesTags: [TAG_TYPES.ADMIN],
			}),
		};
	},
});

export const { useGetAdminOverviewQuery, useGetModelsQuery, useActivateModelMutation } =
	adminApi;
