"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LibraryMovie, useGetMyLibraryQuery } from "@/features/movies/api/events.api";
import { MovieActions } from "@/features/movies/components/movie-actions";
import { PosterImage } from "@/features/movies/components/poster-image";

const TABS = [
	{ key: "favorites", label: "tabFavorites", empty: "emptyFavorites" },
	{ key: "watched", label: "tabWatched", empty: "emptyWatched" },
	{ key: "ratings", label: "tabRatings", empty: "emptyRatings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function LibraryCard({ movie, score }: { movie: LibraryMovie; score?: number }) {
	return (
		<div className="card card-hover group flex flex-col overflow-hidden">
			<Link href={`/movies/${movie.movie_id}`} className="flex flex-1 flex-col">
				<div className="relative overflow-hidden">
					<PosterImage
						src={movie.poster}
						alt={movie.title}
						className="poster h-56 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
					/>
					{typeof score === "number" && (
						<span className="absolute top-2 right-2 rounded-full bg-slate-900/80 px-2 py-1 text-xs font-semibold text-amber-300 backdrop-blur-sm">
							★ {score}
						</span>
					)}
				</div>
				<div className="flex flex-1 flex-col gap-1 p-3.5">
					<h3
						className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-700"
						title={movie.title}
					>
						{movie.title}
					</h3>
					<p className="truncate text-xs text-slate-500">
						{[movie.year, movie.countries].filter(Boolean).join(" · ")}
					</p>
				</div>
			</Link>
			<div className="mt-auto px-3.5 pb-3.5">
				<MovieActions movieId={movie.movie_id} />
			</div>
		</div>
	);
}

export default function LibraryPage() {
	const t = useTranslations("LibraryPage");
	const [tab, setTab] = useState<TabKey>("favorites");
	const { data, isLoading, isError } = useGetMyLibraryQuery();

	const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

	const items: { movie: LibraryMovie; score?: number }[] =
		tab === "ratings"
			? (data?.ratings ?? []).map((r) => ({ movie: r, score: r.score }))
			: (data?.[tab] ?? []).map((m) => ({ movie: m }));

	const countOf = (key: TabKey) =>
		key === "ratings" ? (data?.ratings.length ?? 0) : (data?.[key].length ?? 0);

	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
			<header className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
				<p className="mt-1.5 text-sm text-slate-600">{t("subtitle")}</p>
			</header>

			{/* 分类标签 */}
			<div
				role="tablist"
				aria-label={t("title")}
				className="mb-6 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1"
			>
				{TABS.map((item) => {
					const active = tab === item.key;
					return (
						<button
							key={item.key}
							type="button"
							role="tab"
							aria-selected={active}
							onClick={() => setTab(item.key)}
							className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
								active
									? "bg-white text-brand-700 shadow-sm"
									: "text-slate-500 hover:text-slate-800"
							}`}
						>
							{t(item.label)}
							{data && (
								<span className="ml-1.5 text-xs text-slate-400">{countOf(item.key)}</span>
							)}
						</button>
					);
				})}
			</div>

			{isError && (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{t("error")}
				</div>
			)}

			{isLoading && (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="card h-80 animate-pulse bg-slate-100" />
					))}
				</div>
			)}

			{!isLoading && !isError && items.length === 0 && (
				<div className="card grid place-items-center p-14 text-center">
					<span className="text-4xl" aria-hidden="true">
						🍿
					</span>
					<p className="mt-3 text-sm text-slate-500">{t(activeTab.empty)}</p>
					<Link href="/movies" className="btn btn-primary mt-5">
						{t("browse")}
					</Link>
				</div>
			)}

			{!isLoading && items.length > 0 && (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{items.map(({ movie, score }) => (
						<LibraryCard key={movie.movie_id} movie={movie} score={score} />
					))}
				</div>
			)}
		</div>
	);
}
