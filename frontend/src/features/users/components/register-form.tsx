"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { registerSchema } from "../schema/auth.schema";
import { RegisterInput } from "../types/RegisterInput";
import { useAuth } from "../hooks/use-auth.hook";
import { Link } from "@/i18n/navigation";

export function RegisterForm() {
	const { registerRequest } = useAuth();
	const t = useTranslations("RegisterPage");

	const { register, handleSubmit, formState } = useForm<RegisterInput>({
		resolver: zodResolver(registerSchema),
	});

	return (
		<div className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
			<div className="card p-6 sm:p-8">
				<header className="mb-6 text-center">
					<h1 className="text-2xl font-bold tracking-tight text-slate-900">
						{t("title")}
					</h1>
					<p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
				</header>

				<form
					onSubmit={handleSubmit(
						async (data) => await registerRequest(data.name, data.email, data.password),
					)}
					className="space-y-4"
					noValidate
				>
					<div>
						<label htmlFor="register-name" className="label">
							{t("nameLabel")}
						</label>
						<input
							id="register-name"
							autoComplete="nickname"
							{...register("name")}
							placeholder={t("namePlaceholder")}
							aria-invalid={!!formState.errors.name}
							className="input"
						/>
						{formState.errors.name && (
							<p role="alert" className="mt-1.5 text-sm text-rose-600">
								{formState.errors.name.message}
							</p>
						)}
					</div>

					<div>
						<label htmlFor="register-email" className="label">
							{t("emailLabel")}
						</label>
						<input
							id="register-email"
							type="email"
							autoComplete="email"
							{...register("email")}
							placeholder={t("emailPlaceholder")}
							aria-invalid={!!formState.errors.email}
							className="input"
						/>
						{formState.errors.email && (
							<p role="alert" className="mt-1.5 text-sm text-rose-600">
								{formState.errors.email.message}
							</p>
						)}
					</div>

					<div>
						<label htmlFor="register-password" className="label">
							{t("passwordLabel")}
						</label>
						<input
							id="register-password"
							type="password"
							autoComplete="new-password"
							{...register("password")}
							placeholder={t("passwordPlaceholder")}
							aria-invalid={!!formState.errors.password}
							className="input"
						/>
						{formState.errors.password && (
							<p role="alert" className="mt-1.5 text-sm text-rose-600">
								{formState.errors.password.message}
							</p>
						)}
					</div>

					<button
						type="submit"
						disabled={formState.isSubmitting}
						className="btn btn-primary w-full"
					>
						{formState.isSubmitting ? t("buttonLoading") : t("buttonTXT")}
					</button>
				</form>
			</div>

			<p className="mt-5 text-center text-sm text-slate-500">
				{t("haveAccount")}{" "}
				<Link
					href="/auth/login"
					className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
				>
					{t("goLogin")}
				</Link>
			</p>
		</div>
	);
}
