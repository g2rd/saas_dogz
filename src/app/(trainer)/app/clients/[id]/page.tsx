import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClientForm, clientFullName, getClient } from "@/modules/clients";
import { DogForm, dogAgeText, listDogs } from "@/modules/dogs";
import { Badge } from "@/shared/ui/badge";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../../_lib/context";
import { AccessSection } from "./access-section";
import { BillingSection } from "./billing-section";
import { approveDogAction, rejectDogAction } from "./invite-actions";
import { SessionsSection } from "./sessions-section";
import {
  addDogAction,
  archiveClientAction,
  restoreClientAction,
  updateClientAction,
} from "../actions";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

export default function ClientPage({ params }: PageProps<"/app/clients/[id]">) {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/clients" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("common.klienci")}
      </Link>
      <Suspense fallback={<p className="mt-6 text-zinc-500">{t("common.ladowanie")}</p>}>
        <ClientDetails params={params} />
      </Suspense>
    </>
  );
}

async function ClientDetails({ params }: Pick<PageProps<"/app/clients/[id]">, "params">) {
  const t = await getTranslations();
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
            {client.archivedAt ? <span className="ml-2 text-base text-zinc-500">{t("common.archiwum")}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {[t(`labels.clientStatus.${client.status}`), client.phone, client.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        {canWrite ? (
          <form action={(client.archivedAt ? restoreClientAction : archiveClientAction).bind(null, id)}>
            {client.archivedAt ? (
              <SubmitButton variant="secondary" pendingLabel={t("common.chwila")}>
                {t("common.przywroc_z_archiwum")}
              </SubmitButton>
            ) : (
              <ConfirmSubmit
                variant="danger"
                title={t("trainer.clientsPage.zarchiwizowac_klienta")}
                description={t("trainer.clientsPage.klient_zniknie_z_list_i_nie_da_sie_mu")}
                confirmLabel={t("common.archiwizuj")}
                pendingLabel={t("common.chwila")}
              >
                {t("common.archiwizuj")}
              </ConfirmSubmit>
            )}
          </form>
        ) : null}
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("trainer.clientsPage.psy")}</h2>
        {dogs.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("trainer.clientsPage.ten_klient_nie_ma_jeszcze_dodanych_psow")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {dogs.map((dog) => (
              <li key={dog.id}>
                <Link
                  href={`/app/clients/${id}/dogs/${dog.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="font-medium">
                    {dog.name}
                    {dog.approvalStatus !== "approved" ? (
                      <span className="ml-2">
                        <Badge tone={dog.approvalStatus === "pending" ? "warning" : "danger"}>
                          {t(`labels.approvalStatus.${dog.approvalStatus}`)}
                        </Badge>
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {[dog.breed, dogAgeText(t, dog.birthDate, now), t(`labels.dogSex.${dog.sex}`)]
                      .filter((v) => v && v !== t("labels.dogSex.unknown"))
                      .join(" · ")}
                  </span>
                </Link>
                {dog.approvalStatus === "pending" && canWrite ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-zinc-200 px-4 py-3 dark:border-zinc-800">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {t("trainer.clientsPage.pies_dodany_przez_klienta_zatwierdz_zeby")}
                    </span>
                    <form action={approveDogAction.bind(null, id, dog.id)}>
                      <SubmitButton pendingLabel={t("trainer.clientsPage.zatwierdzanie")}>{t("trainer.clientsPage.zatwierdz")}</SubmitButton>
                    </form>
                    <form action={rejectDogAction.bind(null, id, dog.id)}>
                      <ConfirmSubmit
                        variant="secondary"
                        title={t("trainer.clientsPage.odrzucic_psa")}
                        description={t("trainer.clientsPage.pies_dodany_przez_klienta_zostanie")}
                        confirmLabel={t("trainer.clientsPage.odrzuc_psa")}
                        pendingLabel={t("trainer.clientsPage.odrzucanie")}
                      >
                        {t("trainer.clientsPage.odrzuc")}
                      </ConfirmSubmit>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <details className="mt-4">
            <summary className="cursor-pointer font-medium">{t("common.dodaj_psa")}</summary>
            <div className="mt-4">
              <DogForm action={addDogAction.bind(null, id)} submitLabel={t("common.dodaj_psa")} />
            </div>
          </details>
        ) : null}
      </section>

      <Suspense fallback={<p className="text-zinc-500">{t("trainer.clientsPage.ladowanie_zajec")}</p>}>
        <SessionsSection clientId={id} />
      </Suspense>

      <Suspense fallback={<p className="text-zinc-500">{t("trainer.clientsPage.ladowanie_pakietow_i_platnosci")}</p>}>
        <BillingSection
          clientId={id}
          dogs={dogs.filter((d) => d.approvalStatus === "approved").map((d) => ({ id: d.id, name: d.name }))}
        />
      </Suspense>

      <Suspense fallback={<p className="text-zinc-500">{t("trainer.clientsPage.ladowanie_panelu_klienta")}</p>}>
        <AccessSection clientId={id} clientEmail={client.email} />
      </Suspense>

      {canWrite ? (
        <section>
          <details>
            <summary className="cursor-pointer text-lg font-semibold">{t("trainer.clientsPage.edytuj_dane_klienta")}</summary>
            <div className="mt-4">
              <ClientForm
                action={updateClientAction.bind(null, id)}
                submitLabel={t("common.zapisz_zmiany")}
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
