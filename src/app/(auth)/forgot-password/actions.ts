"use server";

import { requestPasswordReset } from "@/modules/core";
import { siteUrl } from "@/shared/env";
import { toFormState, type FormState } from "@/shared/form";
import { createUserClient } from "@/shared/supabase/server";

export type ForgotPasswordState = FormState & { sent?: boolean };

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const db = await createUserClient();
  const result = await requestPasswordReset(db, Object.fromEntries(formData), { siteUrl: siteUrl() });
  if (!result.ok) return toFormState(result.error, formData);
  return { sent: true };
}
