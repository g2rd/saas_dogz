"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

/**
 * Ekran nieoczekiwanego błędu w obrębie segmentu (nawigacja i reszta układu zostają). Nie pokazujemy treści błędu
 * (może zdradzać szczegóły serwera), tylko krótki kod zgłoszenia (`digest`), po którym znajdziemy wpis w logach serwera.
 */
export function ErrorView({ error, retry, homeHref }: { error: unknown; retry: () => void; homeHref: string }) {
  const t = useTranslations();
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: unknown }).digest ?? "") : "";

  useEffect(() => {
    // Błąd z serwera ma tylko ogólny komunikat i digest; pełny ślad jest w logach serwera
    console.error(error);
  }, [error]);

  return (
    <main role="alert" className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">{t("common.errorPage.title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t("common.errorPage.text")}</p>
      {digest ? <p className="text-xs text-zinc-500">{t("common.errorPage.reference", { code: digest })}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {t("common.errorPage.retry")}
        </button>
        <Link href={homeHref} className="text-sm underline">
          {t("common.errorPage.home")}
        </Link>
      </div>
    </main>
  );
}
