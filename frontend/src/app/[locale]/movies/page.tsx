"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
	useGetGenreStatsQuery,
	useGetMoviesQuery,
} from "@/features/movies/api/movies.api";
import { MovieCard } from "@/features/movies/components/movie-card";

const PAGE_SIZE = 12;

export default function MoviesPage() {
	const t = useTranslations("MoviesPage");
	const [keyword, setKeyword] = useState("");
	const [page, setPage] = useState(1);

	const { data, isFetching, isError } = useGetMoviesQuery({
		page,
		size: PAGE_SIZE,
		keyword,
	});
	const { data: genres } = useGetGenreStatsQuery();

	const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;
	const items = data?.items ?? [];

	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
			{/* 页头 */}
			<header className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
				<p className="mt-1.5 text-sm text-slate-600">{t("subtitle")}</p>
			</header>

			{/* 搜索 */}
			<div className="mb-6 max-w-md">
				<label htmlFor="movie-search" className="label">
					{t("searchLabel")}
				</label>
				<div className="relative">
					<svg
						viewBox="0 0 24 24"
						className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="m20 20-3.5-3.5" />
					</svg>
					<input
						id="movie-search"
						type="search"
						value={keyword}
						onChange={(e) => {
							setKeyword(e.target.value);
							setPage(1);
						}}
						placeholder={t("searchPlaceholder")}
						className="input pl-10"
					/>
				</div>
			</div>

			{/* 类型统计 */}
			{genres && genres.length > 0 && (
				<section className="mb-8">
					<h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
						{t("genreStats")}
					</h2>
					<div className="flex flex-wrap gap-2">
						{genres.slice(0, 15).map((g) => (
							<span key={g.genre} className="chip">
								{g.genre}
								<span className="font-semibold text-brand-600">{g.count}</span>
							</span>
						))}
					</div>
				</section>
			)}

			{isError && (
				<div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{t("error")}
				</div>
			)}

			{/* 结果计数 */}
			{data && (
				<p className="mb-4 text-sm text-slate-500">{t("count", { total: data.total })}</p>
			)}

			{/* 电影网格：手机 2 列 → 平板 3 列 → 桌面 4/5 列 */}
			<section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
				{items.map((m) => (
					<MovieCard key={m.movie_id} movie={m} />
				))}
			</section>

			{!isFetching && !isError && items.length === 0 && (
				<p className="py-16 text-center text-sm text-slate-500">{t("empty")}</p>
			)}

			{isFetching && (
				<div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="card overflow-hidden">
							<div className="h-56 animate-pulse bg-slate-100" />
							<div className="space-y-2 p-3">
								<div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
								<div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
							</div>
						</div>
					))}
				</div>
			)}

			{/* 分页 */}
			{data && totalPages > 1 && (
				<nav
					aria-label="Pagination"
					className="mt-10 flex items-center justify-center gap-4"
				>
					<button
						type="button"
						disabled={page <= 1}
						onClick={() => setPage((p) => Math.max(p - 1, 1))}
						className="btn btn-secondary btn-sm"
					>
						← {t("prev")}
					</button>
					<span className="text-sm font-medium text-slate-600">
						{page} / {totalPages}
					</span>
					<button
						type="button"
						disabled={page >= totalPages}
						onClick={() => setPage((p) => p + 1)}
						className="btn btn-secondary btn-sm"
					>
						{t("next")} →
					</button>
				</nav>
			)}
		</div>
	);
}
