import Link from "next/link";
import { AuthShell } from "../_components/auth-shell";
import { joinWithCodeAction } from "./actions";
import { JoinForm } from "./join-form";
import { useTranslations } from "next-intl";

export default function JoinPage() {
  const t = useTranslations();
  return (
    <AuthShell
      title={t("auth.invitePage.dolacz_do_panelu_klienta")}
      description={t("auth.invitePage.wpisz_kod_zaproszenia_od_swojego_trenera")}
      footer={
        <span>
          {t("common.masz_juz_konto")}{" "}
          <Link href="/login" className="underline">
            {t("common.zaloguj_sie")}
          </Link>
        </span>
      }
    >
      <JoinForm action={joinWithCodeAction} />
    </AuthShell>
  );
}
