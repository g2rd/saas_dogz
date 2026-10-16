import Link from "next/link";
import { Suspense } from "react";
import { CLIENT_STATUS_LABELS, clientFullName, listClients } from "@/modules/clients";
import { requireContext } from "../../_lib/context";

export default function ClientsPage({ searchParams }: PageProps<"/app/clients">) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Klienci</h1>
        <Link
          href="/app/clients/new"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-medium text-background"
        >
          Dodaj klienta
        </Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-zinc-500">Ładowanie...</p>}>
        <ClientList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function ClientList({ searchParams }: Pick<PageProps<"/app/clients">, "searchParams">) {
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
          placeholder="Szukaj po imieniu, nazwisku, e-mailu lub telefonie"
          className="h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} />
          Pokaż archiwalnych
        </label>
        <button type="submit" className="h-11 rounded-full border border-zinc-300 px-5 dark:border-zinc-700">
          Szukaj
        </button>
      </form>

      {clients.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {q ? "Brak klientów pasujących do wyszukiwania." : "Nie masz jeszcze klientów. Dodaj pierwszego."}
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
                  {client.archivedAt ? <span className="ml-2 text-sm text-zinc-500">(archiwum)</span> : null}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {[client.phone, client.email].filter(Boolean).join(" · ") || CLIENT_STATUS_LABELS[client.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
