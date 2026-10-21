"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const ITEMS = [
  { href: "/portal", label: "portal.nav.start", exact: true },
  { href: "/portal/sessions", label: "portal.nav.sessions", exact: false },
  { href: "/portal/payments", label: "portal.nav.payments", exact: false },
  { href: "/portal/dogs", label: "portal.nav.dogs", exact: false },
  { href: "/portal/more", label: "portal.nav.more", exact: false },
] as const;

/** Dolna nawigacja panelu klienta: duże pola dotykowe, układ pod kciuk. */
export function PortalNav() {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("common.panel_klienta")}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-background pb-[env(safe-area-inset-bottom)] dark:border-zinc-800"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
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
                  className={`h-1 w-8 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
                />
                {t(item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
