import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { SubmitButton } from "@/shared/ui/form-fields";
import { InstallPrompt } from "@/shared/ui/pwa";
import { requireContext } from "../../_lib/context";
import { logoutAction } from "../actions";

export default function MorePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Więcej</h1>
      <div className="mt-6 flex flex-col gap-6">
        <InstallPrompt />
        <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
          <Links />
        </Suspense>
        <form action={logoutAction}>
          <SubmitButton variant="secondary" pendingLabel="Wylogowywanie...">
            Wyloguj
          </SubmitButton>
        </form>
      </div>
    </>
  );
}

async function Links() {
  const ctx = await requireContext();
  const items = [
    { href: "/app/packages", label: "Szablony pakietów", show: hasPermission(ctx, "packages.read") },
    { href: "/app/sessions/types", label: "Rodzaje zajęć", show: hasPermission(ctx, "sessions.read") },
    { href: "/app/team", label: "Zespół", show: hasPermission(ctx, "members.read") },
    { href: "/app/notifications", label: "Powiadomienia", show: true },
    { href: "/app/notifications/settings", label: "Ustawienia powiadomień i push", show: true },
  ].filter((item) => item.show);

  return (
    <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="flex min-h-14 items-center justify-between px-4 py-3">
            <span className="font-medium">{item.label}</span>
            <span aria-hidden className="text-zinc-400">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
