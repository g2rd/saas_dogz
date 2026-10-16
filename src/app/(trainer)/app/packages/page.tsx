import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { listTemplates } from "@/modules/packages";
import { formatMoney, money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../_lib/context";

export default function PackagesPage({ searchParams }: PageProps<"/app/packages">) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Pakiety</h1>
        <Link
          href="/app/packages/new"
          className="inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-6 font-medium text-primary-foreground"
        >
          Nowy szablon
        </Link>
      </div>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Szablony pakietów, z których sprzedajesz zajęcia klientom. Cenę i ważność możesz zmienić przy sprzedaży.
      </p>
      <Suspense fallback={<p className="mt-6 text-zinc-500">Ładowanie...</p>}>
        <TemplateList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TemplateList({ searchParams }: Pick<PageProps<"/app/packages">, "searchParams">) {
  const params = await searchParams;
  const showArchived = (Array.isArray(params.archived) ? params.archived[0] : params.archived) === "1";

  const ctx = await requireContext();
  const result = await listTemplates(ctx, { includeArchived: showArchived });
  if (!result.ok) throw new Error(result.error.message);
  const templates = result.value;
  const canWrite = hasPermission(ctx, "packages.write");

  return (
    <div className="mt-6 flex flex-col gap-4">
      {templates.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          Nie masz jeszcze szablonów pakietów. {canWrite ? "Dodaj pierwszy, np. „Pakiet 10 zajęć”." : ""}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                href={`/app/packages/${template.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">
                  {template.name}
                  {template.archivedAt ? <span className="ml-2"><Badge>archiwum</Badge></span> : null}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {template.sessionsCount} zajęć · {formatMoney(money(template.priceMinor, template.currency))} ·{" "}
                  {template.validityDays ? `${template.validityDays} dni` : "bez terminu"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={showArchived ? "/app/packages" : "/app/packages?archived=1"}
        className="text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        {showArchived ? "Ukryj archiwalne" : "Pokaż archiwalne"}
      </Link>
    </div>
  );
}
