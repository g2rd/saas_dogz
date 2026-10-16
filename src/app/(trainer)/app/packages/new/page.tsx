import Link from "next/link";
import { TemplateForm } from "@/modules/packages";
import { createTemplateAction } from "../../billing-actions";

export default function NewTemplatePage() {
  return (
    <>
      <Link href="/app/packages" className="text-sm text-zinc-600 dark:text-zinc-400">
        ← Pakiety
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Nowy szablon pakietu</h1>
      <TemplateForm action={createTemplateAction} submitLabel="Dodaj szablon" />
    </>
  );
}
