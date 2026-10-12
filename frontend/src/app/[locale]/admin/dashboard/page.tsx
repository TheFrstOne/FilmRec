"use client";

import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import {
	useActivateModelMutation,
	useGetAdminOverviewQuery,
	useGetModelsQuery,
} from "@/features/admin/api/admin.api";

function StatCard({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="card p-5">
			<p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
				{label}
			</p>
			<p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
		</div>
	);
}

export default function AdminDashboardPage() {
	const t = useTranslations("AdminPage");
	const { data, isLoading, isError } = useGetAdminOverviewQuery();
	const { data: models, isLoading: modelsLoading } = useGetModelsQuery();
	const [activateModel, { isLoading: activating }] = useActivateModelMutation();

	// 事件类型 -> 本地化文案（switch 保证 key 是字面量，下一行是兜底）
	const eventLabel = (type: string) => {
		switch (type) {
			case "impression":
				return t("typeImpression");
			case "click":
				return t("typeClick");
			case "favorite":
				return t("typeFavorite");
			case "rating":
				return t("typeRating");
			case "watch":
				return t("typeWatch");
			default:
				return type;
		}
	};

	const handleActivate = async (version: string) => {
		try {
			await activateModel(version).unwrap();
			toast.success(t("modelActivated", { version }));
		} catch {
			toast.error(t("error"));
		}
	};

	const trendMax = Math.max(
		1,
		...(data?.trend ?? []).map((d) => d.impressions + d.clicks + d.saves),
	);

	const eventEntries = Object.entries(data?.eventsByType ?? {}).sort(
		(a, b) => b[1] - a[1],
	);
	const eventMax = Math.max(1, ...eventEntries.map(([, v]) => v));
	const ctrValue = data ? `${(data.ctr * 100).toFixed(1)}%` : "—";

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
			<header className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
				<p className="mt-1.5 text-sm text-slate-600">{t("subtitle")}</p>
			</header>

			{isError && (
				<div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{t("error")}
				</div>
			)}

			{isLoading && (
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="card h-28 animate-pulse bg-slate-50" />
					))}
				</div>
			)}

			{data && (
				<>
					{/* 核心计数 */}
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
						<StatCard label={t("statUsers")} value={data.counts.users} />
						<StatCard label={t("statMovies")} value={data.counts.movies} />
						<StatCard label={t("statEvents")} value={data.counts.events} />
						<StatCard label={t("statRatings")} value={data.counts.ratings} />
						<StatCard label={t("statComments")} value={data.counts.comments} />
					</div>

					<div className="mt-6 grid gap-6 lg:grid-cols-3">
						{/* CTR */}
						<div className="card flex flex-col justify-center p-6">
							<p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
								{t("ctr")}
							</p>
							<p className="mt-2 text-4xl font-bold text-brand-700">{ctrValue}</p>
							<p className="mt-1 text-xs text-slate-400">{t("ctrHint")}</p>
						</div>

						{/* 行为分布 */}
						<div className="card p-6 lg:col-span-2">
							<h2 className="mb-4 text-sm font-semibold text-slate-900">
								{t("eventBreakdown")}
							</h2>
							{eventEntries.length === 0 ? (
								<p className="text-sm text-slate-400">{t("emptyData")}</p>
							) : (
								<ul className="space-y-3">
									{eventEntries.map(([type, count]) => (
										<li key={type} className="flex items-center gap-3 text-sm">
											<span className="w-24 shrink-0 text-slate-600">
												{eventLabel(type)}
											</span>
											<span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
												<span
													className="block h-full rounded-full bg-brand-500"
													style={{ width: `${(count / eventMax) * 100}%` }}
												/>
											</span>
											<span className="w-12 shrink-0 text-right font-medium text-slate-700">
												{count}
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>

					{/* 近 14 天趋势 */}
					<div className="card mt-6 p-6">
						<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
							<h2 className="text-sm font-semibold text-slate-900">{t("trendTitle")}</h2>
							<div className="flex items-center gap-4 text-xs text-slate-500">
								<span className="flex items-center gap-1.5">
									<span className="h-2.5 w-2.5 rounded-sm bg-brand-300" />
									{t("legendImpressions")}
								</span>
								<span className="flex items-center gap-1.5">
									<span className="h-2.5 w-2.5 rounded-sm bg-brand-600" />
									{t("legendClicks")}
								</span>
								<span className="flex items-center gap-1.5">
									<span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
									{t("legendSaves")}
								</span>
							</div>
						</div>

						{data.trend.length === 0 ? (
							<p className="text-sm text-slate-400">{t("emptyData")}</p>
						) : (
							<div className="flex items-end gap-1.5" style={{ height: 120 }}>
								{data.trend.map((day) => {
									const total = day.impressions + day.clicks + day.saves;
									const h = (total / trendMax) * 100;
									const seg = (v: number) => (total ? (v / total) * 100 : 0);
									return (
										<div
											key={day.date}
											className="group flex flex-1 flex-col items-center justify-end"
											style={{ height: "100%" }}
											title={`${day.date} · ${day.impressions}/${day.clicks}/${day.saves}`}
										>
											<div
												className="flex w-full flex-col justify-end overflow-hidden rounded-t-md"
												style={{ height: `${h}%`, minHeight: total ? 4 : 0 }}
											>
												<div
													className="w-full bg-emerald-400"
													style={{ height: `${seg(day.saves)}%` }}
												/>
												<div
													className="w-full bg-brand-600"
													style={{ height: `${seg(day.clicks)}%` }}
												/>
												<div
													className="w-full bg-brand-300"
													style={{ height: `${seg(day.impressions)}%` }}
												/>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>

					{/* 热门电影 */}
					<div className="card mt-6 overflow-hidden">
						<h2 className="border-b border-slate-100 px-6 py-4 text-sm font-semibold text-slate-900">
							{t("topMovies")}
						</h2>
						{data.topMovies.length === 0 ? (
							<p className="px-6 py-6 text-sm text-slate-400">{t("emptyData")}</p>
						) : (
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-xs tracking-wide text-slate-400 uppercase">
										<th className="px-6 py-2 font-medium">{t("colMovie")}</th>
										<th className="px-6 py-2 text-right font-medium">
											{t("colImpressions")}
										</th>
										<th className="px-6 py-2 text-right font-medium">{t("colClicks")}</th>
										<th className="px-6 py-2 text-right font-medium">{t("colEvents")}</th>
									</tr>
								</thead>
								<tbody>
									{data.topMovies.map((m) => (
										<tr key={m.movie_id} className="border-t border-slate-100">
											<td className="max-w-xs truncate px-6 py-2.5 text-slate-700">
												{m.title}
											</td>
											<td className="px-6 py-2.5 text-right text-slate-600">
												{m.impressions}
											</td>
											<td className="px-6 py-2.5 text-right text-slate-600">
												{m.clicks}
											</td>
											<td className="px-6 py-2.5 text-right font-medium text-slate-900">
												{m.events}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</>
			)}

			{/* 模型版本 */}
			<div className="card mt-6 overflow-hidden">
				<h2 className="border-b border-slate-100 px-6 py-4 text-sm font-semibold text-slate-900">
					{t("models")}
				</h2>
				{modelsLoading ? (
					<div className="h-24 animate-pulse bg-slate-50" />
				) : !models || models.length === 0 ? (
					<p className="px-6 py-6 text-sm text-slate-400">{t("noModels")}</p>
				) : (
					<ul className="divide-y divide-slate-100">
						{models.map((m) => (
							<li
								key={m.model_version}
								className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="font-mono text-sm font-semibold text-slate-900">
											{m.model_version}
										</span>
										{m.is_active && <span className="badge">{t("modelActive")}</span>}
									</div>
									<p className="mt-0.5 truncate text-xs text-slate-400">
										{m.model_name} · {m.trained_at ?? "—"}
									</p>
								</div>
								{!m.is_active && (
									<button
										type="button"
										disabled={activating}
										onClick={() => handleActivate(m.model_version)}
										className="btn btn-secondary btn-sm"
									>
										{t("modelActivate")}
									</button>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
