import { Suspense } from "react";
import { listOrganizations } from "@/modules/platform";
import { demoControlsEnabled } from "@/shared/env";
import { requireAdmin } from "../../_lib/context";
import { demoProcessAction, demoSimulateAction, demoTestNotificationAction } from "../actions";
import { ProcessNowForm, SimulateForm, TestNotificationForm } from "./demo-forms";

export const metadata = { title: "Sterowanie demo" };

export default function DemoPage() {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <Demo />
    </Suspense>
  );
}

async function Demo() {
  const ctx = await requireAdmin();
  const enabled = demoControlsEnabled();
  const schools = enabled ? await listOrganizations(ctx) : null;
  if (schools && !schools.ok) throw new Error(schools.error.message);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Sterowanie demo</h1>
        <p className="mt-1 text-zinc-600">Pokaż trenerowi działanie powiadomień bez czekania: wyślij powiadomienie testowe, przetwórz kolejkę od razu albo przewiń czas.</p>
      </div>

      {!enabled ? (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Sterowanie demo jest wyłączone na tym serwerze. Włącz je zmienną <code>DEMO_CONTROLS=1</code> (tylko na środowisku demo lub lokalnie: symulacja czasu wysyła prawdziwe wiadomości wszystkim, których dotyczą reguły dzienne).
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Powiadomienie testowe</h2>
            <p className="text-sm text-zinc-600">Trafia do właścicieli i administratorów wybranej szkoły (dzwonek, e-mail, push według ich ustawień).</p>
            <TestNotificationForm action={demoTestNotificationAction} schools={(schools?.ok ? schools.value : []).map((school) => ({ id: school.id, name: school.name }))} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Przetwórz powiadomienia teraz</h2>
            <p className="text-sm text-zinc-600">Pomija 30-sekundowe okno „Cofnij” i oczekiwanie na harmonogram: kolejka jest opróżniana od razu.</p>
            <ProcessNowForm action={demoProcessAction} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Przewiń czas</h2>
            <p className="text-sm text-zinc-600">Dane w bazie się nie zmieniają: powstają tylko powiadomienia, które reguły dzienne wysłałyby za wskazaną liczbę dni (np. przypomnienie o zajęciach, termin płatności, koniec dostępu).</p>
            <SimulateForm action={demoSimulateAction} />
          </section>
        </>
      )}
    </div>
  );
}
