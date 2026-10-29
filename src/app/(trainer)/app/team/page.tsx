import { ConfirmSubmit } from "@/shared/ui/confirm";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { MemberInviteForm, getTeam } from "@/modules/invitations";
import { Badge } from "@/shared/ui/badge";
import { BackLink } from "@/shared/ui/back-link";
import { requireContext } from "../../_lib/context";
import { inviteMemberAction, revokeMemberInvitationAction } from "./actions";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

export default function TeamPage() {
  const t = useTranslations();
  return (
    <>
      <BackLink href="/app/more">{t("common.back_to_more")}</BackLink>
      <h1 className="text-2xl font-semibold">{t("common.zespol")}</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-500">{t("common.ladowanie")}</p>}>
        <Team />
      </Suspense>
    </>
  );
}

async function Team() {
  const t = await getTranslations();
  const ctx = await requireContext();
  const formats = await getFormats();
  const result = await getTeam(ctx);
  if (!result.ok) {
    return <p className="mt-4 text-zinc-600 dark:text-zinc-400">{t("trainer.teamPage.nie_masz_uprawnien_do_przegladania_zespolu")}</p>;
  }
  const { members, pending } = result.value;
  const canInvite = hasPermission(ctx, "members.manage");
  // Administrator nie nadaje roli administratora
  const roles = ctx.role === "owner" ? (["admin", "trainer", "assistant"] as const) : (["trainer", "assistant"] as const);

  return (
    <section className="mt-6 flex flex-col gap-8">
      <div>
        <h2 className="mb-2 text-lg font-semibold">{t("trainer.teamPage.osoby_w_organizacji")}</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-medium">
                {member.name ?? (member.isYou ? t("trainer.teamPage.you_self") : t("trainer.teamPage.unnamed"))}
                {member.isYou && member.name ? <span className="font-normal text-zinc-500">{" "}{t("trainer.teamPage.ty")}</span> : null}
              </span>
              <span className="flex gap-2">
                <Badge>{t(`labels.memberRole.${member.role}`)}</Badge>
                {member.status === "suspended" ? <Badge tone="danger">{t("trainer.teamPage.zawieszony")}</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {canInvite ? (
        <>
          {pending.length > 0 ? (
            <div>
              <h2 className="mb-2 text-lg font-semibold">{t("trainer.teamPage.oczekujace_zaproszenia")}</h2>
              <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {pending.map((invitation) => (
                  <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="font-medium">{invitation.email}</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {" "}{t("trainer.teamPage.label_wazne_do_date", { label: t(`labels.memberRole.${invitation.role}`), date: formats.date(invitation.expiresAt) })}
                      </span>
                      {invitation.expired ? (
                        <>
                          {" "}
                          <Badge tone="danger">{t("trainer.teamPage.wygaslo")}</Badge>
                        </>
                      ) : null}
                    </span>
                    <form action={revokeMemberInvitationAction.bind(null, invitation.id)}>
                      <ConfirmSubmit
                        variant="danger"
                        title={t("trainer.teamPage.odwolac_zaproszenie")}
                        description={t("trainer.teamPage.link_wyslany_do_email_przestanie_dzialac", { email: invitation.email })}
                        confirmLabel={t("trainer.teamPage.odwolaj_zaproszenie")}
                        pendingLabel={t("common.odwolywanie")}
                      >
                        {t("trainer.teamPage.odwolaj")}
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h2 className="mb-2 text-lg font-semibold">{t("common.zapros_do_zespolu")}</h2>
            <MemberInviteForm action={inviteMemberAction} roles={roles} />
          </div>
        </>
      ) : null}
    </section>
  );
}
