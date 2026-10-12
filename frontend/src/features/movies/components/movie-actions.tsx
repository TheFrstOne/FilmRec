"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useUsers } from "@/features/users/hooks/use-users.hook";
import { useGetMyMovieEventsQuery, useRecordEventMutation } from "../api/events.api";

/** RTK Query 的错误对象：只有 HTTP 状态码，401 说明连刷新都救不回来了 */
function isUnauthorized(error: unknown): boolean {
	return (error as { status?: number } | undefined)?.status === 401;
}

/**
 * 卡片下方的操作条：收藏 / 看过 / 评分。
 *
 * 状态来自后端（GET /events/mine），所有卡片共享同一份 RTK Query 缓存，
 * 一屏卡片也只发一次请求；点击时先在本地乐观切换，失败再回滚。
 *
 * 未登录只允许曝光和点击，操作条上的三件事都需要身份，所以拦住并送去登录页。
 */
export function MovieActions({
	movieId,
	size = "md",
}: {
	movieId: number;
	/** sm 用于推荐页那种窄卡片 */
	size?: "sm" | "md";
}) {
	const t = useTranslations("MovieActions");
	const router = useRouter();
	const pathname = usePathname();
	const { isAuthenticated } = useUsers();
	const [recordEvent] = useRecordEventMutation();

	const { data } = useGetMyMovieEventsQuery(undefined, { skip: !isAuthenticated });

	const [favorited, setFavorited] = useState(false);
	const [watched, setWatched] = useState(false);
	const [rating, setRating] = useState(0); // 0 = 还没评过
	const [hoverStars, setHoverStars] = useState(0); // 鼠标悬停时的预览分

	// 服务端状态是唯一真相：拉到（或因为收藏/评分被失效后重新拉到）就覆盖本地乐观值
	useEffect(() => {
		setFavorited(!!data?.favorites.includes(movieId));
		setWatched(!!data?.watched.includes(movieId));
		setRating(data?.ratings.find((r) => r.movie_id === movieId)?.score ?? 0);
	}, [data, movieId]);

	/** 未登录就提示 + 带着当前页面跳登录页，登录完自动跳回来 */
	const ensureLoggedIn = (): boolean => {
		if (isAuthenticated) return true;
		toast.error(t("pleaseLogin"));
		router.push(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
		return false;
	};

	const reportFailure = (error: unknown) => {
		toast.error(t("actionFailed"));
		// access token 过期的情况 baseQuery 已经自动刷新重试过了，
		// 走到这里说明 refresh 也失效了，只能重新登录
		if (isUnauthorized(error)) {
			router.push(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
		}
	};

	/** 收藏 / 看过共用：乐观切换 → 上报 → 失败回滚 */
	const toggle = async (
		eventType: "favorite" | "watch",
		current: boolean,
		apply: (value: boolean) => void,
		added: string,
		removed: string,
	) => {
		if (!ensureLoggedIn()) return;

		const next = !current;
		apply(next);

		try {
			await recordEvent({
				movieId,
				eventType,
				// 后端按「最新一条 wins」还原开关状态，所以要把这次是开还是关记下来
				context: { action: next ? "add" : "remove" },
			}).unwrap();
			toast.success(next ? added : removed);
		} catch (error) {
			apply(!next);
			reportFailure(error);
		}
	};

	const rate = async (stars: number) => {
		if (!ensureLoggedIn()) return;
		if (stars === rating) return; // 重复点同一颗星不重复上报

		const previous = rating;
		setRating(stars);

		try {
			await recordEvent({ movieId, eventType: "rating", score: stars }).unwrap();
			toast.success(t("rated", { stars }));
		} catch (error) {
			setRating(previous);
			reportFailure(error);
		}
	};

	const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
	const starClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
	const buttonClass =
		"grid place-items-center rounded-md p-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-default";

	// 悬停时按预览分点亮，鼠标移开后回到真实分数
	const litStars = hoverStars || rating;

	return (
		// 卡片本身是可点的（记 click 事件），操作条上的点击不该冒泡上去
		<div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
			<button
				type="button"
				aria-pressed={favorited}
				aria-label={t("favorite")}
				title={t("favorite")}
				onClick={() =>
					toggle(
						"favorite",
						favorited,
						setFavorited,
						t("favoriteAdded"),
						t("favoriteRemoved"),
					)
				}
				className={`${buttonClass} ${favorited ? "text-rose-500" : "text-slate-300 hover:text-rose-400"}`}
			>
				<svg
					viewBox="0 0 24 24"
					className={iconClass}
					fill={favorited ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
				</svg>
			</button>

			<button
				type="button"
				aria-pressed={watched}
				aria-label={t("watched")}
				title={t("watched")}
				onClick={() =>
					toggle("watch", watched, setWatched, t("watchedAdded"), t("watchedRemoved"))
				}
				className={`${buttonClass} ${watched ? "text-sky-500" : "text-slate-300 hover:text-sky-400"}`}
			>
				<svg
					viewBox="0 0 24 24"
					className={iconClass}
					fill={watched ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
			</button>

			{/* 评分：v1 只支持打分和改分，不支持取消 */}
			<div
				className="flex items-center"
				role="group"
				aria-label={t("rate")}
				onMouseLeave={() => setHoverStars(0)}
			>
				{[1, 2, 3, 4, 5].map((stars) => (
					<button
						key={stars}
						type="button"
						aria-label={t("rateStars", { stars })}
						title={t("rateStars", { stars })}
						onMouseEnter={() => setHoverStars(stars)}
						onClick={() => rate(stars)}
						className={`${buttonClass} ${litStars >= stars ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
					>
						<svg
							viewBox="0 0 24 24"
							className={starClass}
							fill={litStars >= stars ? "currentColor" : "none"}
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
						</svg>
					</button>
				))}
			</div>
		</div>
	);
}
