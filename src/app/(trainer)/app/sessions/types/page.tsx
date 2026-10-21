import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { SessionTypeForm, listSessionTypes } from "@/modules/scheduling";
import { money } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { requireContext } from "../../../_lib/context";
import { createSessionTypeAction } from "../actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getFormats } from "@/shared/i18n/server";

export default function SessionTypesPage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/sessions" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("common.zajecia_2")}
      </Link>
      <h1 className="mt-2 mb-2 text-2xl font-semibold">{t("common.rodzaje_zajec")}</h1>
      <p className="mb-6 text-zinc-600 dark:text-zinc-400">
        {t("trainer.sessionsTypesPage.rodzaj_zajec_okresla_czas_trwania_i_cene")}
      </p>
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <TypeList />
      </Suspense>
    </>
  );
}

async function TypeList() {
  const formats = await getFormats();
  const t = await getTranslations();
  const ctx = await requireContext();
  const result = await listSessionTypes(ctx, { includeArchived: true });
  if (!result.ok) throw new Error(result.error.message);
  const canWrite = hasPermission(ctx, "session_types.write");

  return (
    <div className="flex flex-col gap-6">
      {result.value.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t("trainer.sessionsTypesPage.nie_masz_jeszcze_rodzajow_zajec")}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {result.value.map((type) => (
            <li key={type.id}>
              <Link
                href={`/app/sessions/types/${type.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">
                  {type.name}
                  {type.archivedAt ? (
                    <span className="ml-2">
                      <Badge>{t("common.archiwum_2")}</Badge>
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {t("trainer.sessionsTypesPage.durationminutes_min_formatmoney", { durationMinutes: type.durationMinutes, formatMoney: formats.money(money(type.defaultPriceMinor, type.currency)) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <details>
          <summary className="cursor-pointer font-medium">{t("trainer.sessionsTypesPage.dodaj_rodzaj_zajec")}</summary>
          <div className="mt-4">
            <SessionTypeForm action={createSessionTypeAction} submitLabel={t("trainer.sessionsTypesPage.dodaj_rodzaj")} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
