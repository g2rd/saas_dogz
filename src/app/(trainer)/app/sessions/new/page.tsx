import Link from "next/link";
import { Suspense } from "react";
import { clientFullName, listClients } from "@/modules/clients";
import { listTrainers } from "@/modules/core";
import { listOrganizationDogs } from "@/modules/dogs";
import { ScheduleSessionForm, getSessionAgenda, listSessionTypes } from "@/modules/scheduling";
import { requireContext } from "../../../_lib/context";
import { scheduleSessionAction } from "../actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function NewSessionPage({ searchParams }: PageProps<"/app/sessions/new">) {
  const tr = useTranslations();
  return (
    <>
      <Link href="/app/sessions" className="text-sm text-zinc-600 dark:text-zinc-400">
        {tr("common.zajecia_2")}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">{tr("common.zaplanuj_zajecia")}</h1>
      <Suspense fallback={<p className="text-zinc-500">{tr("common.ladowanie")}</p>}>
        <ScheduleForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function ScheduleForm({ searchParams }: Pick<PageProps<"/app/sessions/new">, "searchParams">) {
  const tr = await getTranslations();
  const params = await searchParams;
  const ctx = await requireContext();

  const [clients, dogs, types, trainers, agenda] = await Promise.all([
    listClients(ctx),
    listOrganizationDogs(ctx),
    listSessionTypes(ctx),
    listTrainers(ctx),
    getSessionAgenda(ctx, { upcomingDays: 0 }),
  ]);
  if (!clients.ok) throw new Error(clients.error.message);
  if (!types.ok) throw new Error(types.error.message);

  if (types.value.length === 0) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        {tr("trainer.sessionsNewPage.najpierw_dodaj_rodzaj_zajec_w_sekcji")}{" "}
        <Link href="/app/sessions/types" className="underline">
          {tr("common.rodzaje_zajec")}
        </Link>
        .
      </p>
    );
  }

  return (
    <ScheduleSessionForm
      action={scheduleSessionAction}
      clients={clients.value.map((c) => ({ id: c.id, name: clientFullName(c) }))}
      dogs={(dogs.ok ? dogs.value : []).map((d) => ({ id: d.id, clientId: d.clientId, name: d.name }))}
      types={types.value.map((t) => ({ id: t.id, label: `${t.name} (${t.durationMinutes} min)` }))}
      trainers={(trainers.ok ? trainers.value : []).map((t) => ({ id: t.userId, name: t.name }))}
      defaults={{
        clientId: first(params.clientId),
        date: first(params.date) ?? (agenda.ok ? agenda.value.today : undefined),
        trainerId: ctx.userId,
      }}
    />
  );
}
