import Link from "next/link";
import { Suspense } from "react";
import { listClientRequests, type ClientRequest } from "@/modules/notifications";
import { Badge } from "@/shared/ui/badge";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../_lib/context";
import { markRequestSeenAction } from "../notifications/actions";
import { getFormats } from "@/shared/i18n/server";
import type { Formats } from "@/shared/i18n/formats";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function RequestsPage() {
  const t = useTranslations();
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("trainer.requestsPage.prosby_klientow")}</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        {t("trainer.requestsPage.odpowiedzi_klientow_na_powiadomienia")}
      </p>
      <Suspense fallback={<p className="mt-4 text-zinc-500">{t("common.ladowanie")}</p>}>
        <Requests />
      </Suspense>
    </>
  );
}

function RequestRow({ request, formats }: { request: ClientRequest; formats: Formats }) {
  const t = useTranslations();
  const details = [request.packageName ? `Pakiet „${request.packageName}”` : null, request.chargeDescription, request.note]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div>
        <p className="flex flex-wrap items-center gap-2">
          <Link href={`/app/clients/${request.clientId}`} className="font-medium underline">
            {request.clientName}
          </Link>
          <Badge tone={request.kind === "end" ? "danger" : request.kind === "renew" ? "success" : "warning"}>
            {t(`labels.requestAction.${request.kind}`)}
          </Badge>
          <Badge tone={request.status === "new" ? "warning" : "neutral"}>{t(`labels.requestStatus.${request.status}`)}</Badge>
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {details ? `${details} · ` : ""}
          {formats.dateTime(request.createdAt)}
        </p>
      </div>
      {request.status === "new" ? (
        <form action={markRequestSeenAction.bind(null, request.id)}>
          <SubmitButton variant="secondary" pendingLabel={t("common.zapisywanie")}>
            {t("trainer.requestsPage.oznacz_jako_obejrzana")}
          </SubmitButton>
        </form>
      ) : null}
    </li>
  );
}

async function Requests() {
  const t = await getTranslations();
  const ctx = await requireContext();
  const formats = await getFormats();
  const result = await listClientRequests(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const open = result.value.filter((r) => r.status === "new");
  const done = result.value.filter((r) => r.status === "seen");

  return (
    <section className="mt-6 flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">{t("trainer.requestsPage.nowe")}</h2>
        {open.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("trainer.requestsPage.brak_nowych_prosb")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {open.map((r) => (
              <RequestRow key={r.id} request={r} formats={formats} />
            ))}
          </ul>
        )}
      </div>
      {done.length > 0 ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">{t("trainer.requestsPage.obejrzane")}</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {done.map((r) => (
              <RequestRow key={r.id} request={r} formats={formats} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
