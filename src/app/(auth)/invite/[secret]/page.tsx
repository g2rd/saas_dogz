import Link from "next/link";
import { Suspense } from "react";
import { getSessionUser } from "@/modules/core";
import { lookupInvitation } from "@/modules/invitations";
import { money } from "@/shared/money";
import { createUserClient } from "@/shared/supabase/server";
import { AuthShell } from "../../_components/auth-shell";
import { acceptInviteAction, inviteSignupAction } from "../actions";
import { AcceptInviteForm, InviteSignupForm } from "./invite-forms";
import { Msg } from "@/shared/ui/msg";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getFormats } from "@/shared/i18n/server";

type Props = PageProps<"/invite/[secret]">;

export default function InvitePage({ params }: Props) {
  const t = useTranslations();
  return (
    <AuthShell
      title={t("auth.invitePage.zaproszenie_do_panelu_klienta")}
      footer={
        <Link href="/invite" className="underline">
          {t("auth.invitePage.wpisz_kod_recznie")}
        </Link>
      }
    >
      <Suspense fallback={<p className="text-zinc-500">{t("common.sprawdzanie_zaproszenia")}</p>}>
        <InviteContent params={params} />
      </Suspense>
    </AuthShell>
  );
}

const STATUS_KEYS = {
  not_found: "auth.invitePage.status_not_found",
  used: "auth.invitePage.status_used",
  revoked: "auth.invitePage.status_revoked",
  expired: "auth.invitePage.status_expired",
} as const;

async function InviteContent({ params }: Pick<Props, "params">) {
  const formats = await getFormats();
  const t = await getTranslations();
  const { secret: rawSecret } = await params;
  const secret = decodeURIComponent(rawSecret);

  const db = await createUserClient();
  const preview = await lookupInvitation(db, secret);

  if (!preview.ok) {
    return (
      <p role="alert" className="text-sm text-red-600">
        <Msg text={preview.error.message} />
      </p>
    );
  }
  if (preview.value.status !== "valid") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm">
          {t(STATUS_KEYS[preview.value.status])}
        </p>
        <Link href="/login" className="text-sm underline">
          {t("common.przejdz_do_logowania")}
        </Link>
      </div>
    );
  }

  const invitation = preview.value;
  const user = await getSessionUser();

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p>
          {invitation.clientFirstName
            ? t.rich("auth.invitePage.intro_named", { strong: (chunks) => <strong>{chunks}</strong>, organization: invitation.organizationName, name: invitation.clientFirstName })
            : t.rich("auth.invitePage.intro", { strong: (chunks) => <strong>{chunks}</strong>, organization: invitation.organizationName })}
        </p>
        {invitation.package ? (
          <p className="mt-3 text-sm">
            {t.rich("auth.invitePage.package_line", {
              strong: (chunks) => <strong>{chunks}</strong>,
              name: invitation.package.name,
              sessions: t("common.sessions_count", { count: invitation.package.sessionsTotal }),
              price: formats.money(money(invitation.package.priceMinor, invitation.package.currency)),
            })}
          </p>
        ) : null}
      </div>

      {user.ok ? (
        <AcceptInviteForm action={acceptInviteAction.bind(null, secret)} email={user.value.email} />
      ) : (
        <>
          <InviteSignupForm
            action={inviteSignupAction.bind(null, secret)}
            secret={secret}
            emailHint={invitation.emailHint}
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("common.masz_juz_konto")}{" "}
            <Link href={`/login?next=${encodeURIComponent(`/invite/${secret}`)}`} className="underline">
              {t("common.zaloguj_sie")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
