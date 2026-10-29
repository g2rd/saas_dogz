import Link from "next/link";
import { adminLogoutAction } from "./actions";

export const metadata = { title: "Panel właściciela", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-zinc-900 text-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
          <Link href="/admin" className="font-semibold">
            DogTrainer · właściciel
          </Link>
          <Link href="/admin">Szkoły</Link>
          <Link href="/admin/codes">Kody i rejestracja</Link>
          <Link href="/admin/feedback">Opinie</Link>
          <Link href="/admin/demo">Demo</Link>
          <span className="ml-auto flex items-center gap-4">
            <form action={adminLogoutAction}>
              <button type="submit" className="text-zinc-300">
                Wyloguj
              </button>
            </form>
          </span>
        </nav>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
