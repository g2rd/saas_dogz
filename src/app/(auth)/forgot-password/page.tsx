import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "../_components/auth-shell";
import { forgotPasswordAction } from "./actions";
import { ForgotPasswordForm } from "./forgot-password-form";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const t = useTranslations();
  return (
    <AuthShell
      title={t("auth.forgotPasswordPage.reset_hasla")}
      description={t("auth.forgotPasswordPage.podaj_e_mail_konta_wyslemy_link_do")}
      footer={
        <Link href="/login" className="underline">
          {t("auth.forgotPasswordPage.wroc_do_logowania")}
        </Link>
      }
    >
      <Suspense fallback={null}>
        <LinkError searchParams={searchParams} />
      </Suspense>
      <ForgotPasswordForm action={forgotPasswordAction} />
    </AuthShell>
  );
}

async function LinkError({ searchParams }: Pick<PageProps<"/forgot-password">, "searchParams">) {
  const t = await getTranslations();
  const { error } = await searchParams;
  if (error !== "link") return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {t("auth.forgotPasswordPage.link_wygasl_lub_zostal_juz_uzyty_popros_o")}
    </p>
  );
}
