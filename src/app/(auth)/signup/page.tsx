import Link from "next/link";
import { Suspense } from "react";
import { LOGIN_NEXT_PREFIXES, getSignupMode, safeNextPath } from "@/modules/core";
import { createUserClient } from "@/shared/supabase/server";
import { AuthShell } from "../_components/auth-shell";
import { signupAction } from "./actions";
import { SignupForm } from "./signup-form";
import { useTranslations } from "next-intl";

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  const t = useTranslations();
  return (
    <AuthShell
      title={t("common.zaloz_konto")}
      description={t("auth.signupPage.po_zalozeniu_konta_utworzysz_swoja")}
      footer={
        <span>
          {t("common.masz_juz_konto")}{" "}
          <Link href="/login" className="underline">
            {t("common.zaloguj_sie")}
          </Link>
        </span>
      }
    >
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <SignupFormWithNext searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function SignupFormWithNext({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const { next } = await searchParams;
  const raw = Array.isArray(next) ? next[0] : next;
  const mode = await getSignupMode(await createUserClient());
  return <SignupForm action={signupAction} next={safeNextPath(raw, LOGIN_NEXT_PREFIXES, "")} requireCode={mode === "closed"} />;
}
