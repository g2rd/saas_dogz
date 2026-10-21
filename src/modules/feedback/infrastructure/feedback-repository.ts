import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { err, ok, type Result } from "@/shared/result";
import type { FeedbackAudience, FeedbackInput } from "../domain/feedback";

/** Repozytorium w kontekście użytkownika: dodaje własne zgłoszenie (RLS pilnuje autora, roli i szkoły). */
export function feedbackRepository(db: SupabaseClient) {
  return {
    async insert(
      organizationId: string,
      userId: string,
      audience: FeedbackAudience,
      locale: string | null,
      input: FeedbackInput,
    ): Promise<Result<void>> {
      const { error } = await db.from("feedback").insert({
        organization_id: organizationId,
        user_id: userId,
        audience,
        kind: input.kind,
        message: input.message,
        page: input.page,
        locale,
      });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },
  };
}
