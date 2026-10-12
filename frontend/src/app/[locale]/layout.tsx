import "@/styles/globals.css";
import { AppProviders } from "./providers";
import ReactHotToast from "./react-hot-toast";
import NavBar from "@/components/nav-bar";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

type Props = {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
	// Ensure that the incoming `locale` is valid
	const { locale } = await params;
	if (!routing.locales.includes(locale as any)) {
		notFound();
	}

	// Providing all messages to the client side
	const messages = await getMessages();

	return (
		<html lang={locale} dir="ltr">
			<body className="flex min-h-screen flex-col">
				<NextIntlClientProvider messages={messages}>
					<AppProviders>
						{/* 键盘用户跳过导航直达正文 */}
						<a
							href="#main"
							className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
						>
							Skip to content
						</a>
						<NavBar />
						<main id="main" className="flex-1">
							{children}
						</main>
						<footer className="border-t border-slate-200/70 py-6 text-center text-xs text-slate-400">
							FilmRec · Content-based Movie Recommender
						</footer>
						<ReactHotToast />
					</AppProviders>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
