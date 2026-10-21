import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">{t("common.dogtrainer")}</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        {t("marketing.home.kalendarz_pakiety_zajec_platnosci_i")}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-6 font-medium text-primary-foreground"
        >
          {t("common.zaloz_konto")}
        </Link>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium dark:border-zinc-700"
        >
          {t("common.zaloguj_sie")}
        </Link>
      </div>
      <p className="flex flex-wrap gap-4 text-sm text-zinc-500">
        <Link href="/terms" className="underline">
          {t("legal.terms.link")}
        </Link>
        <Link href="/privacy" className="underline">
          {t("legal.privacy.link")}
        </Link>
      </p>
    </main>
  );
}
