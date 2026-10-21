import Link from "next/link";
import { Suspense } from "react";
import {
  ACTIVITY_LABELS,
  STATUS_LABELS,
  activityLevel,
  getSignupMode,
  listOrganizations,
  summarize,
  type OrganizationOverview,
  type OrgStatus,
} from "@/modules/platform";
import { Badge } from "@/shared/ui/badge";
import { requireAdmin } from "../_lib/context";
import { ACTIVITY_TONES, STATUS_TONES, daysUntil, formatDate, relativeDays } from "./format";

export default function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function Overview({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const ctx = await requireAdmin();
  const params = await searchParams;
  const query = first(params.q).trim().toLowerCase();
  const statusFilter = first(params.status);
  const now = ctx.now();

  const [orgs, mode] = await Promise.all([listOrganizations(ctx), getSignupMode(ctx)]);
  if (!orgs.ok) throw new Error(orgs.error.message);
  const all = orgs.value;
  const summary = summarize(all, now);

  const rows = all
    .filter((org) => (statusFilter ? org.status === statusFilter : true))
    .filter((org) =>
      query ? [org.name, org.slug, org.ownerEmail ?? "", org.ownerName ?? ""].some((v) => v.toLowerCase().includes(query)) : true,
    )
    .sort((a, b) => (b.lastSignInAt?.getTime() ?? 0) - (a.lastSignInAt?.getTime() ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Szkoły i użycie</h1>

      {mode.ok && mode.value === "open" ? (
        <Link href="/admin/codes" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <strong>Rejestracja jest otwarta dla każdego.</strong> Jeśli to środowisko dla wybranych testerów, zamknij ją i rozdawaj kody
          (Kody i rejestracja).
        </Link>
      ) : null}

      <section aria-label="Podsumowanie" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Szkoły" value={summary.organizations} hint={`${summary.byStatus.trial} próbnych · ${summary.byStatus.active} aktywnych`} />
        <Tile
          label="Aktywne w 7 dni"
          value={summary.activeOrganizations7d}
          hint={`${summary.activeStaff7d} z ${summary.staffTotal} kont personelu`}
        />
        <Tile
          label="Klienci"
          value={summary.clientsTotal}
          hint={`${summary.portalClientsTotal} z dostępem do panelu klienta`}
        />
        <Tile label="Zajęcia (7 dni)" value={summary.sessions7d} hint="odbyte i zaplanowane" />
        <Tile label="Dostęp wygasa ≤ 7 dni" value={summary.expiringSoon} tone={summary.expiringSoon > 0 ? "warning" : undefined} />
        <Tile label="Do przypomnienia" value={summary.needAttention} hint="bez logowania od ponad 7 dni" tone={summary.needAttention > 0 ? "warning" : undefined} />
        <Tile label="Tylko do odczytu" value={summary.byStatus.read_only} />
        <Tile label="Zawieszone" value={summary.byStatus.suspended} tone={summary.byStatus.suspended > 0 ? "danger" : undefined} />
      </section>

      <form className="flex flex-wrap items-end gap-3" action="/admin">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Szukaj</span>
          <input
            name="q"
            defaultValue={first(params.q)}
            placeholder="nazwa, e-mail właściciela"
            className="h-11 w-64 max-w-full rounded-lg border border-zinc-300 bg-transparent px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={statusFilter} className="h-11 rounded-lg border border-zinc-300 bg-transparent px-3">
            <option value="">Wszystkie</option>
            {(["trial", "active", "read_only", "suspended"] as OrgStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium">
          Filtruj
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-zinc-600">{all.length === 0 ? "Nikt jeszcze nie założył szkoły." : "Brak szkół spełniających filtr."}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-3 py-2 font-medium">Szkoła</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Personel</th>
                <th className="px-3 py-2 font-medium">Klienci</th>
                <th className="px-3 py-2 font-medium">Zajęcia 7/30 dni</th>
                <th className="px-3 py-2 font-medium">Ostatnie logowanie</th>
                <th className="px-3 py-2 font-medium">Push</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {rows.map((org) => (
                <Row key={org.id} org={org} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "warning" | "danger";
}) {
  const border = tone === "danger" ? "border-red-300 bg-red-50" : tone === "warning" ? "border-amber-300 bg-amber-50" : "border-zinc-200";
  return (
    <div className={`rounded-xl border p-3 ${border}`}>
      <p className="text-sm text-zinc-600">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function Row({ org, now }: { org: OrganizationOverview; now: Date }) {
  const level = activityLevel(org.lastSignInAt, now);
  const left = daysUntil(org.accessUntil, now);
  return (
    <tr className="align-top hover:bg-zinc-50">
      <td className="px-3 py-2">
        <Link href={`/admin/organizations/${org.id}`} className="font-medium underline">
          {org.name}
        </Link>
        <p className="text-zinc-600">{org.ownerEmail ?? "brak właściciela"}</p>
        <p className="text-xs text-zinc-500">założona {formatDate(org.createdAt)}</p>
      </td>
      <td className="px-3 py-2">
        <Badge tone={STATUS_TONES[org.status]}>{STATUS_LABELS[org.status]}</Badge>
        {org.accessUntil ? (
          <p className={`mt-1 text-xs ${left !== null && left <= 7 ? "text-amber-700" : "text-zinc-500"}`}>
            do {formatDate(org.accessUntil)}
            {left !== null && left >= 0 ? ` (${left} dni)` : ""}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-2 tabular-nums">
        {org.activeStaff7d}/{org.staffCount} <span className="text-xs text-zinc-500">aktywnych</span>
      </td>
      <td className="px-3 py-2 tabular-nums">
        {org.clientsCount}
        <p className="text-xs text-zinc-500">
          {org.portalClientsCount} w panelu · +{org.newClients7d} w 7 dni
        </p>
      </td>
      <td className="px-3 py-2 tabular-nums">
        {org.sessions7d} / {org.sessions30d}
      </td>
      <td className="px-3 py-2">
        <Badge tone={ACTIVITY_TONES[level]}>{relativeDays(org.lastSignInAt, now)}</Badge>
        <p className="mt-1 text-xs text-zinc-500">{ACTIVITY_LABELS[level]}</p>
      </td>
      <td className="px-3 py-2 tabular-nums">{org.pushDevices}</td>
    </tr>
  );
}
