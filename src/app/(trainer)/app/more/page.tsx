import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { SubmitButton } from "@/shared/ui/form-fields";
import { LanguageSection } from "@/shared/ui/language-section";
import { InstallPrompt } from "@/shared/ui/pwa";
import { requireContext } from "../../_lib/context";
import { logoutAction } from "../actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function MorePage() {
  const t = useTranslations();
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("common.wiecej")}</h1>
      <div className="mt-6 flex flex-col gap-6">
        <InstallPrompt />
        <Suspense fallback={<p className="text-zinc-500">{t("common.ladowanie")}</p>}>
          <Links />
        </Suspense>
        <Suspense fallback={null}>
          <LanguageSection />
        </Suspense>
        <form action={logoutAction}>
          <SubmitButton variant="secondary" pendingLabel={t("common.wylogowywanie")}>
            {t("common.wyloguj")}
          </SubmitButton>
        </form>
      </div>
    </>
  );
}

async function Links() {
  const t = await getTranslations();
  const ctx = await requireContext();
  // Właściciel platformy widzi skrót do panelu /admin (zwykły trener nie ma tej pozycji)
  const { data: platformAdmin } = await ctx.db.from("platform_admins").select("user_id").eq("user_id", ctx.userId).maybeSingle();
  const items = [
    { href: "/app/packages", label: t("common.szablony_pakietow"), show: hasPermission(ctx, "packages.read") },
    { href: "/app/sessions/types", label: t("common.rodzaje_zajec"), show: hasPermission(ctx, "sessions.read") },
    { href: "/app/team", label: t("common.zespol"), show: hasPermission(ctx, "members.read") },
    { href: "/app/settings", label: t("settings.link"), show: hasPermission(ctx, "organization.update") },
    { href: "/app/notifications", label: t("common.powiadomienia"), show: true },
    { href: "/app/notifications/settings", label: t("trainer.morePage.ustawienia_powiadomien_i_push"), show: true },
    { href: "/app/feedback", label: t("report.link"), show: true },
    { href: "/admin", label: t("trainer.morePage.panel_wlasciciela_platformy"), show: Boolean(platformAdmin) },
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
