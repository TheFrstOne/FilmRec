"use client";

import { useRef } from "react";
import { Link } from "@/i18n/navigation";
import { Movie } from "../api/movies.api";
import { useRecordEventMutation } from "../api/events.api";
import { useImpression } from "../hooks/use-impression";
import { MovieActions } from "./movie-actions";
import { PosterImage } from "./poster-image";

/**
 * 电影库的一张卡片：海报 + 基本信息 + 操作条。
 *
 * 自带两种埋点：卡片进入视野记一次 impression，点进详情页记一次 click。
 * 两种都是「记了就忘」，失败静默 —— 埋点不该打断浏览。
 */
export function MovieCard({ movie }: { movie: Movie }) {
	const cardRef = useRef<HTMLDivElement>(null);
	const [recordEvent] = useRecordEventMutation();

	useImpression(cardRef, movie.movie_id, "movies");

	const handleClick = () => {
		recordEvent({
			movieId: movie.movie_id,
			eventType: "click",
			context: { source: "movies" },
		})
			.unwrap()
			.catch(() => {});
	};

	const meta = [movie.year, movie.countries].filter(Boolean).join(" · ");

	return (
		<div ref={cardRef} className="card card-hover group flex flex-col overflow-hidden">
			{/* 海报 + 文字都是链接：可键盘访问，点进详情页 */}
			<Link
				href={`/movies/${movie.movie_id}`}
				onClick={handleClick}
				className="flex flex-1 flex-col focus-visible:outline-none"
			>
				<div className="relative overflow-hidden">
					<PosterImage
						src={movie.poster}
						alt={movie.title}
						className="poster h-56 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
					/>
					{typeof movie.rating === "number" && movie.rating > 0 && (
						<span className="absolute top-2 right-2 rounded-full bg-slate-900/80 px-2 py-1 text-xs font-semibold text-amber-300 backdrop-blur-sm">
							★ {movie.rating}
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
					{meta && <p className="text-xs text-slate-500">{meta}</p>}
					{movie.genres && (
						<p className="truncate text-xs text-slate-400" title={movie.genres}>
							{movie.genres}
						</p>
					)}
				</div>
			</Link>

			<div className="mt-auto px-3.5 pb-3.5">
				<MovieActions movieId={movie.movie_id} />
			</div>
		</div>
	);
}
