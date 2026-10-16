import { Suspense } from "react";
import {
  APPROVAL_STATUS_LABELS,
  DOG_SEX_LABELS,
  DogForm,
  formatDogAge,
  type ApprovalStatus,
} from "@/modules/dogs";
import { listPortalDogs } from "@/modules/portal";
import { Badge } from "@/shared/ui/badge";
import { requirePortalContext } from "../../_lib/context";
import { addMyDogAction } from "../actions";

const TONE: Record<ApprovalStatus, "success" | "warning" | "danger"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

export default function PortalDogsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Moje psy</h1>
      <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
        <Dogs />
      </Suspense>
    </>
  );
}

async function Dogs() {
  const ctx = await requirePortalContext();
  const result = await listPortalDogs(ctx);
  if (!result.ok) throw new Error(result.error.message);
  const now = ctx.clock.now();

  return (
    <div className="flex flex-col gap-8">
      {result.value.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">Nie dodano jeszcze żadnego psa.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {result.value.map((dog) => (
            <li key={dog.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-medium">{dog.name}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {[dog.breed, formatDogAge(dog.birthDate, now), dog.sex === "unknown" ? null : DOG_SEX_LABELS[dog.sex]]
                    .filter(Boolean)
                    .join(" · ") || "Brak dodatkowych danych"}
                </p>
              </div>
              <Badge tone={TONE[dog.approvalStatus]}>{APPROVAL_STATUS_LABELS[dog.approvalStatus]}</Badge>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="add-dog-heading">
        <h2 id="add-dog-heading" className="mb-1 text-lg font-semibold">
          Dodaj psa
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Trener zatwierdzi psa, zanim pojawi się w zajęciach i pakietach.
        </p>
        <DogForm action={addMyDogAction} submitLabel="Wyślij do zatwierdzenia" />
      </section>
    </div>
  );
}
