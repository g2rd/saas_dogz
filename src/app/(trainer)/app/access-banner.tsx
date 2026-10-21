import { getRequestContext } from "@/modules/core";
import { supportEmail } from "@/shared/env";
import { getFormats } from "@/shared/i18n/server";
import { getTranslations } from "next-intl/server";

const DAY_MS = 86_400_000;

/** Pasek nad treścią: tryb „tylko do odczytu” albo zbliżający się koniec okresu dostępu (ustawianego przez obsługę). */
export async function AccessBanner() {
  const t = await getTranslations();
  const ctx = await getRequestContext();
  const formats = await getFormats();
  if (!ctx.ok || !ctx.value.access) return null;
  const { status, until } = ctx.value.access;
  const contact = supportEmail();
  // Adres obsługi (opcjonalny) trafia do komunikatu jako parametr; "none" oznacza brak adresu
  const contactParam = contact ?? "none";

  if (status === "read_only") {
    return (
      <p role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
        {t("trainer.accessBanner.read_only", { contact: contactParam })}
      </p>
    );
  }

  if (until) {
    const daysLeft = Math.ceil((until.getTime() - ctx.value.clock.now().getTime()) / DAY_MS);
    if (daysLeft <= 7) {
      const date = formats.date(until, "Europe/Warsaw");
      return (
        <p role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          {t("trainer.accessBanner.ending", {
            kind: status === "trial" ? "trial" : "access",
            date,
            lastDay: daysLeft <= 1 ? "yes" : "no",
            days: daysLeft,
            contact: contactParam,
          })}
        </p>
      );
    }
  }
  return null;
}
