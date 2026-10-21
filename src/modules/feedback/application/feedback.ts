import type { RequestContext } from "@/shared/context";
import { parseInput } from "@/shared/form";
import { err, type Result } from "@/shared/result";
import { feedbackInputSchema, type FeedbackAudience } from "../domain/feedback";
import { feedbackRepository } from "../infrastructure/feedback-repository";

/** Minimalny kontekst zgłoszenia: spełniają go zarówno kontekst personelu, jak i klienta. */
export type FeedbackScope = Pick<RequestContext, "userId" | "organizationId" | "db">;

/**
 * Zapisuje zgłoszenie problemu lub pomysłu od zalogowanej osoby. Język interfejsu to tylko wskazówka dla właściciela
 * platformy (w jakim języku odpowiedzieć); nie jest dopuszczany z formularza.
 */
export async function submitFeedback(
  scope: FeedbackScope,
  audience: FeedbackAudience,
  locale: string | null,
  raw: unknown,
): Promise<Result<void>> {
  const input = parseInput(feedbackInputSchema, raw);
  if (!input.ok) return err(input.error);
  return feedbackRepository(scope.db).insert(scope.organizationId, scope.userId, audience, locale, input.value);
}
