import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientFullName, getClient } from "@/modules/clients";
import {
  DogForm,
  DogNoteForm,
  DOG_SEX_LABELS,
  NOTE_KIND_LABELS,
  formatDogAge,
  getDog,
  listDogNotes,
} from "@/modules/dogs";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../../../../_lib/context";
import {
  addDogNoteAction,
  archiveDogAction,
  deleteDogNoteAction,
  restoreDogAction,
  updateDogAction,
} from "../../../actions";

type Props = PageProps<"/app/clients/[id]/dogs/[dogId]">;

export default function DogPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <DogDetails params={params} />
    </Suspense>
  );
}

async function DogDetails({ params }: Pick<Props, "params">) {
  const { id: clientId, dogId } = await params;
  const ctx = await requireContext();

  const [dogResult, clientResult] = await Promise.all([getDog(ctx, dogId), getClient(ctx, clientId)]);
  if (!dogResult.ok || !clientResult.ok || dogResult.value.clientId !== clientId) notFound();
  const dog = dogResult.value;
  const client = clientResult.value;

  const notesResult = await listDogNotes(ctx, dogId);
  const notes = notesResult.ok ? notesResult.value : null;
  const canWrite = ctx.role !== "assistant";
  const age = formatDogAge(dog.birthDate, ctx.clock.now());

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/app/clients/${clientId}`} className="text-sm text-zinc-600 dark:text-zinc-400">
          ← {clientFullName(client)}
        </Link>
        <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {dog.name}
              {dog.archivedAt ? <span className="ml-2 text-base text-zinc-500">(archiwum)</span> : null}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {[dog.breed, age, dog.sex === "unknown" ? null : DOG_SEX_LABELS[dog.sex]]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {canWrite ? (
            <form
              action={(dog.archivedAt ? restoreDogAction : archiveDogAction).bind(null, clientId, dogId)}
            >
              {dog.archivedAt ? (
                <SubmitButton variant="secondary" pendingLabel="Chwila...">
                  Przywróć z archiwum
                </SubmitButton>
              ) : (
                <ConfirmSubmit
                variant="danger"
                title="Zarchiwizować psa?"
                description="Pies zniknie z list i nie da się go wybrać w zajęciach ani pakietach. Dane zostają, a z archiwum możesz go przywrócić."
                confirmLabel="Archiwizuj"
                pendingLabel="Chwila..."
              >
                Archiwizuj
              </ConfirmSubmit>
              )}
            </form>
          ) : null}
        </header>
      </div>

      {notes ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Notatki</h2>
          {notes.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">Brak notatek.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">{NOTE_KIND_LABELS[note.kind]}</span>
                    <span>{note.createdAt.toLocaleDateString("pl-PL")}</span>
                    <span>{note.visibleToClient ? "widoczna dla klienta" : "prywatna"}</span>
                    {note.validUntil ? <span>ważna do {note.validUntil}</span> : null}
                  </div>
                  <p className="whitespace-pre-wrap">{note.content}</p>
                  {canWrite ? (
                    <form action={deleteDogNoteAction.bind(null, clientId, dogId, note.id)} className="mt-3">
                      <ConfirmSubmit
                        variant="secondary"
                        title="Usunąć notatkę?"
                        description="Notatka zostanie usunięta na stałe. Tej operacji nie można cofnąć."
                        confirmLabel="Usuń notatkę"
                        pendingLabel="Usuwanie..."
                      >
                        Usuń
                      </ConfirmSubmit>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canWrite ? (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">Dodaj notatkę</summary>
              <div className="mt-4">
                <DogNoteForm action={addDogNoteAction.bind(null, clientId, dogId)} />
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {canWrite ? (
        <section>
          <details>
            <summary className="cursor-pointer text-lg font-semibold">Edytuj dane psa</summary>
            <div className="mt-4">
              <DogForm
                action={updateDogAction.bind(null, clientId, dogId)}
                submitLabel="Zapisz zmiany"
                values={{ name: dog.name, breed: dog.breed, birthDate: dog.birthDate, sex: dog.sex }}
              />
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
