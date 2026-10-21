"use server";

import { redirect } from "next/navigation";
import { createOrganization } from "@/modules/core";
import { toFormState, type FormState } from "@/shared/form";
import { currencyFor } from "@/shared/i18n/currency";
import { getLocaleContext } from "@/shared/i18n/server";
import { createUserClient } from "@/shared/supabase/server";

export async function createOrganizationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await createUserClient();
  // Waluta, język i strefa czasowa szkoły z urządzenia (język i region z przeglądarki, strefa z ukrytego pola formularza)
  const locale = await getLocaleContext();
  const timezone = formData.get("timezone");
  const result = await createOrganization(db, Object.fromEntries(formData), {
    settings: {
      currency: currencyFor(locale.preferred, locale.region),
      locale: locale.preferred,
      timezone: typeof timezone === "string" ? timezone : undefined,
    },
  });
  if (!result.ok) return toFormState(result.error, formData);
  redirect("/app");
}

export async function logoutAction() {
  const db = await createUserClient();
  await db.auth.signOut();
  redirect("/login");
}
