import { portalLogoutAction } from "./actions";
import { PortalNav } from "./portal-nav";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="font-semibold">DogTrainer</span>
        <form action={portalLogoutAction}>
          <button type="submit" className="text-sm text-zinc-600 dark:text-zinc-400">
            Wyloguj
          </button>
        </form>
      </header>
      <main className="flex-1 px-4 pt-6 pb-28">{children}</main>
      <PortalNav />
    </div>
  );
}
