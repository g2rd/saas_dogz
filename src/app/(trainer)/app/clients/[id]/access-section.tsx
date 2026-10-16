import { ConfirmSubmit } from "@/shared/ui/confirm";
import { hasPermission } from "@/modules/core";
import { InviteForm, getClientAccessInfo } from "@/modules/invitations";
import { listClientPackages } from "@/modules/packages";
import { formatMoney, money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../../_lib/context";
import { createInviteAction, deliverInviteAction, revokeAccessAction } from "./invite-actions";

/** Dostęp klienta do panelu: zaproszenie (link, QR, kod) i odbieranie dostępu. */
export async function AccessSection({
  clientId,
  clientEmail,
}: {
  clientId: string;
  clientEmail: string | null;
}) {
  const ctx = await requireContext();
  if (!hasPermission(ctx, "clients.write")) return null;

  const [info, packages] = await Promise.all([getClientAccessInfo(ctx, clientId), listClientPackages(ctx, clientId)]);
  if (!info.ok) return null;
  const { accounts, pending } = info.value;

  const packageOptions = (packages.ok ? packages.value : [])
    .filter((p) => p.status === "active")
    .map((p) => ({
      id: p.id,
      label: `${p.name}: ${p.sessionsTotal} zajęć, ${formatMoney(money(p.priceMinor, p.currency))}`,
    }));

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Panel klienta</h2>

      {accounts.length > 0 ? (
        <ul className="mb-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {accounts.map((account) => (
            <li key={account.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">Konto z dostępem do panelu</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {" "}
                  · od {account.since.toLocaleDateString("pl-PL")} · {account.relation === "owner" ? "główne" : "rodzina"}
                </span>
              </span>
              <form action={revokeAccessAction.bind(null, clientId, account.userId)}>
                <ConfirmSubmit
                  variant="danger"
                  title="Odebrać dostęp do panelu?"
                  description="Ta osoba przestanie widzieć saldo zajęć, płatności i terminy klienta. Aby wrócić, potrzebuje nowego zaproszenia."
                  confirmLabel="Odbierz dostęp"
                  pendingLabel="Odbieranie..."
                >
                  Odbierz dostęp
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-zinc-600 dark:text-zinc-400">
          Klient nie ma jeszcze dostępu do panelu, w którym zobaczy saldo zajęć, płatności i terminy.
        </p>
      )}

      {pending ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={pending.expired ? "danger" : "warning"}>{pending.expired ? "Zaproszenie wygasło" : "Zaproszenie czeka"}</Badge>
          <span className="text-zinc-600 dark:text-zinc-400">
            wysłane {pending.createdAt.toLocaleDateString("pl-PL")}, ważne do {pending.expiresAt.toLocaleDateString("pl-PL")}
            {pending.packageName ? ` · pakiet „${pending.packageName}”` : ""}
            {pending.email ? ` · dla ${pending.email}` : ""}. Kod i link są widoczne tylko tuż po utworzeniu.
          </span>
        </p>
      ) : null}

      <details>
        <summary className="cursor-pointer font-medium">
          {accounts.length > 0 || pending ? "Nowe zaproszenie (unieważnia poprzednie)" : "Zaproś klienta do panelu"}
        </summary>
        <div className="mt-4">
          <InviteForm
            action={createInviteAction.bind(null, clientId)}
            deliverAction={deliverInviteAction.bind(null, clientId)}
            packages={packageOptions}
            defaultEmail={clientEmail}
          />
        </div>
      </details>
    </section>
  );
}
