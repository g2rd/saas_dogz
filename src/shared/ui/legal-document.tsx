import Link from "next/link";
import { useTranslations } from "next-intl";
import { operatorInfo } from "../env";
import { LEGAL_PATHS, LEGAL_VERSION, type LegalDocument } from "../legal";

type Section = { heading: string; paragraphs: string[] };

/** Strona regulaminu lub polityki prywatności: dane operatora, wersja i sekcje z katalogu `legal`. */
export function LegalPage({ document }: { document: LegalDocument }) {
  const t = useTranslations();
  const operator = operatorInfo();
  const sections = t.raw(`legal.${document}.sections`) as Section[];
  const other: LegalDocument = document === "terms" ? "privacy" : "terms";
  const missing = t("legal.common.to_define");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          {t("legal.common.back")}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">{t(`legal.${document}.title`)}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("legal.common.version", { version: LEGAL_VERSION })}</p>
      </div>

      <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
        {t("legal.common.draft")}
      </p>

      <section aria-label={t("legal.common.operator_heading")} className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <h2 className="font-semibold">{t("legal.common.operator_heading")}</h2>
        <p>{t("legal.common.operator_name", { value: operator.name ?? missing })}</p>
        <p>{t("legal.common.operator_address", { value: operator.address ?? missing })}</p>
        <p>{t("legal.common.operator_email", { value: operator.email ?? missing })}</p>
      </section>

      {sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-zinc-700 dark:text-zinc-300">
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      <p className="text-sm">
        {t("legal.common.other_document")}{" "}
        <Link href={LEGAL_PATHS[other]} className="underline">
          {t(`legal.${other}.link`)}
        </Link>
      </p>
    </main>
  );
}
