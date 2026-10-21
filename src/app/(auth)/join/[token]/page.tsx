import Link from "next/link";
import { Suspense } from "react";
import { getSessionUser } from "@/modules/core";
import { MEMBER_ROLE_LABELS, lookupMemberInvitation } from "@/modules/invitations";
import { createUserClient } from "@/shared/supabase/server";
import { AuthShell } from "../../_components/auth-shell";
import { AcceptInviteForm, InviteSignupForm } from "../../invite/[secret]/invite-forms";
import { acceptJoinAction, joinSignupAction } from "../actions";
import { Msg } from "@/shared/ui/msg";

type Props = PageProps<"/join/[token]">;

export default function JoinPage({ params }: Props) {
  return (
    <AuthShell title="Zaproszenie do zespołu">
      <Suspense fallback={<p className="text-zinc-500">Sprawdzanie zaproszenia...</p>}>
        <JoinContent params={params} />
      </Suspense>
    </AuthShell>
  );
}

const STATUS_MESSAGES = {
  not_found: "Nie znaleziono zaproszenia. Sprawdź link i spróbuj ponownie.",
  used: "To zaproszenie zostało już użyte. Jeśli masz konto, zaloguj się.",
  revoked: "To zaproszenie zostało odwołane. Poproś o nowe.",
  expired: "To zaproszenie wygasło. Poproś o nowe.",
} as const;

async function JoinContent({ params }: Pick<Props, "params">) {
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
          {STATUS_MESSAGES[preview.value.status]}
        </p>
        <Link href="/login" className="text-sm underline">
          Przejdź do logowania
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
          <strong>{invitation.organizationName}</strong> zaprasza Cię do zespołu w roli:{" "}
          <strong>{MEMBER_ROLE_LABELS[invitation.role]}</strong>.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Zaproszenie dotyczy adresu {invitation.emailHint}. Załóż konto lub zaloguj się właśnie na ten adres.
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
            Masz już konto?{" "}
            <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`} className="underline">
              Zaloguj się
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
