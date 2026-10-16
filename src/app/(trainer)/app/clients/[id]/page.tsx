import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  CLIENT_STATUS_LABELS,
  ClientForm,
  clientFullName,
  getClient,
} from "@/modules/clients";
import { DOG_SEX_LABELS, DogForm, formatDogAge, listDogs } from "@/modules/dogs";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../../_lib/context";
import {
  addDogAction,
  archiveClientAction,
  restoreClientAction,
  updateClientAction,
} from "../actions";

export default function ClientPage({ params }: PageProps<"/app/clients/[id]">) {
  return (
    <>
      <Link href="/app/clients" className="text-sm text-zinc-600 dark:text-zinc-400">
        ← Klienci
      </Link>
      <Suspense fallback={<p className="mt-6 text-zinc-500">Ładowanie...</p>}>
        <ClientDetails params={params} />
      </Suspense>
    </>
  );
}

async function ClientDetails({ params }: Pick<PageProps<"/app/clients/[id]">, "params">) {
  const { id } = await params;
  const ctx = await requireContext();

  const clientResult = await getClient(ctx, id);
  if (!clientResult.ok) {
    if (clientResult.error.code === "not_found") notFound();
    throw new Error(clientResult.error.message);
  }
  const client = clientResult.value;

  const dogsResult = await listDogs(ctx, id);
  const dogs = dogsResult.ok ? dogsResult.value : [];
  const now = ctx.clock.now();
  const canWrite = ctx.role !== "assistant";

  return (
    <div className="mt-2 flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {clientFullName(client)}
            {client.archivedAt ? <span className="ml-2 text-base text-zinc-500">(archiwum)</span> : null}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {[CLIENT_STATUS_LABELS[client.status], client.phone, client.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        {canWrite ? (
          <form action={(client.archivedAt ? restoreClientAction : archiveClientAction).bind(null, id)}>
            <SubmitButton variant={client.archivedAt ? "secondary" : "danger"} pendingLabel="Chwila...">
              {client.archivedAt ? "Przywróć z archiwum" : "Archiwizuj"}
            </SubmitButton>
          </form>
        ) : null}
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Psy</h2>
        {dogs.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Ten klient nie ma jeszcze dodanych psów.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {dogs.map((dog) => (
              <li key={dog.id}>
                <Link
                  href={`/app/clients/${id}/dogs/${dog.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="font-medium">{dog.name}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {[dog.breed, formatDogAge(dog.birthDate, now), DOG_SEX_LABELS[dog.sex]]
                      .filter((v) => v && v !== DOG_SEX_LABELS.unknown)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <details className="mt-4">
            <summary className="cursor-pointer font-medium">Dodaj psa</summary>
            <div className="mt-4">
              <DogForm action={addDogAction.bind(null, id)} submitLabel="Dodaj psa" />
            </div>
          </details>
        ) : null}
      </section>

      {canWrite ? (
        <section>
          <details>
            <summary className="cursor-pointer text-lg font-semibold">Edytuj dane klienta</summary>
            <div className="mt-4">
              <ClientForm
                action={updateClientAction.bind(null, id)}
                submitLabel="Zapisz zmiany"
                values={{
                  firstName: client.firstName,
                  lastName: client.lastName,
                  email: client.email,
                  phone: client.phone,
                  status: client.status,
                }}
              />
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
