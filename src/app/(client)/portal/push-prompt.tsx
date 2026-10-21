import Link from "next/link";
import { getNotificationPreferences } from "@/modules/notifications";
import { requirePortalContext } from "../_lib/context";
import { getTranslations } from "next-intl/server";

/** Zachęta do włączenia powiadomień push, dopóki żadne urządzenie klienta nie ma włączonego pusha. */
export async function PushPrompt() {
  const t = await getTranslations();
  const ctx = await requirePortalContext();
  const result = await getNotificationPreferences(ctx);
  if (!result.ok || result.value.pushDevices > 0 || !result.value.preferences.push) return null;

  return (
    <aside className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm">
      <p>
        {t.rich("portal.pushPrompt.text", { strong: (chunks) => <span className="font-medium">{chunks}</span> })}
      </p>
      <Link
        href="/portal/more"
        className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
      >
        {t("portal.pushPrompt.wlacz")}
      </Link>
    </aside>
  );
}
