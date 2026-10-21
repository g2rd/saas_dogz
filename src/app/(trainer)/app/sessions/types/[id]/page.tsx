import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { SessionTypeForm, getSessionType } from "@/modules/scheduling";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../../../_lib/context";
import { archiveSessionTypeAction, restoreSessionTypeAction, updateSessionTypeAction } from "../../actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

type Props = PageProps<"/app/sessions/types/[id]">;

export default function SessionTypePage({ params }: Props) {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/sessions/types" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("trainer.sessionsTypesPage.rodzaje_zajec")}
      </Link>
      <Suspense fallback={<p className="mt-6 text-zinc-500">{t("common.ladowanie")}</p>}>
        <TypeDetails params={params} />
      </Suspense>
    </>
  );
}

async function TypeDetails({ params }: Pick<Props, "params">) {
  const t = await getTranslations();
  const { id } = await params;
  const ctx = await requireContext();
  const result = await getSessionType(ctx, id);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    throw new Error(result.error.message);
  }
  const type = result.value;
  const archived = type.archivedAt !== null;
  const canWrite = hasPermission(ctx, "session_types.write");

  return (
    <div className="mt-2 flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {type.name}
          {archived ? <span className="ml-2 text-base text-zinc-500">{t("common.archiwum")}</span> : null}
        </h1>
        {canWrite ? (
          <form action={(archived ? restoreSessionTypeAction : archiveSessionTypeAction).bind(null, id)}>
            {archived ? (
              <SubmitButton variant="secondary" pendingLabel={t("common.chwila")}>
                {t("common.przywroc_z_archiwum")}
              </SubmitButton>
            ) : (
              <ConfirmSubmit
                variant="danger"
                title={t("trainer.sessionsTypesPage.zarchiwizowac_rodzaj_zajec")}
                description={t("trainer.sessionsTypesPage.rodzaj_zniknie_z_listy_przy_planowaniu")}
                confirmLabel={t("common.archiwizuj")}
                pendingLabel={t("common.chwila")}
              >
                {t("common.archiwizuj")}
              </ConfirmSubmit>
            )}
          </form>
        ) : null}
      </header>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("trainer.sessionsTypesPage.zmiana_czasu_trwania_dotyczy_nowo")}
      </p>
      {canWrite ? (
        <SessionTypeForm
          action={updateSessionTypeAction.bind(null, id)}
          submitLabel={t("common.zapisz_zmiany")}
          values={{
            name: type.name,
            durationMinutes: type.durationMinutes,
            defaultPrice: (type.defaultPriceMinor / 100).toFixed(2).replace(".", ","),
          }}
        />
      ) : null}
    </div>
  );
}
