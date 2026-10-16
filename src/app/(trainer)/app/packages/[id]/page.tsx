import { ConfirmSubmit } from "@/shared/ui/confirm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TemplateForm, getTemplate } from "@/modules/packages";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../../_lib/context";
import { archiveTemplateAction, restoreTemplateAction, updateTemplateAction } from "../../billing-actions";

type Props = PageProps<"/app/packages/[id]">;

export default function TemplatePage({ params }: Props) {
  return (
    <>
      <Link href="/app/packages" className="text-sm text-zinc-600 dark:text-zinc-400">
        ← Pakiety
      </Link>
      <Suspense fallback={<p className="mt-6 text-zinc-500">Ładowanie...</p>}>
        <TemplateDetails params={params} />
      </Suspense>
    </>
  );
}

async function TemplateDetails({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const ctx = await requireContext();
  const result = await getTemplate(ctx, id);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    throw new Error(result.error.message);
  }
  const template = result.value;
  const archived = template.archivedAt !== null;

  return (
    <div className="mt-2 flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {template.name}
          {archived ? <span className="ml-2 text-base text-zinc-500">(archiwum)</span> : null}
        </h1>
        <form action={(archived ? restoreTemplateAction : archiveTemplateAction).bind(null, id)}>
          {archived ? (
            <SubmitButton variant="secondary" pendingLabel="Chwila...">
              Przywróć z archiwum
            </SubmitButton>
          ) : (
            <ConfirmSubmit
                variant="danger"
                title="Zarchiwizować szablon pakietu?"
                description="Szablon zniknie z listy przy sprzedaży. Pakiety już sprzedane zostają bez zmian, a szablon możesz przywrócić."
                confirmLabel="Archiwizuj"
                pendingLabel="Chwila..."
              >
                Archiwizuj
              </ConfirmSubmit>
          )}
        </form>
      </header>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Zmiany dotyczą tylko nowych sprzedaży. Pakiety już sprzedane zachowują nazwę, liczbę zajęć i cenę z chwili zakupu.
      </p>
      <TemplateForm
        action={updateTemplateAction.bind(null, id)}
        submitLabel="Zapisz zmiany"
        values={{
          name: template.name,
          sessionsCount: template.sessionsCount,
          validityDays: template.validityDays,
          price: (template.priceMinor / 100).toFixed(2).replace(".", ","),
        }}
      />
    </div>
  );
}
