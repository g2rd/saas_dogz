import { Suspense } from "react";
import { DogForm, dogAgeText, type ApprovalStatus } from "@/modules/dogs";
import { listPortalDogs } from "@/modules/portal";
import { Badge } from "@/shared/ui/badge";
import { requirePortalContext } from "../../_lib/context";
import { addMyDogAction } from "../actions";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

const TONE: Record<ApprovalStatus, "success" | "warning" | "danger"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

export default function PortalDogsPage() {
  const t = useTranslations();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t("portal.dogsPage.moje_psy")}</h1>
      <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
        <Dogs />
      </Suspense>
    </>
  );
}

async function Dogs() {
  const t = await getTranslations();
  const ctx = await requirePortalContext();
  const result = await listPortalDogs(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const now = ctx.clock.now();

  return (
    <div className="flex flex-col gap-8">
      {result.value.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t("portal.dogsPage.nie_dodano_jeszcze_zadnego_psa")}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {result.value.map((dog) => (
            <li key={dog.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-medium">{dog.name}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {[dog.breed, dogAgeText(t, dog.birthDate, now), dog.sex === "unknown" ? null : t(`labels.dogSex.${dog.sex}`)]
                    .filter(Boolean)
                    .join(" · ") || t("portal.dogsPage.brak_dodatkowych_danych")}
                </p>
              </div>
              <Badge tone={TONE[dog.approvalStatus]}>{t(`labels.approvalStatus.${dog.approvalStatus}`)}</Badge>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="add-dog-heading">
        <h2 id="add-dog-heading" className="mb-1 text-lg font-semibold">
          {t("common.dodaj_psa")}
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {t("portal.dogsPage.trener_zatwierdzi_psa_zanim_pojawi_sie_w")}
        </p>
        <DogForm action={addMyDogAction} submitLabel={t("portal.dogsPage.wyslij_do_zatwierdzenia")} />
      </section>
    </div>
  );
}
