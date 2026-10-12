import { ServerDataResponse } from "@/features/users/types/ServerDataResponse";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * baseUrl = "/api/backend"
 * -> 浏览器请求 /api/backend/movies
 * -> next.config.ts 的 rewrites 转发到后端 http://127.0.0.1:8000/api/movies
 */
export interface Movie {
	movie_id: number;
	title: string;
	countries?: string;
	genres?: string;
	year?: number;
	rating?: number;
	comment_count?: number;
	poster?: string;
}

export interface MoviePage {
	total: number;
	page: number;
	size: number;
	items: Movie[];
}

export interface GenreStat {
	genre: string;
	count: number;
}

export interface MovieQueryArgs {
	page?: number;
	size?: number;
	keyword?: string;
}

// 推荐返回的是「打过分」的电影
export interface MovieScore {
	movie_id: number;
	title: string;
	release_year?: number;
	rating?: number;
	poster?: string;
	score: number;
}

/** GET /movies/{id} 的返回：v_movies_flat 的完整一行 */
export interface MovieDetail {
	movie_id: number;
	title: string;
	release_year?: number;
	year?: number;
	rating?: number;
	star_count?: number;
	comment_count?: number;
	poster?: string;
	rank?: number;
	genres?: string;
	countries?: string;
	directors?: string;
	actors?: string;
}

export interface RecommendResult {
	strategy: string; // 走了哪条路：content-based / popularity(cold-start) ...
	/** 可解释性：这条推荐是基于你喜欢的哪几部电影（仅 content-based 有） */
	based_on?: { movie_id: number; title: string }[];
	items: MovieScore[];
}

export const moviesApi = createApi({
	reducerPath: "moviesApi",
	baseQuery: fetchBaseQuery({ baseUrl: "/api/backend" }),
	endpoints(builder) {
		return {
			getMovies: builder.query<MoviePage, MovieQueryArgs | void>({
				query: (args) => {
					const page = args?.page ?? 1;
					const size = args?.size ?? 12;
					const keyword = args?.keyword ?? "";
					return `/movies?page=${page}&size=${size}&keyword=${encodeURIComponent(keyword)}`;
				},
				transformResponse: (res: ServerDataResponse<MoviePage>) => res.data,
			}),

			getGenreStats: builder.query<GenreStat[], void>({
				query: () => "/stats/genres",
				transformResponse: (res: ServerDataResponse<GenreStat[]>) => res.data,
			}),

			// 给某个用户推荐（后端自动处理冷启动）
			getRecommendations: builder.query<
				RecommendResult,
				{ userId: number; topN?: number }
			>({
				query: ({ userId, topN = 10 }) => `/recommend/${userId}?top_n=${topN}`,
				transformResponse: (res: ServerDataResponse<RecommendResult>) => res.data,
			}),

			// 与某部电影相似的电影
			getSimilarMovies: builder.query<
				RecommendResult,
				{ movieId: number; topN?: number }
			>({
				query: ({ movieId, topN = 10 }) => `/movies/${movieId}/similar?top_n=${topN}`,
				transformResponse: (res: ServerDataResponse<RecommendResult>) => res.data,
			}),

			// 单部电影详情
			getMovieDetail: builder.query<MovieDetail | null, number>({
				query: (movieId) => `/movies/${movieId}`,
				transformResponse: (res: ServerDataResponse<MovieDetail>) => res.data ?? null,
			}),

			// 访客热度榜：未登录时也能看到东西（冷启动）
			getPopularRecommendations: builder.query<RecommendResult, { topN?: number } | void>(
				{
					query: (args) => `/recommend?top_n=${args?.topN ?? 12}`,
					transformResponse: (res: ServerDataResponse<RecommendResult>) => res.data,
				},
			),
		};
	},
});

export const {
	useGetMoviesQuery,
	useGetGenreStatsQuery,
	useGetRecommendationsQuery,
	useGetSimilarMoviesQuery,
	useGetMovieDetailQuery,
	useGetPopularRecommendationsQuery,
} = moviesApi;
