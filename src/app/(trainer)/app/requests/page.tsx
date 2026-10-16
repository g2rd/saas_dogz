import Link from "next/link";
import { Suspense } from "react";
import {
  REQUEST_ACTION_LABELS,
  REQUEST_STATUS_LABELS,
  listClientRequests,
  type ClientRequest,
} from "@/modules/notifications";
import { Badge } from "@/shared/ui/badge";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../_lib/context";
import { markRequestSeenAction } from "../notifications/actions";

export default function RequestsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Prośby klientów</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Odpowiedzi klientów na powiadomienia: odnowienie pakietu, deklaracja płatności, koniec współpracy.
      </p>
      <Suspense fallback={<p className="mt-4 text-zinc-500">Ładowanie...</p>}>
        <Requests />
      </Suspense>
    </>
  );
}

function RequestRow({ request }: { request: ClientRequest }) {
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
            {REQUEST_ACTION_LABELS[request.kind]}
          </Badge>
          <Badge tone={request.status === "new" ? "warning" : "neutral"}>{REQUEST_STATUS_LABELS[request.status]}</Badge>
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {details ? `${details} · ` : ""}
          {request.createdAt.toLocaleString("pl-PL")}
        </p>
      </div>
      {request.status === "new" ? (
        <form action={markRequestSeenAction.bind(null, request.id)}>
          <SubmitButton variant="secondary" pendingLabel="Zapisywanie...">
            Oznacz jako obejrzaną
          </SubmitButton>
        </form>
      ) : null}
    </li>
  );
}

async function Requests() {
  const ctx = await requireContext();
  const result = await listClientRequests(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const open = result.value.filter((r) => r.status === "new");
  const done = result.value.filter((r) => r.status === "seen");

  return (
    <section className="mt-6 flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">Nowe</h2>
        {open.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Brak nowych próśb.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {open.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </ul>
        )}
      </div>
      {done.length > 0 ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Obejrzane</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {done.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
