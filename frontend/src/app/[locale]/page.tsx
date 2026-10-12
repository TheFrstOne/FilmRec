"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useUsers } from "@/features/users/hooks/use-users.hook";

const FEATURES = [
	{ key: "feature1", icon: "🧭", tint: "from-brand-500/10 to-brand-500/0" },
	{ key: "feature2", icon: "🧊", tint: "from-indigo-500/10 to-indigo-500/0" },
	{ key: "feature3", icon: "♻️", tint: "from-sky-500/10 to-sky-500/0" },
] as const;

export default function HomePage() {
	const t = useTranslations("HomePage");
	const { userPayload } = useUsers();
	const isAdmin = userPayload?.user.role === "admin";

	return (
		<div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
			{/* HERO */}
			<section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white px-6 py-14 text-center shadow-soft sm:px-12 sm:py-20">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl"
				/>

				<div className="relative flex flex-col items-center gap-6">
					<span className="badge">{t("badge")}</span>
					<h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
						{t("welcome")}
					</h1>
					<p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
						{t("description")}
					</p>
					<div className="mt-2 flex flex-col gap-3 sm:flex-row">
						<Link href="/movies" className="btn btn-primary px-6 py-3">
							{t("browseMovies")}
						</Link>
						<Link href="/recommend" className="btn btn-secondary px-6 py-3">
							{t("getRecommendations")}
						</Link>
					</div>
				</div>
			</section>

			{/* FEATURES */}
			<section className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{FEATURES.map(({ key, icon, tint }) => (
					<article key={key} className="card card-hover relative overflow-hidden p-6">
						<div
							aria-hidden="true"
							className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tint}`}
						/>
						<div className="relative">
							<span className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-xl shadow-sm">
								{icon}
							</span>
							<h2 className="mt-4 text-base font-semibold text-slate-900">
								{t(`${key}Title`)}
							</h2>
							<p className="mt-2 text-sm leading-relaxed text-slate-600">
								{t(`${key}Desc`)}
							</p>
						</div>
					</article>
				))}
			</section>

			{/* 管理员入口：仅角色为 admin 时出现 */}
			{isAdmin && (
				<Link
					href="/admin/dashboard"
					className="card card-hover mt-10 flex items-center justify-between gap-4 p-6"
				>
					<div>
						<h2 className="text-base font-semibold text-slate-900">
							{t("adminDashboard")}
						</h2>
						<p className="mt-1 text-sm text-slate-600">
							{t("adminDashboardDescription")}
						</p>
					</div>
					<span aria-hidden="true" className="text-2xl text-brand-600">
						→
					</span>
				</Link>
			)}
		</div>
	);
}
