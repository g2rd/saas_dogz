"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const ITEMS = [
  { href: "/app", label: "trainer.nav.today", exact: true },
  { href: "/app/clients", label: "trainer.nav.clients", exact: false },
  { href: "/app/sessions", label: "trainer.nav.sessions", exact: false },
  { href: "/app/requests", label: "trainer.nav.requests", exact: false, badge: true },
  { href: "/app/more", label: "trainer.nav.more", exact: false },
] as const;

/** Dolna nawigacja panelu trenera na telefonie (od szerokości `md` zastępuje ją górny pasek). */
export function TrainerBottomNav({ requests }: { requests: number }) {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("common.panel_trenera")}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-background pb-[env(safe-area-inset-bottom)] md:hidden dark:border-zinc-800"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-1 text-xs ${
                  active ? "font-semibold text-foreground" : "text-zinc-500"
                }`}
              >
                <span aria-hidden className={`h-1 w-8 rounded-full ${active ? "bg-primary" : "bg-transparent"}`} />
                <span>
                  {t(item.label)}
                  {"badge" in item && requests > 0 ? (
                    <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                      {requests}
                      <span className="sr-only">{" "}{t("common.nowych")}</span>
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
