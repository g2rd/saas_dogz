import Link from "next/link";
import { Suspense } from "react";
import { getSessionUser } from "@/modules/core";
import { AuthShell } from "../_components/auth-shell";
import { resetPasswordAction } from "./actions";
import { ResetPasswordForm } from "./reset-password-form";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function ResetPasswordPage() {
  const t = useTranslations();
  return (
    <AuthShell title={t("common.nowe_haslo")} description={t("auth.resetPasswordPage.ustaw_nowe_haslo_do_swojego_konta")}>
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <ResetPasswordContent />
      </Suspense>
    </AuthShell>
  );
}

/** Formularz działa tylko z sesją z linku resetującego (ustawioną w /auth/callback). */
async function ResetPasswordContent() {
  const t = await getTranslations();
  const user = await getSessionUser();
  if (!user.ok) {
    return (
      <p className="text-sm">
        {t("auth.resetPasswordPage.link_wygasl_lub_nie_jest_juz_wazny")}{" "}
        <Link href="/forgot-password" className="underline">
          {t("auth.resetPasswordPage.popros_o_nowy")}
        </Link>
        .
      </p>
    );
  }
  return <ResetPasswordForm action={resetPasswordAction} />;
}
