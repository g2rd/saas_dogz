import { z } from "zod";
import { fromDbError } from "@/shared/db/errors";
import { formInt, parseInput } from "@/shared/form";
import { isSupportedCurrency, isSupportedTimeZone } from "@/shared/i18n/currency";
import { enabledLocales } from "@/shared/i18n/locale";
import { msg } from "@/shared/i18n/messages";
import type { RequestContext } from "@/shared/context";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import { authorize } from "./authorize";
import { getOrganizationSettings, type OrganizationSettings } from "./organization";

/** Najdłuższy próg późnego odwołania (30 dni); zgodny z ograniczeniem w bazie. */
export const MAX_LATE_CANCEL_HOURS = 720;

const schema = z.object({
  currency: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().refine(isSupportedCurrency, msg("settings.validation.currency")),
  ),
  timezone: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().refine(isSupportedTimeZone, msg("settings.validation.timezone"))),
  locale: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.string()),
  lateCancelHours: formInt(0, MAX_LATE_CANCEL_HOURS, msg("settings.validation.late_cancel_hours", { max: MAX_LATE_CANCEL_HOURS })),
  lateCancelConsumesSession: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export type SchoolSettingsOverview = {
  settings: OrganizationSettings;
  /** Szkoła ma pakiety, należności lub wpłaty, więc walutę zmienić można dopiero po kontakcie z obsługą. */
  currencyLocked: boolean;
};

async function hasMoneyRecords(ctx: RequestContext): Promise<Result<boolean>> {
  for (const table of ["client_packages", "charges", "payments"]) {
    const { data, error } = await ctx.db.from(table).select("id").eq("organization_id", ctx.organizationId).limit(1);
    if (error) return err(fromDbError(error));
    if (data.length > 0) return ok(true);
  }
  return ok(false);
}

/** Ustawienia szkoły do ekranu edycji: wartości i informacja, czy waluta jest zablokowana. Tylko owner i admin. */
export async function getSchoolSettings(ctx: RequestContext): Promise<Result<SchoolSettingsOverview>> {
  const allowed = authorize(ctx, "organization.update");
  if (!allowed.ok) return err(allowed.error);

  const [settings, locked] = await Promise.all([getOrganizationSettings(ctx), hasMoneyRecords(ctx)]);
  if (!settings.ok) return err(settings.error);
  if (!locked.ok) return err(locked.error);
  return ok({ settings: settings.value, currencyLocked: locked.value });
}

/**
 * Zapisuje ustawienia szkoły (waluta, strefa czasowa, język, polityka późnych odwołań). Walutę można zmienić tylko w szkole bez
 * rekordów z kwotami; ostatnią barierą jest wyzwalacz w bazie (DT018), więc obejście przez API też nie zadziała.
 * `enabled` pozwala testom podać dozwolone języki; domyślnie języki włączone zmienną `ENABLED_LOCALES`.
 */
export async function updateSchoolSettings(
  ctx: RequestContext,
  raw: unknown,
  enabled: readonly string[] = enabledLocales(),
): Promise<Result<OrganizationSettings>> {
  const allowed = authorize(ctx, "organization.update");
  if (!allowed.ok) return err(allowed.error);

  const input = parseInput(schema, raw);
  if (!input.ok) return err(input.error);
  const value = input.value;
  if (!enabled.includes(value.locale)) {
    return err(appError("validation", msg("settings.validation.locale"), { locale: [msg("settings.validation.locale")] }));
  }

  const current = await getOrganizationSettings(ctx);
  if (!current.ok) return err(current.error);
  if (value.currency !== current.value.currency) {
    const locked = await hasMoneyRecords(ctx);
    if (!locked.ok) return err(locked.error);
    if (locked.value) return err(appError("conflict", msg("errors.db.currency_locked"), { reason: "currency_locked" }));
  }

  const { error } = await ctx.db
    .from("organization_settings")
    .update({
      currency: value.currency,
      timezone: value.timezone,
      locale: value.locale,
      late_cancel_hours: value.lateCancelHours,
      late_cancel_consumes_session: value.lateCancelConsumesSession,
    })
    .eq("organization_id", ctx.organizationId);
  if (error) return err(fromDbError(error));

  return ok({
    currency: value.currency,
    timezone: value.timezone,
    locale: value.locale,
    lateCancelHours: value.lateCancelHours,
    lateCancelConsumesSession: value.lateCancelConsumesSession,
  });
}
