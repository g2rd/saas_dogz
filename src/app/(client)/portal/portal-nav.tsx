"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/portal", label: "Start", exact: true },
  { href: "/portal/sessions", label: "Zajęcia", exact: false },
  { href: "/portal/payments", label: "Płatności", exact: false },
  { href: "/portal/dogs", label: "Psy", exact: false },
] as const;

/** Dolna nawigacja panelu klienta: duże pola dotykowe, układ pod kciuk. */
export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Panel klienta"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-background pb-[env(safe-area-inset-bottom)] dark:border-zinc-800"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-1 text-xs ${
                  active ? "font-semibold text-foreground" : "text-zinc-500"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1 w-8 rounded-full ${active ? "bg-foreground" : "bg-transparent"}`}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
