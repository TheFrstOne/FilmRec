"use client";

import { useRef } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
	MovieScore,
	useGetPopularRecommendationsQuery,
	useGetRecommendationsQuery,
} from "@/features/movies/api/movies.api";
import { useRecordEventMutation } from "@/features/movies/api/events.api";
import { useImpression } from "@/features/movies/hooks/use-impression";
import { MovieActions } from "@/features/movies/components/movie-actions";
import { PosterImage } from "@/features/movies/components/poster-image";
import { useUsers } from "@/features/users/hooks/use-users.hook";

/**
 * 推荐结果的一行：比电影库的卡片窄，所以操作条用 sm 尺寸。
 * 和 MovieCard 一样自带 impression（进视野）/ click（点整行）两种埋点。
 */
function RecommendationItem({ movie, rank }: { movie: MovieScore; rank: number }) {
	const itemRef = useRef<HTMLLIElement>(null);
	const [recordEvent] = useRecordEventMutation();

	useImpression(itemRef, movie.movie_id, "recommend");

	const handleClick = () => {
		recordEvent({
			movieId: movie.movie_id,
			eventType: "click",
			context: { source: "recommend" },
		})
			.unwrap()
			.catch(() => {});
	};

	return (
		<li ref={itemRef} className="card card-hover flex items-center gap-3.5 p-3">
			<span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">
				{rank}
			</span>
			<Link
				href={`/movies/${movie.movie_id}`}
				onClick={handleClick}
				className="group flex min-w-0 flex-1 items-center gap-3.5"
			>
				<PosterImage
					src={movie.poster}
					alt={movie.title}
					className="poster h-24 w-16 shrink-0 rounded-lg object-cover"
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span
						className="truncate font-semibold text-slate-900 group-hover:text-brand-700"
						title={movie.title}
					>
						{movie.title}
					</span>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
						{movie.release_year && <span>{movie.release_year}</span>}
						<span className="font-medium text-amber-600">★ {movie.rating ?? "—"}</span>
						<span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
							score {movie.score.toFixed(3)}
						</span>
					</div>
					<div className="pt-1">
						<MovieActions movieId={movie.movie_id} size="sm" />
					</div>
				</div>
			</Link>
		</li>
	);
}

export default function RecommendPage() {
	const t = useTranslations("RecommendPage");
	const { userPayload, loading } = useUsers();

	const myId = userPayload ? Number(userPayload.user.id) : Number.NaN;
	const hasUser = Number.isInteger(myId);

	// 登录了 -> 按你的口味实时推荐；未登录 -> 热度榜兜底（冷启动）
	const mine = useGetRecommendationsQuery({ userId: myId, topN: 12 }, { skip: !hasUser });
	const popular = useGetPopularRecommendationsQuery({ topN: 12 }, { skip: hasUser });

	const data = hasUser ? mine.data : popular.data;
	const isFetching = hasUser ? mine.isFetching : popular.isFetching;
	const isError = hasUser ? mine.isError : popular.isError;
	const items = data?.items ?? [];

	return (
		<div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
			<header className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
				<p className="mt-1.5 text-sm text-slate-600">{t("subtitle")}</p>
			</header>

			{/* 未登录：说明这是热度榜，并给出登录入口 */}
			{!loading && !hasUser && (
				<div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-5 py-4">
					<p className="text-sm text-brand-900">{t("guestNotice")}</p>
					<Link href="/auth/login" className="btn btn-primary btn-sm">
						{t("loginForPersonal")}
					</Link>
				</div>
			)}

			{/* 推荐策略 + 可解释性 */}
			{data && (
				<div className="mb-5 flex flex-wrap items-center gap-3">
					<span className="badge">
						{t("strategy")}
						<code className="font-mono">{data.strategy}</code>
					</span>

					{data.based_on && data.based_on.length > 0 && (
						<span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
							{t("basedOn")}
							{data.based_on.map((m) => (
								<Link
									key={m.movie_id}
									href={`/movies/${m.movie_id}`}
									className="chip transition hover:border-brand-300 hover:text-brand-700"
								>
									《{m.title}》
								</Link>
							))}
						</span>
					)}
				</div>
			)}

			{isError && (
				<div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{t("error")}
				</div>
			)}

			{(loading || isFetching) && items.length === 0 && (
				<ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<li key={i} className="card h-[120px] animate-pulse bg-slate-100" />
					))}
				</ul>
			)}

			{/* 结果：手机 1 列 → 桌面 2 列 */}
			<ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				{items.map((m, i) => (
					<RecommendationItem key={m.movie_id} movie={m} rank={i + 1} />
				))}
			</ul>

			{!loading && !isFetching && !isError && items.length === 0 && (
				<p className="py-16 text-center text-sm text-slate-500">{t("empty")}</p>
			)}
		</div>
	);
}
