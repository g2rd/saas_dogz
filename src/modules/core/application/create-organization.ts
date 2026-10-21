import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fromDbError } from "@/shared/db/errors";
import { isSupportedCurrency, isSupportedTimeZone } from "@/shared/i18n/currency";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import { slugify, withSuffix } from "../domain/slug";
import { msg } from "@/shared/i18n/messages";

const schema = z.object({
  name: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().min(2, msg("validation.organization_name")).max(100, msg("validation.max_length", { max: 100 })),
  ),
});

const MAX_ATTEMPTS = 4;

/** Ustawienia startowe szkoły wykryte z urządzenia (język, waluta z regionu, strefa czasowa); niepoprawne wartości pomijamy. */
export type InitialSettings = { currency?: string; timezone?: string; locale?: string };

function settingsPatch(settings: InitialSettings | undefined) {
  const patch: Record<string, string> = {};
  if (settings?.currency && isSupportedCurrency(settings.currency)) patch.currency = settings.currency;
  if (settings?.timezone && isSupportedTimeZone(settings.timezone)) patch.timezone = settings.timezone;
  if (settings?.locale && /^[a-z]{2,3}$/.test(settings.locale)) patch.locale = settings.locale;
  return patch;
}

/** Tworzy organizację z bieżącym użytkownikiem jako właścicielem (atomowo, funkcją SQL). */
export async function createOrganization(
  db: SupabaseClient,
  raw: unknown,
  options: { settings?: InitialSettings } = {},
): Promise<Result<string>> {
  const input = parseInput(schema, raw);
  if (!input.ok) return err(input.error);

  const base = slugify(input.value.name);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? base : withSuffix(base, crypto.randomUUID().slice(0, 4));
    const { data, error } = await db.rpc("create_organization", {
      p_name: input.value.name,
      p_slug: slug,
    });

    if (!error) {
      const organizationId = data as string;
      const patch = settingsPatch(options.settings);
      if (Object.keys(patch).length > 0) {
        // Ustawienia startowe to wygoda, nie warunek: szkoła już istnieje, więc błąd zapisu nie przerywa zakładania
        await db.from("organization_settings").update(patch).eq("organization_id", organizationId);
      }
      return ok(organizationId);
    }
    // 23505: slug zajęty, próbujemy z sufiksem.
    if (error.code !== "23505") return err(fromDbError(error));
  }

  return err(fromDbError({ code: "23505", message: "slug taken" }));
}
