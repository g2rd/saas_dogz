import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "./actions";
import { AccessBanner } from "./access-banner";
import { BottomNavSlot } from "./bottom-nav-slot";
import { HeaderBadges } from "./header-badges";
import { getTranslations } from "next-intl/server";
import { requireCurrentConsent } from "../../_lib/legal-gate";

export default async function TrainerLayout({ children }: LayoutProps<"/app">) {
  await requireCurrentConsent();
  const t = await getTranslations();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 pt-[env(safe-area-inset-top)] dark:border-zinc-800">
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:gap-x-6">
          <Link href="/app" className="font-semibold">
            {t("common.dogtrainer")}
          </Link>
          <span className="hidden items-center gap-x-6 md:flex">
            <Link href="/app/sessions">{t("common.zajecia")}</Link>
            <Link href="/app/clients">{t("common.klienci_2")}</Link>
            <Link href="/app/packages">{t("common.pakiety")}</Link>
          </span>
          <span className="ml-auto flex items-center gap-x-4 sm:gap-x-6">
            <Suspense fallback={null}>
              <HeaderBadges />
            </Suspense>
            <form action={logoutAction} className="hidden md:block">
              <button type="submit" className="text-zinc-600 dark:text-zinc-400">
                {t("common.wyloguj")}
              </button>
            </form>
          </span>
        </nav>
      </header>
      <Suspense fallback={null}>
        <AccessBanner />
      </Suspense>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-28 md:py-8 md:pb-8">{children}</div>
      <Suspense fallback={null}>
        <BottomNavSlot />
      </Suspense>
    </div>
  );
}
