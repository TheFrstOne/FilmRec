import { TAG_TYPES } from "@/constants/tag-type";
import { ServerDataResponse } from "@/features/users/types/ServerDataResponse";
import { baseQueryWithAuth } from "@/shared/api/base-query";
import { createApi } from "@reduxjs/toolkit/query/react";

/** 与 MySQL events.event_type 的 ENUM 一一对应 */
export type MovieEventType = "impression" | "click" | "favorite" | "rating" | "watch";

export interface RecordEventInput {
	movieId: number;
	eventType: MovieEventType;
	/** 仅 rating 用，1-5 星 */
	score?: number;
	/** 来源页面 / 位置等，原样存进 events.context */
	context?: Record<string, unknown>;
}

/** GET /events/mine 的样子：收藏和看过是「当前还开着」的开关，评分只有最新一次 */
export interface MyMovieEvents {
	favorites: number[];
	watched: number[];
	ratings: { movie_id: number; score: number }[];
}

/** 「我的片单」里的一条电影（带电影信息，不用再逐部查详情） */
export interface LibraryMovie {
	movie_id: number;
	title: string;
	release_year?: number;
	year?: number;
	rating?: number;
	comment_count?: number;
	poster?: string;
	genres?: string;
	countries?: string;
}

export interface MyLibrary {
	favorites: LibraryMovie[];
	watched: LibraryMovie[];
	ratings: (LibraryMovie & { score: number; rated_at?: string })[];
}

export const eventsApi = createApi({
	reducerPath: "eventsApi",
	baseQuery: baseQueryWithAuth,
	tagTypes: [TAG_TYPES.MOVIE_EVENTS],
	endpoints(builder) {
		return {
			/** 上报一条行为。匿名也能上报 impression / click，其余后端会回 401。 */
			recordEvent: builder.mutation<void, RecordEventInput>({
				query: ({ movieId, eventType, score, context }) => ({
					url: "/events",
					method: "POST",
					body: {
						movie_id: movieId,
						event_type: eventType,
						score,
						context,
					},
				}),
				async onQueryStarted({ eventType }, { dispatch, queryFulfilled }) {
					// 曝光和点击只是日志，不影响任何已渲染的状态，没必要触发重新拉取
					// （列表页一屏十几张卡片，每次都 refetch 会把后端打爆）
					if (eventType === "impression" || eventType === "click") return;

					try {
						await queryFulfilled;
						dispatch(eventsApi.util.invalidateTags([TAG_TYPES.MOVIE_EVENTS]));
					} catch {
						// 失败不失效：卡片上的乐观状态由组件自己回滚
					}
				},
			}),

			/** 当前用户的收藏 / 看过 / 评分，用来点亮卡片上的操作条。所有卡片共享这一份缓存。 */
			getMyMovieEvents: builder.query<MyMovieEvents, void>({
				query: () => "/events/mine",
				transformResponse: (res: ServerDataResponse<MyMovieEvents>) => res.data,
				providesTags: [TAG_TYPES.MOVIE_EVENTS],
			}),

			/** 我的片单：收藏 / 看过 / 评分，带完整电影信息 */
			getMyLibrary: builder.query<MyLibrary, void>({
				query: () => "/events/mine/library",
				transformResponse: (res: ServerDataResponse<MyLibrary>) => res.data,
				providesTags: [TAG_TYPES.MOVIE_EVENTS],
			}),
		};
	},
});

export const { useRecordEventMutation, useGetMyMovieEventsQuery, useGetMyLibraryQuery } =
	eventsApi;
