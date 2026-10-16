import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "./actions";
import { BottomNavSlot } from "./bottom-nav-slot";
import { HeaderBadges } from "./header-badges";

export default function TrainerLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 pt-[env(safe-area-inset-top)] dark:border-zinc-800">
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:gap-x-6">
          <Link href="/app" className="font-semibold">
            DogTrainer
          </Link>
          <span className="hidden items-center gap-x-6 md:flex">
            <Link href="/app/sessions">Zajęcia</Link>
            <Link href="/app/clients">Klienci</Link>
            <Link href="/app/packages">Pakiety</Link>
          </span>
          <span className="ml-auto flex items-center gap-x-4 sm:gap-x-6">
            <Suspense fallback={null}>
              <HeaderBadges />
            </Suspense>
            <form action={logoutAction} className="hidden md:block">
              <button type="submit" className="text-zinc-600 dark:text-zinc-400">
                Wyloguj
              </button>
            </form>
          </span>
        </nav>
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-28 md:py-8 md:pb-8">{children}</div>
      <Suspense fallback={null}>
        <BottomNavSlot />
      </Suspense>
    </div>
  );
}
