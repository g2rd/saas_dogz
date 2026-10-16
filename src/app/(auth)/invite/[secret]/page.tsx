import Link from "next/link";
import { Suspense } from "react";
import { getSessionUser } from "@/modules/core";
import { lookupInvitation } from "@/modules/invitations";
import { formatMoney, money } from "@/shared/money";
import { createUserClient } from "@/shared/supabase/server";
import { AuthShell } from "../../_components/auth-shell";
import { acceptInviteAction, inviteSignupAction } from "../actions";
import { AcceptInviteForm, InviteSignupForm } from "./invite-forms";

type Props = PageProps<"/invite/[secret]">;

export default function InvitePage({ params }: Props) {
  return (
    <AuthShell
      title="Zaproszenie do panelu klienta"
      footer={
        <Link href="/invite" className="underline">
          Wpisz kod ręcznie
        </Link>
      }
    >
      <Suspense fallback={<p className="text-zinc-500">Sprawdzanie zaproszenia...</p>}>
        <InviteContent params={params} />
      </Suspense>
    </AuthShell>
  );
}

const STATUS_MESSAGES = {
  not_found: "Nie znaleziono zaproszenia. Sprawdź kod lub link i spróbuj ponownie.",
  used: "To zaproszenie zostało już użyte. Jeśli masz konto, zaloguj się.",
  revoked: "To zaproszenie zostało unieważnione. Poproś trenera o nowe.",
  expired: "To zaproszenie wygasło. Poproś trenera o nowe.",
} as const;

async function InviteContent({ params }: Pick<Props, "params">) {
  const { secret: rawSecret } = await params;
  const secret = decodeURIComponent(rawSecret);

  const db = await createUserClient();
  const preview = await lookupInvitation(db, secret);

  if (!preview.ok) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {preview.error.message}
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
          <strong>{invitation.organizationName}</strong> zaprasza Cię do panelu klienta,
          {invitation.clientFirstName ? ` ${invitation.clientFirstName}` : ""}. Zobaczysz tam saldo zajęć, płatności z
          terminami i najbliższe treningi.
        </p>
        {invitation.package ? (
          <p className="mt-3 text-sm">
            Pakiet do potwierdzenia: <strong>{invitation.package.name}</strong>, {invitation.package.sessionsTotal} zajęć,{" "}
            {formatMoney(money(invitation.package.priceMinor, invitation.package.currency))}.
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
            Masz już konto?{" "}
            <Link href={`/login?next=${encodeURIComponent(`/invite/${secret}`)}`} className="underline">
              Zaloguj się
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
