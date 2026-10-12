"use client";

import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	MovieScore,
	useGetMovieDetailQuery,
	useGetSimilarMoviesQuery,
} from "@/features/movies/api/movies.api";
import { MovieActions } from "@/features/movies/components/movie-actions";
import { PosterImage } from "@/features/movies/components/poster-image";

/** 相似电影：小卡片，点进各自的详情页 */
function SimilarCard({ movie }: { movie: MovieScore }) {
	return (
		<Link
			href={`/movies/${movie.movie_id}`}
			className="card card-hover group flex flex-col overflow-hidden"
		>
			<PosterImage
				src={movie.poster}
				alt={movie.title}
				className="poster h-44 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
			/>
			<div className="flex flex-1 flex-col gap-1 p-3">
				<span
					className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-700"
					title={movie.title}
				>
					{movie.title}
				</span>
				<div className="flex items-center justify-between text-xs text-slate-500">
					<span>{movie.release_year ?? "—"}</span>
					<span className="font-medium text-amber-600">★ {movie.rating ?? "—"}</span>
				</div>
			</div>
		</Link>
	);
}

function Chip({ children }: { children: React.ReactNode }) {
	return <span className="chip">{children}</span>;
}

export default function MovieDetailPage() {
	const t = useTranslations("MovieDetailPage");
	const params = useParams<{ movieId: string }>();
	const movieId = Number(params.movieId);
	const valid = Number.isFinite(movieId);

	const {
		data: movie,
		isLoading,
		isError,
	} = useGetMovieDetailQuery(movieId, {
		skip: !valid,
	});
	const { data: similar, isFetching: similarFetching } = useGetSimilarMoviesQuery(
		{ movieId, topN: 12 },
		{ skip: !valid },
	);

	if (isLoading) {
		return (
			<div className="mx-auto max-w-5xl animate-pulse px-4 py-10 sm:px-6 lg:px-8">
				<div className="grid gap-8 sm:grid-cols-[240px_1fr]">
					<div className="aspect-[2/3] rounded-2xl bg-slate-200" />
					<div className="space-y-3 py-2">
						<div className="h-8 w-2/3 rounded bg-slate-200" />
						<div className="h-4 w-1/3 rounded bg-slate-100" />
						<div className="h-24 w-full rounded bg-slate-100" />
					</div>
				</div>
			</div>
		);
	}

	if (isError || !movie) {
		return (
			<div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
				<p className="text-4xl" aria-hidden="true">
					🎬
				</p>
				<h1 className="mt-3 text-xl font-semibold text-slate-900">{t("notFound")}</h1>
				<Link href="/movies" className="btn btn-secondary mt-6">
					← {t("back")}
				</Link>
			</div>
		);
	}

	const genres = (movie.genres ?? "").split("|").filter(Boolean);
	const actors = (movie.actors ?? "").split("|").filter(Boolean);
	const directors = (movie.directors ?? "").split("|").filter(Boolean);

	return (
		<div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
			<Link
				href="/movies"
				className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-700"
			>
				← {t("back")}
			</Link>

			{/* 概要 */}
			<div className="grid gap-8 sm:grid-cols-[240px_1fr]">
				<PosterImage
					src={movie.poster}
					alt={movie.title}
					className="poster aspect-[2/3] w-full max-w-[240px] rounded-2xl object-cover shadow-soft"
				/>

				<div className="flex flex-col">
					<h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
						{movie.title}
					</h1>

					<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
						{movie.release_year && <span>{t("year", { year: movie.release_year })}</span>}
						{movie.rating ? (
							<span className="text-base font-semibold text-amber-600">
								★ {movie.rating}
							</span>
						) : null}
						{movie.countries && <span>{movie.countries}</span>}
						{typeof movie.comment_count === "number" && movie.comment_count > 0 && (
							<span className="text-slate-400">
								{t("comments", { count: movie.comment_count })}
							</span>
						)}
					</div>

					{genres.length > 0 && (
						<div className="mt-4 flex flex-wrap gap-2">
							{genres.map((g) => (
								<Chip key={g}>{g}</Chip>
							))}
						</div>
					)}

					<dl className="mt-5 space-y-2.5 text-sm">
						{directors.length > 0 && (
							<div className="flex gap-3">
								<dt className="w-16 shrink-0 text-slate-400">{t("director")}</dt>
								<dd className="text-slate-700">{directors.join(" / ")}</dd>
							</div>
						)}
						{actors.length > 0 && (
							<div className="flex gap-3">
								<dt className="w-16 shrink-0 text-slate-400">{t("cast")}</dt>
								<dd className="text-slate-700">{actors.join(" / ")}</dd>
							</div>
						)}
					</dl>

					{/* 收藏 / 看过 / 评分 */}
					<div className="mt-6 border-t border-slate-100 pt-5">
						<MovieActions movieId={movie.movie_id} />
					</div>
				</div>
			</div>

			{/* 相似电影 */}
			<section className="mt-14">
				<div className="mb-4 flex items-baseline gap-3">
					<h2 className="text-lg font-semibold text-slate-900">{t("similar")}</h2>
					<span className="text-xs text-slate-400">{t("similarHint")}</span>
				</div>

				{similarFetching && !similar ? (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={i} className="card h-64 animate-pulse bg-slate-100" />
						))}
					</div>
				) : similar && similar.items.length > 0 ? (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{similar.items.map((m) => (
							<SimilarCard key={m.movie_id} movie={m} />
						))}
					</div>
				) : (
					<p className="py-8 text-sm text-slate-400">{t("similarEmpty")}</p>
				)}
			</section>
		</div>
	);
}
