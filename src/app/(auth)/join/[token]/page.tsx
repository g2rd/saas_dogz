import Link from "next/link";
import { Suspense } from "react";
import { getSessionUser } from "@/modules/core";
import { lookupMemberInvitation } from "@/modules/invitations";
import { createUserClient } from "@/shared/supabase/server";
import { AuthShell } from "../../_components/auth-shell";
import { AcceptInviteForm, InviteSignupForm } from "../../invite/[secret]/invite-forms";
import { acceptJoinAction, joinSignupAction } from "../actions";
import { Msg } from "@/shared/ui/msg";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

type Props = PageProps<"/join/[token]">;

export default function JoinPage({ params }: Props) {
  const t = useTranslations();
  return (
    <AuthShell title={t("auth.joinPage.zaproszenie_do_zespolu")}>
      <Suspense fallback={<p className="text-zinc-500">{t("common.sprawdzanie_zaproszenia")}</p>}>
        <JoinContent params={params} />
      </Suspense>
    </AuthShell>
  );
}

const STATUS_KEYS = {
  not_found: "auth.joinPage.status_not_found",
  used: "auth.joinPage.status_used",
  revoked: "auth.joinPage.status_revoked",
  expired: "auth.joinPage.status_expired",
} as const;

async function JoinContent({ params }: Pick<Props, "params">) {
  const t = await getTranslations();
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken);

  const db = await createUserClient();
  const preview = await lookupMemberInvitation(db, token);

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
          {t.rich("auth.joinPage.invited", {
            strong: (chunks) => <strong>{chunks}</strong>,
            organization: invitation.organizationName,
            role: t(`labels.memberRole.${invitation.role}`),
          })}
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t("auth.joinPage.zaproszenie_dotyczy_adresu_emailhint", { emailHint: invitation.emailHint })}
        </p>
      </div>

      {user.ok ? (
        <AcceptInviteForm action={acceptJoinAction.bind(null, token)} email={user.value.email} />
      ) : (
        <>
          <InviteSignupForm
            action={joinSignupAction.bind(null, token)}
            secret={token}
            emailHint={invitation.emailHint}
            basePath="/join"
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("common.masz_juz_konto")}{" "}
            <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`} className="underline">
              {t("common.zaloguj_sie")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
