"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = {
	zh: "🇨🇳 中文",
	en: "🇬🇧 EN",
};

export default function LanguageSwitcher() {
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();

	const switchLanguage = (newLocale: string) => {
		router.push(pathname, { locale: newLocale });
	};

	return (
		<div
			role="group"
			aria-label="Language"
			className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1"
		>
			{routing.locales.map((loc) => {
				const active = locale === loc;
				return (
					<button
						key={loc}
						type="button"
						onClick={() => switchLanguage(loc)}
						aria-pressed={active}
						className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
							active
								? "bg-white text-brand-700 shadow-sm"
								: "text-slate-500 hover:text-slate-800"
						}`}
					>
						{LABELS[loc] ?? loc.toUpperCase()}
					</button>
				);
			})}
		</div>
	);
}
