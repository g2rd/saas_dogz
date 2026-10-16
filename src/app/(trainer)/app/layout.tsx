import Link from "next/link";
import { logoutAction } from "./actions";

export default function TrainerLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3 text-sm">
          <Link href="/app" className="font-semibold">
            DogTrainer
          </Link>
          <Link href="/app/clients">Klienci</Link>
          <form action={logoutAction} className="ml-auto">
            <button type="submit" className="text-zinc-600 dark:text-zinc-400">
              Wyloguj
            </button>
          </form>
        </nav>
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</div>
    </div>
  );
}
