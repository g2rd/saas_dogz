"use server";

import { redirect } from "next/navigation";
import { getSessionUser, recordConsent } from "@/modules/core";
import { LEGAL_VERSION } from "@/shared/legal";
import { createUserClient } from "@/shared/supabase/server";

/** Zapisuje zgodę na bieżącą wersję dokumentów i kieruje do właściwego panelu (`/start`). */
export async function acceptLegalAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user.ok) redirect("/login");
  // Pole jest wymagane w formularzu; tu sprawdzamy ponownie, bo akcję można wywołać z pominięciem przeglądarki
  if (formData.get("acceptTerms") !== "on") redirect("/accept-terms");
  await recordConsent(await createUserClient(), LEGAL_VERSION);
  redirect("/start");
}
