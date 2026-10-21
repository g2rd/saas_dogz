import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ACTIVITY_LABELS,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  activityLevel,
  getOrganizationOverview,
  getStatusHistory,
  type OrgStatus,
} from "@/modules/platform";
import { dateInZone, DEFAULT_TIMEZONE } from "@/shared/time";
import { Badge } from "@/shared/ui/badge";
import { requireAdmin } from "../../../_lib/context";
import { extendAccessAction, saveNotesAction, setStatusAction } from "../../actions";
import { ACTIVITY_TONES, STATUS_TONES, daysUntil, formatDate, formatDateTime, relativeDays } from "../../format";
import { ExtendForm, NotesForm, StatusForm } from "./org-forms";

export default function OrganizationPage({ params }: PageProps<"/admin/organizations/[id]">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <Details params={params} />
    </Suspense>
  );
}

async function Details({ params }: Pick<PageProps<"/admin/organizations/[id]">, "params">) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const org = await getOrganizationOverview(ctx, id);
  if (!org.ok) {
    if (org.error.code === "not_found") notFound();
    throw new Error(org.error.message);
  }
  const history = await getStatusHistory(ctx, id);
  const o = org.value;
  const now = ctx.now();
  const level = activityLevel(o.lastSignInAt, now);
  const left = daysUntil(o.accessUntil, now);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin" className="text-sm underline">
          ← Wszystkie szkoły
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{o.name}</h1>
        <p className="text-zinc-600">
          {o.ownerName ? `${o.ownerName} · ` : ""}
          {o.ownerEmail ?? "brak właściciela"} · założona {formatDate(o.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</Badge>
          {o.accessUntil ? (
            <span className={`text-sm ${left !== null && left <= 7 ? "text-amber-700" : "text-zinc-600"}`}>
              dostęp do {formatDate(o.accessUntil)}
              {left !== null ? (left >= 0 ? ` (za ${left} dni)` : ` (minął ${-left} dni temu)`) : ""}
            </span>
          ) : (
            <span className="text-sm text-zinc-600">bez terminu dostępu</span>
          )}
          <Badge tone={ACTIVITY_TONES[level]}>{ACTIVITY_LABELS[level]}</Badge>
        </div>
        {o.statusReason ? <p className="mt-2 text-sm text-zinc-700">Powód: {o.statusReason}</p> : null}
      </div>

      <section aria-label="Użycie" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Personel" value={`${o.activeStaff7d} / ${o.staffCount}`} hint="aktywnych w 7 dni / wszystkich" />
        <Metric label="Klienci" value={String(o.clientsCount)} hint={`+${o.newClients7d} w 7 dni`} />
        <Metric label="W panelu klienta" value={String(o.portalClientsCount)} hint="klienci z dostępem" />
        <Metric label="Zajęcia 7 / 30 dni" value={`${o.sessions7d} / ${o.sessions30d}`} />
        <Metric label="Ostatnie logowanie" value={relativeDays(o.lastSignInAt, now)} hint={o.lastSignInAt ? formatDateTime(o.lastSignInAt) : undefined} />
        <Metric label="Ostatnia aktywność" value={relativeDays(o.lastActivityAt, now)} />
        <Metric label="Powiadomienia (30 dni)" value={String(o.notifications30d)} />
        <Metric label="Urządzenia z push" value={String(o.pushDevices)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Dostęp</h2>
        <p className="text-sm text-zinc-600">{STATUS_DESCRIPTIONS[o.status as OrgStatus]}</p>
        <StatusForm
          action={setStatusAction.bind(null, o.id)}
          status={o.status === "archived" ? "suspended" : o.status}
          accessUntil={o.accessUntil ? dateInZone(o.accessUntil, DEFAULT_TIMEZONE) : ""}
          reason={o.statusReason ?? ""}
        />
        <ExtendForm action={extendAccessAction.bind(null, o.id)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Notatki</h2>
        <NotesForm action={saveNotesAction.bind(null, o.id)} notes={o.notes ?? ""} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Historia zmian</h2>
        {history.ok && history.value.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm">
            {history.value.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                <span>
                  {entry.action === "organization.access_expired" ? "Automat: dostęp wygasł. " : ""}
                  {entry.from ? `${STATUS_LABELS[entry.from as OrgStatus] ?? entry.from} → ` : ""}
                  <strong>{entry.to ? (STATUS_LABELS[entry.to as OrgStatus] ?? entry.to) : "zmiana terminu"}</strong>
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </span>
                <span className="text-zinc-500">{formatDateTime(entry.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">Brak zmian statusu.</p>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <p className="text-sm text-zinc-600">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
