import Link from "next/link";
import { Suspense } from "react";
import { LOGIN_NEXT_PREFIXES, safeNextPath } from "@/modules/core";
import { AuthShell } from "../_components/auth-shell";
import { loginAction } from "./actions";
import { LoginForm } from "./login-form";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = useTranslations();
  return (
    <AuthShell
      title={t("auth.loginPage.logowanie")}
      footer={
        <>
          <Link href="/forgot-password" className="underline">
            {t("auth.loginPage.nie_pamietasz_hasla")}
          </Link>
          <span>
            {t("auth.loginPage.nie_masz_konta")}{" "}
            <Link href="/signup" className="underline">
              {t("common.zaloz_konto")}
            </Link>
          </span>
        </>
      }
    >
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <LoginFormWithNext searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginFormWithNext({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next, expired } = await searchParams;
  const raw = Array.isArray(next) ? next[0] : next;
  const t = await getTranslations();
  return (
    <>
      {expired === "1" ? (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t("auth.loginPage.session_expired")}
        </p>
      ) : null}
      <LoginForm action={loginAction} next={safeNextPath(raw, LOGIN_NEXT_PREFIXES, "")} />
    </>
  );
}
