import Link from "next/link";
import { Suspense } from "react";
import { LOGIN_NEXT_PREFIXES, safeNextPath } from "@/modules/core";
import { AuthShell } from "../_components/auth-shell";
import { loginAction } from "./actions";
import { LoginForm } from "./login-form";
import { useTranslations } from "next-intl";

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
  const { next } = await searchParams;
  const raw = Array.isArray(next) ? next[0] : next;
  return <LoginForm action={loginAction} next={safeNextPath(raw, LOGIN_NEXT_PREFIXES, "")} />;
}
