import { ConfirmSubmit } from "@/shared/ui/confirm";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { MEMBER_ROLE_LABELS, MemberInviteForm, getTeam } from "@/modules/invitations";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../_lib/context";
import { inviteMemberAction, revokeMemberInvitationAction } from "./actions";
import { getFormats } from "@/shared/i18n/server";

export default function TeamPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Zespół</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-500">Ładowanie...</p>}>
        <Team />
      </Suspense>
    </>
  );
}

async function Team() {
  const ctx = await requireContext();
  const formats = await getFormats();
  const result = await getTeam(ctx);
  if (!result.ok) {
    return <p className="mt-4 text-zinc-600 dark:text-zinc-400">Nie masz uprawnień do przeglądania zespołu.</p>;
  }
  const { members, pending } = result.value;
  const canInvite = hasPermission(ctx, "members.manage");
  // Administrator nie nadaje roli administratora
  const roles = ctx.role === "owner" ? (["admin", "trainer", "assistant"] as const) : (["trainer", "assistant"] as const);

  return (
    <section className="mt-6 flex flex-col gap-8">
      <div>
        <h2 className="mb-2 text-lg font-semibold">Osoby w organizacji</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-medium">
                {member.name}
                {member.isYou && member.name !== "Ty" ? <span className="font-normal text-zinc-500"> (Ty)</span> : null}
              </span>
              <span className="flex gap-2">
                <Badge>{MEMBER_ROLE_LABELS[member.role]}</Badge>
                {member.status === "suspended" ? <Badge tone="danger">Zawieszony</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {canInvite ? (
        <>
          {pending.length > 0 ? (
            <div>
              <h2 className="mb-2 text-lg font-semibold">Oczekujące zaproszenia</h2>
              <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {pending.map((invitation) => (
                  <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="font-medium">{invitation.email}</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {" "}
                        · {MEMBER_ROLE_LABELS[invitation.role]} · ważne do {formats.date(invitation.expiresAt)}
                      </span>
                      {invitation.expired ? (
                        <>
                          {" "}
                          <Badge tone="danger">Wygasło</Badge>
                        </>
                      ) : null}
                    </span>
                    <form action={revokeMemberInvitationAction.bind(null, invitation.id)}>
                      <ConfirmSubmit
                        variant="danger"
                        title="Odwołać zaproszenie?"
                        description={`Link wysłany do ${invitation.email} przestanie działać. Możesz zaprosić tę osobę ponownie.`}
                        confirmLabel="Odwołaj zaproszenie"
                        pendingLabel="Odwoływanie..."
                      >
                        Odwołaj
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h2 className="mb-2 text-lg font-semibold">Zaproś do zespołu</h2>
            <MemberInviteForm action={inviteMemberAction} roles={roles} />
          </div>
        </>
      ) : null}
    </section>
  );
}
