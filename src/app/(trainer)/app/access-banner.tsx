import { getRequestContext } from "@/modules/core";
import { supportEmail } from "@/shared/env";

const DAY_MS = 86_400_000;

/** Pasek nad treścią: tryb „tylko do odczytu” albo zbliżający się koniec okresu dostępu (ustawianego przez obsługę). */
export async function AccessBanner() {
  const ctx = await getRequestContext();
  if (!ctx.ok || !ctx.value.access) return null;
  const { status, until } = ctx.value.access;
  const contact = supportEmail();
  const contactText = contact ? ` Napisz: ${contact}.` : "";

  if (status === "read_only") {
    return (
      <p role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
        Konto jest w trybie tylko do odczytu: możesz przeglądać dane, ale nie zapisywać zmian.{contactText}
      </p>
    );
  }

  if (until) {
    const daysLeft = Math.ceil((until.getTime() - ctx.value.clock.now().getTime()) / DAY_MS);
    if (daysLeft <= 7) {
      const date = until.toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });
      return (
        <p role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          {status === "trial" ? "Okres testów" : "Dostęp"} kończy się {date}
          {daysLeft <= 1 ? " (to ostatni dzień)" : ` (za ${daysLeft} dni)`}. Potem konto przejdzie w tryb tylko do odczytu.{contactText}
        </p>
      );
    }
  }
  return null;
}
