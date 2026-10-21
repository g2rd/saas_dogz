import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Strona 404: brak takiej strony albo brak do niej dostępu (np. `/admin` dla osoby spoza listy właścicieli, cudzy klient).
 * Celowo nie zdradza, który z tych dwóch przypadków zaszedł.
 */
export default function NotFound() {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">{t("common.notFoundPage.title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t("common.notFoundPage.text")}</p>
      <div>
        <Link
          href="/start"
          className="inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {t("common.notFoundPage.home")}
        </Link>
      </div>
    </main>
  );
}
