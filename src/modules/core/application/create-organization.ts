import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fromDbError } from "@/shared/db/errors";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import { slugify, withSuffix } from "../domain/slug";

const schema = z.object({
  name: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().min(2, "Podaj nazwę (min. 2 znaki)").max(100, "Maksymalnie 100 znaków"),
  ),
});

const MAX_ATTEMPTS = 4;

/** Tworzy organizację z bieżącym użytkownikiem jako właścicielem (atomowo, funkcją SQL). */
export async function createOrganization(db: SupabaseClient, raw: unknown): Promise<Result<string>> {
  const input = parseInput(schema, raw);
  if (!input.ok) return err(input.error);

  const base = slugify(input.value.name);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? base : withSuffix(base, crypto.randomUUID().slice(0, 4));
    const { data, error } = await db.rpc("create_organization", {
      p_name: input.value.name,
      p_slug: slug,
    });

    if (!error) return ok(data as string);
    // 23505: slug zajęty, próbujemy z sufiksem.
    if (error.code !== "23505") return err(fromDbError(error));
  }

  return err(fromDbError({ code: "23505", message: "slug taken" }));
}
