"use server";

import { getLocaleContext } from "@/shared/i18n/server";
import { submitFeedback, type FeedbackFormState } from "@/modules/feedback";
import { msg } from "@/shared/i18n/messages";
import { toFormState } from "@/shared/form";
import { requirePortalContext } from "../../_lib/context";

export async function submitPortalFeedbackAction(_prev: FeedbackFormState, formData: FormData): Promise<FeedbackFormState> {
  const ctx = await requirePortalContext();
  const { locale } = await getLocaleContext();
  const result = await submitFeedback(ctx, "client", locale, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  return { message: msg("report.thanks") };
}
