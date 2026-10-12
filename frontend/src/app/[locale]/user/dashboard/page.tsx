"use client";

import { useTranslations } from "next-intl";
import { useUsers } from "@/features/users/hooks/use-users.hook";

const DashboardPage = () => {
	const { userPayload, loading, error } = useUsers();
	const t = useTranslations("DashboardPage");

	// 顺序很重要：要先 loading，否则请求返回前会先闪一个空白页
	if (loading) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<div className="flex items-center gap-3 text-slate-500">
					<span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
					{t("loading")}
				</div>
			</div>
		);
	}

	if (error || !userPayload) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center px-4">
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
					{t("error")} {error}
				</div>
			</div>
		);
	}

	const { user } = userPayload;
	const rows = [
		{ label: t("name"), value: user.name },
		{ label: t("email"), value: user.email },
		{ label: t("userId"), value: user.id },
		{ label: t("role"), value: user.role },
	];

	return (
		<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
			<header className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
				<p className="mt-1.5 text-sm text-slate-600">{t("subtitle")}</p>
			</header>

			{/* 欢迎条 */}
			<div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 p-6 text-white shadow-soft sm:p-8">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"
				/>
				<div className="relative flex items-center gap-4">
					<span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-2xl font-bold ring-1 ring-white/25">
						{user.name.slice(0, 1).toUpperCase()}
					</span>
					<div>
						<h2 className="text-xl font-semibold">
							{t("welcomeBack", { name: user.name })}
						</h2>
						<p className="mt-0.5 text-sm text-white/80">{t("successMessage")}</p>
					</div>
				</div>
			</div>

			{/* 个人信息 */}
			<section className="card mt-6 p-6">
				<h2 className="mb-4 text-base font-semibold text-slate-900">
					{t("profileInfo")}
				</h2>
				<dl className="grid gap-4 sm:grid-cols-2">
					{rows.map((row) => (
						<div key={row.label} className="min-w-0">
							<dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
								{row.label}
							</dt>
							<dd className="mt-1 truncate text-sm font-medium text-slate-900">
								{row.value}
							</dd>
						</div>
					))}
				</dl>
			</section>
		</div>
	);
};

export default DashboardPage;
