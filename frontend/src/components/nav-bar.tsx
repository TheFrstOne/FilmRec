"use client";

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";
import { useAuth } from "@/features/users/hooks/use-auth.hook";
import { useUsers } from "@/features/users/hooks/use-users.hook";

const NAV_LINKS = [
	{ href: "/", key: "home" },
	{ href: "/movies", key: "movies" },
	{ href: "/recommend", key: "recommend" },
] as const;

export default function NavBar() {
	const t = useTranslations("NavBar");
	const pathname = usePathname();
	const [menuOpen, setMenuOpen] = useState(false);
	const { userPayload, loading, isAuthenticated } = useUsers();
	const { logoutRequest } = useAuth();

	const isAdmin = userPayload?.user.role === "admin";

	const isActive = (href: string) =>
		href === "/" ? pathname === "/" : pathname.startsWith(href);

	const linkClass = (href: string) =>
		[
			"rounded-lg px-3 py-2 text-sm font-medium transition-colors",
			isActive(href)
				? "bg-brand-50 text-brand-700"
				: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
		].join(" ");

	const closeMenu = () => setMenuOpen(false);

	return (
		<header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
			<nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
				{/* LOGO */}
				<Link
					href="/"
					onClick={closeMenu}
					className="flex shrink-0 items-center gap-2.5 rounded-lg"
				>
					<span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-lg shadow-sm">
						🎬
					</span>
					<span className="text-lg font-bold tracking-tight text-slate-900">
						{t("title")}
					</span>
				</Link>

				{/* 桌面端导航 */}
				<div className="hidden items-center gap-1 md:flex">
					{NAV_LINKS.map((link) => (
						<Link key={link.href} href={link.href} className={linkClass(link.href)}>
							{t(link.key)}
						</Link>
					))}
					{isAdmin && (
						<Link href="/admin/dashboard" className={linkClass("/admin/dashboard")}>
							{t("admin")}
						</Link>
					)}
				</div>

				{/* 桌面端右侧：账号 + 语言 */}
				<div className="hidden items-center gap-3 md:flex">
					{loading ? null : isAuthenticated && userPayload ? (
						<div className="flex items-center gap-2">
							<Link href="/user/library" className="btn btn-ghost">
								{t("library")}
							</Link>
							<Link
								href="/user/dashboard"
								className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-1 transition hover:border-slate-300 hover:bg-slate-50"
							>
								<span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
									{userPayload.user.name.slice(0, 1).toUpperCase()}
								</span>
								<span className="max-w-28 truncate text-sm font-medium text-slate-700">
									{userPayload.user.name}
								</span>
							</Link>
							<button
								type="button"
								onClick={() => logoutRequest()}
								className="btn btn-danger btn-sm"
							>
								{t("logout")}
							</button>
						</div>
					) : (
						<div className="flex items-center gap-2">
							<Link href="/auth/login" className="btn btn-ghost">
								{t("login")}
							</Link>
							<Link href="/auth/register" className="btn btn-primary btn-sm">
								{t("register")}
							</Link>
						</div>
					)}
					<LanguageSwitcher />
				</div>

				{/* 移动端汉堡按钮 */}
				<button
					type="button"
					onClick={() => setMenuOpen((v) => !v)}
					aria-expanded={menuOpen}
					aria-controls="mobile-menu"
					aria-label={t("menu")}
					className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 md:hidden"
				>
					<svg
						viewBox="0 0 24 24"
						className="h-5 w-5"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true"
					>
						{menuOpen ? (
							<path d="M6 6l12 12M18 6L6 18" />
						) : (
							<path d="M4 7h16M4 12h16M4 17h16" />
						)}
					</svg>
				</button>
			</nav>

			{/* 移动端下拉菜单 */}
			{menuOpen && (
				<div
					id="mobile-menu"
					className="border-t border-slate-200/70 bg-white px-4 pt-3 pb-5 md:hidden"
				>
					<div className="flex flex-col gap-1">
						{NAV_LINKS.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								onClick={closeMenu}
								className={linkClass(link.href)}
							>
								{t(link.key)}
							</Link>
						))}
						{isAdmin && (
							<Link
								href="/admin/dashboard"
								onClick={closeMenu}
								className={linkClass("/admin/dashboard")}
							>
								{t("admin")}
							</Link>
						)}
					</div>

					<div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
						{loading ? null : isAuthenticated && userPayload ? (
							<>
								<Link
									href="/user/library"
									onClick={closeMenu}
									className="btn btn-secondary justify-start"
								>
									{t("library")}
								</Link>
								<Link
									href="/user/dashboard"
									onClick={closeMenu}
									className="btn btn-secondary justify-start"
								>
									{t("dashboard")} · {userPayload.user.name}
								</Link>
								<button
									type="button"
									onClick={() => {
										closeMenu();
										logoutRequest();
									}}
									className="btn btn-danger justify-start"
								>
									{t("logout")}
								</button>
							</>
						) : (
							<>
								<Link
									href="/auth/login"
									onClick={closeMenu}
									className="btn btn-secondary justify-start"
								>
									{t("login")}
								</Link>
								<Link
									href="/auth/register"
									onClick={closeMenu}
									className="btn btn-primary justify-start"
								>
									{t("register")}
								</Link>
							</>
						)}
						<div className="pt-1">
							<LanguageSwitcher />
						</div>
					</div>
				</div>
			)}
		</header>
	);
}
