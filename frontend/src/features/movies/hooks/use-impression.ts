"use client";

import { RefObject, useEffect } from "react";
import { useRecordEventMutation } from "../api/events.api";

/**
 * 已经上报过曝光的电影。放在模块作用域（而不是组件里）是有意的：
 *   - StrictMode 开发时会挂载两次，组件内的 ref/state 会重置，这里不会
 *   - 同一部电影一会儿滚出视野、一会儿滚回来，也只记一次
 * 代价是刷新页面会重新计数，但那正是「一次会话一次曝光」的定义。
 */
const reported = new Set<number>();

/**
 * 卡片进入视野就算一次曝光（intersection 半个卡片可见），上报一次后断开观察。
 *
 * 埋点是纯锦上添花：没网 / 后端挂了都只 console.warn，绝不弹 toast 打扰用户。
 */
export function useImpression(
	ref: RefObject<Element | null>,
	movieId: number,
	source: string,
) {
	const [recordEvent] = useRecordEventMutation();

	useEffect(() => {
		const el = ref.current;
		if (!el || reported.has(movieId)) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;

				observer.disconnect();
				reported.add(movieId);

				recordEvent({
					movieId,
					eventType: "impression",
					context: { source },
				})
					.unwrap()
					.catch((error) => {
						// 失败就失败吧：能加载出页面说明后端是活的，
						// 偶发失败不值得重试，免得一次滚动打出一串重复曝光
						console.warn(`[events] 曝光上报失败 movie_id=${movieId}`, error);
					});
			},
			{ threshold: 0.5 },
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, [ref, movieId, source, recordEvent]);
}
