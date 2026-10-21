import { Suspense } from "react";
import { FEEDBACK_KIND_LABELS, listFeedback } from "@/modules/platform";
import { Badge } from "@/shared/ui/badge";
import { requireAdmin } from "../../_lib/context";
import { setFeedbackSeenAction } from "../actions";
import { formatDateTime } from "../format";

export const metadata = { title: "Opinie testerów" };

export default function FeedbackPage() {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <FeedbackList />
    </Suspense>
  );
}

async function FeedbackList() {
  const ctx = await requireAdmin();
  const result = await listFeedback(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const entries = result.value;
  const fresh = entries.filter((entry) => entry.status === "new").length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Opinie testerów</h1>
      <p className="text-sm text-zinc-600">
        Zgłoszenia z „Zgłoś problem lub pomysł” w obu panelach. Nowych: <strong>{fresh}</strong> z {entries.length}.
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-600">Nikt jeszcze niczego nie zgłosił.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-2 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={entry.kind === "problem" ? "danger" : entry.kind === "idea" ? "success" : "neutral"}>
                  {FEEDBACK_KIND_LABELS[entry.kind]}
                </Badge>
                {entry.status === "new" ? <Badge tone="warning">Nowe</Badge> : null}
                <span className="font-medium">{entry.organizationName}</span>
                <span className="text-zinc-600">
                  · {entry.audience === "client" ? "klient" : "personel"} · {entry.authorEmail ?? "brak adresu"}
                </span>
                <span className="ml-auto text-xs text-zinc-500">{formatDateTime(entry.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{entry.message}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                {entry.page ? <span>Ekran: {entry.page}</span> : null}
                {entry.locale ? <span>Język: {entry.locale}</span> : null}
                <form action={setFeedbackSeenAction.bind(null, entry.id, entry.status === "new")} className="ml-auto">
                  <button type="submit" className="underline">
                    {entry.status === "new" ? "Oznacz jako obejrzane" : "Oznacz jako nowe"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
