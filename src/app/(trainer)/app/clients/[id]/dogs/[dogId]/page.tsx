import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientFullName, getClient } from "@/modules/clients";
import { DogForm, DogNoteForm, dogAgeText, getDog, listDogNotes } from "@/modules/dogs";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../../../../_lib/context";
import {
  addDogNoteAction,
  archiveDogAction,
  deleteDogNoteAction,
  restoreDogAction,
  updateDogAction,
} from "../../../actions";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

type Props = PageProps<"/app/clients/[id]/dogs/[dogId]">;

export default function DogPage({ params }: Props) {
  const t = useTranslations();
  return (
    <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
      <DogDetails params={params} />
    </Suspense>
  );
}

async function DogDetails({ params }: Pick<Props, "params">) {
  const t = await getTranslations();
  const { id: clientId, dogId } = await params;
  const ctx = await requireContext();
  const formats = await getFormats();

  const [dogResult, clientResult] = await Promise.all([getDog(ctx, dogId), getClient(ctx, clientId)]);
  if (!dogResult.ok || !clientResult.ok || dogResult.value.clientId !== clientId) notFound();
  const dog = dogResult.value;
  const client = clientResult.value;

  const notesResult = await listDogNotes(ctx, dogId);
  const notes = notesResult.ok ? notesResult.value : null;
  const canWrite = ctx.role !== "assistant";
  const age = dogAgeText(t, dog.birthDate, ctx.clock.now());

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
              {dog.archivedAt ? <span className="ml-2 text-base text-zinc-500">{t("common.archiwum")}</span> : null}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {[dog.breed, age, dog.sex === "unknown" ? null : t(`labels.dogSex.${dog.sex}`)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {canWrite ? (
            <form
              action={(dog.archivedAt ? restoreDogAction : archiveDogAction).bind(null, clientId, dogId)}
            >
              {dog.archivedAt ? (
                <SubmitButton variant="secondary" pendingLabel={t("common.chwila")}>
                  {t("common.przywroc_z_archiwum")}
                </SubmitButton>
              ) : (
                <ConfirmSubmit
                variant="danger"
                title={t("trainer.clientsDogsPage.zarchiwizowac_psa")}
                description={t("trainer.clientsDogsPage.pies_zniknie_z_list_i_nie_da_sie_go")}
                confirmLabel={t("common.archiwizuj")}
                pendingLabel={t("common.chwila")}
              >
                {t("common.archiwizuj")}
              </ConfirmSubmit>
              )}
            </form>
          ) : null}
        </header>
      </div>

      {notes ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("trainer.clientsDogsPage.notatki")}</h2>
          {notes.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{t("trainer.clientsDogsPage.brak_notatek")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">{t(`labels.noteKind.${note.kind}`)}</span>
                    <span>{formats.date(note.createdAt)}</span>
                    <span>{note.visibleToClient ? "widoczna dla klienta" : "prywatna"}</span>
                    {note.validUntil ? <span>{t("trainer.clientsDogsPage.wazna_do_validuntil", { validUntil: note.validUntil })}</span> : null}
                  </div>
                  <p className="whitespace-pre-wrap">{note.content}</p>
                  {canWrite ? (
                    <form action={deleteDogNoteAction.bind(null, clientId, dogId, note.id)} className="mt-3">
                      <ConfirmSubmit
                        variant="secondary"
                        title={t("trainer.clientsDogsPage.usunac_notatke")}
                        description={t("trainer.clientsDogsPage.notatka_zostanie_usunieta_na_stale_tej")}
                        confirmLabel={t("trainer.clientsDogsPage.usun_notatke")}
                        pendingLabel={t("trainer.clientsDogsPage.usuwanie")}
                      >
                        {t("trainer.clientsDogsPage.usun")}
                      </ConfirmSubmit>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canWrite ? (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">{t("common.dodaj_notatke")}</summary>
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
            <summary className="cursor-pointer text-lg font-semibold">{t("trainer.clientsDogsPage.edytuj_dane_psa")}</summary>
            <div className="mt-4">
              <DogForm
                action={updateDogAction.bind(null, clientId, dogId)}
                submitLabel={t("common.zapisz_zmiany")}
                values={{ name: dog.name, breed: dog.breed, birthDate: dog.birthDate, sex: dog.sex }}
              />
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
