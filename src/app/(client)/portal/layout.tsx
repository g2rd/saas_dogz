import { Suspense } from "react";
import { portalLogoutAction } from "./actions";
import { HeaderBell } from "./header-bell";
import { PortalNav } from "./portal-nav";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] dark:border-zinc-800">
        <span className="font-semibold">DogTrainer</span>
        <div className="flex items-center gap-2">
          <Suspense fallback={null}>
            <HeaderBell />
          </Suspense>
          <form action={portalLogoutAction}>
            <button type="submit" className="text-sm text-zinc-600 dark:text-zinc-400">
              Wyloguj
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 pt-6 pb-28">{children}</main>
      <PortalNav />
    </div>
  );
}
