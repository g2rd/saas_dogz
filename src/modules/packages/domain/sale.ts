import { z } from "zod";
import { addDaysIso, isRealIsoDate } from "@/shared/dates";
import { appError } from "@/shared/errors";
import { emptyToNull, formAmountMinor, formOptionalInt, formText } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import type { PackageTemplate } from "./template";
import { msg } from "@/shared/i18n/messages";

const optionalDate = z.preprocess(
  emptyToNull,
  z.string().refine(isRealIsoDate, msg("validation.invalid_date")).nullable(),
);

/** Dane z formularza sprzedaży: albo szablon, albo własny pakiet (nazwa, liczba zajęć, cena). */
export const saleInputSchema = z.object({
  clientId: z.uuid(),
  dogId: z.preprocess(emptyToNull, z.uuid().nullable()),
  templateId: z.preprocess(emptyToNull, z.uuid().nullable()),
  name: formText(100),
  sessionsCount: formOptionalInt(1, 500, msg("validation.sessions_count_range")),
  price: z.preprocess(emptyToNull, formAmountMinor().nullable()),
  validityDays: formOptionalInt(1, 3650, msg("validation.validity_days_range")),
  validFrom: optionalDate,
  dueDate: optionalDate,
});

export type SaleInput = z.output<typeof saleInputSchema>;

export type SaleDraft = {
  clientId: string;
  dogId: string | null;
  templateId: string | null;
  name: string;
  sessionsCount: number;
  priceMinor: number;
  currency: string;
  validFrom: string;
  validUntil: string | null;
  dueDate: string;
};

export const DEFAULT_DUE_DAYS = 7;

type TemplateSnapshot = Pick<
  PackageTemplate,
  "name" | "sessionsCount" | "validityDays" | "priceMinor" | "currency" | "isActive" | "archivedAt"
>;

function fieldErrors(errors: Record<string, string[]>): Result<never> {
  return err(appError("validation", msg("validation.fix_fields"), errors));
}

/**
 * Zamienia dane z formularza na gotowy do zapisu pakiet. Szablon daje nazwę, liczbę zajęć, cenę
 * i ważność (cenę i ważność można nadpisać, np. rabatem); bez szablonu trzeba podać nazwę,
 * liczbę zajęć i cenę. Terminy: start domyślnie dziś, płatność za 7 dni, koniec ważności z liczby dni.
 */
export function resolveSale(
  input: SaleInput,
  template: TemplateSnapshot | null,
  today: string,
): Result<SaleDraft> {
  let name: string;
  let sessionsCount: number;
  let priceMinor: number;
  let currency = "PLN";
  let validityDays = input.validityDays;

  if (input.templateId) {
    if (!template) return fieldErrors({ templateId: ["Nie znaleziono szablonu pakietu"] });
    if (!template.isActive || template.archivedAt) {
      return fieldErrors({ templateId: ["Ten szablon jest nieaktywny"] });
    }
    name = template.name;
    sessionsCount = template.sessionsCount;
    priceMinor = input.price ?? template.priceMinor;
    currency = template.currency;
    validityDays = validityDays ?? template.validityDays;
  } else {
    const missing: Record<string, string[]> = {};
    if (input.name === "") missing.name = [msg("validation.sale_name_or_template")];
    if (input.sessionsCount === null) missing.sessionsCount = [msg("validation.sale_sessions_or_template")];
    if (input.price === null) missing.price = [msg("validation.sale_price_or_template")];
    if (Object.keys(missing).length > 0) return fieldErrors(missing);

    name = input.name;
    sessionsCount = input.sessionsCount as number;
    priceMinor = input.price as number;
  }

  const validFrom = input.validFrom ?? today;
  return ok({
    clientId: input.clientId,
    dogId: input.dogId,
    templateId: input.templateId,
    name,
    sessionsCount,
    priceMinor,
    currency,
    validFrom,
    validUntil: validityDays ? addDaysIso(validFrom, validityDays) : null,
    dueDate: input.dueDate ?? addDaysIso(today, DEFAULT_DUE_DAYS),
  });
}
