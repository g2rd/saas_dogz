import { ConfirmSubmit } from "@/shared/ui/confirm";
import { hasPermission } from "@/modules/core";
import { InviteForm, getClientAccessInfo } from "@/modules/invitations";
import { listClientPackages } from "@/modules/packages";
import { money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../../_lib/context";
import { createInviteAction, deliverInviteAction, revokeAccessAction } from "./invite-actions";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";

/** Dostęp klienta do panelu: zaproszenie (link, QR, kod) i odbieranie dostępu. */
export async function AccessSection({
  clientId,
  clientEmail,
}: {
  clientId: string;
  clientEmail: string | null;
}) {
  const t = await getTranslations();
  const ctx = await requireContext();
  if (!hasPermission(ctx, "clients.write")) return null;
  const formats = await getFormats();

  const [info, packages] = await Promise.all([getClientAccessInfo(ctx, clientId), listClientPackages(ctx, clientId)]);
  if (!info.ok) return null;
  const { accounts, pending } = info.value;

  const packageOptions = (packages.ok ? packages.value : [])
    .filter((p) => p.status === "active")
    .map((p) => ({
      id: p.id,
      label: t("trainer.clientsAccessSection.name_sessionstotal_zajec_formatmoney", { name: p.name, sessionsTotal: p.sessionsTotal, formatMoney: formats.money(money(p.priceMinor, p.currency)) }),
    }));

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{t("common.panel_klienta")}</h2>

      {accounts.length > 0 ? (
        <ul className="mb-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {accounts.map((account) => (
            <li key={account.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">{t("trainer.clientsAccessSection.konto_z_dostepem_do_panelu")}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {" "}
                  · od {formats.date(account.since)} · {account.relation === "owner" ? t("trainer.clientsAccessSection.glowne") : t("trainer.clientsAccessSection.rodzina")}
                </span>
              </span>
              <form action={revokeAccessAction.bind(null, clientId, account.userId)}>
                <ConfirmSubmit
                  variant="danger"
                  title={t("trainer.clientsAccessSection.odebrac_dostep_do_panelu")}
                  description={t("trainer.clientsAccessSection.ta_osoba_przestanie_widziec_saldo_zajec")}
                  confirmLabel={t("trainer.clientsAccessSection.odbierz_dostep")}
                  pendingLabel={t("trainer.clientsAccessSection.odbieranie")}
                >
                  {t("trainer.clientsAccessSection.odbierz_dostep")}
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-zinc-600 dark:text-zinc-400">
          {t("trainer.clientsAccessSection.klient_nie_ma_jeszcze_dostepu_do_panelu_w")}
        </p>
      )}

      {pending ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={pending.expired ? "danger" : "warning"}>{pending.expired ? t("trainer.clientsAccessSection.zaproszenie_wygaslo") : t("trainer.clientsAccessSection.zaproszenie_czeka")}</Badge>
          <span className="text-zinc-600 dark:text-zinc-400">
            {t("trainer.clientsAccessSection.wyslane_date_wazne_do_date2_value_value2", { date: formats.date(pending.createdAt), date2: formats.date(pending.expiresAt), value: pending.packageName ? ` · pakiet „${pending.packageName}”` : "", value2: pending.email ? ` · dla ${pending.email}` : "" })}
          </span>
        </p>
      ) : null}

      <details>
        <summary className="cursor-pointer font-medium">
          {accounts.length > 0 || pending ? t("trainer.clientsAccessSection.nowe_zaproszenie_uniewaznia_poprzednie") : t("trainer.clientsAccessSection.zapros_klienta_do_panelu")}
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
