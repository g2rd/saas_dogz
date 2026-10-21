import Link from "next/link";
import { Suspense } from "react";
import { clientFullName, listClients } from "@/modules/clients";
import { requireContext } from "../../_lib/context";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

export default function ClientsPage({ searchParams }: PageProps<"/app/clients">) {
  const t = useTranslations();
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("common.klienci_2")}</h1>
        <Link
          href="/app/clients/new"
          className="inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-6 font-medium text-primary-foreground"
        >
          {t("common.dodaj_klienta")}
        </Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-zinc-500">{t("common.ladowanie")}</p>}>
        <ClientList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function ClientList({ searchParams }: Pick<PageProps<"/app/clients">, "searchParams">) {
  const t = await getTranslations();
  const params = await searchParams;
  const q = first(params.q);
  const showArchived = first(params.archived) === "1";

  const ctx = await requireContext();
  const result = await listClients(ctx, { search: q, includeArchived: showArchived });
  if (!result.ok) throw new Error(result.error.message);
  const clients = result.value;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <form className="flex flex-wrap items-center gap-3" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder={t("trainer.clientsPage.szukaj_po_imieniu_nazwisku_e_mailu_lub")}
          className="h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} />
          {t("trainer.clientsPage.pokaz_archiwalnych")}
        </label>
        <button type="submit" className="h-11 rounded-full border border-zinc-300 px-5 dark:border-zinc-700">
          {t("trainer.clientsPage.szukaj")}
        </button>
      </form>

      {clients.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {q
            ? t("trainer.clientsPage.brak_klientow_pasujacych_do_wyszukiwania")
            : showArchived
              ? t("trainer.clientsPage.brak_klientow_dodaj_pierwszego")
              : t("trainer.clientsPage.brak_aktywnych_klientow_dodaj_nowego_albo")}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/app/clients/${client.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">
                  {clientFullName(client)}
                  {client.archivedAt ? <span className="ml-2 text-sm text-zinc-500">{t("common.archiwum")}</span> : null}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {[client.phone, client.email].filter(Boolean).join(" · ") || t(`labels.clientStatus.${client.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
