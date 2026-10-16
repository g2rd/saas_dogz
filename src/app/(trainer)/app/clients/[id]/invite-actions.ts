"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { approveDog, rejectDog } from "@/modules/dogs";
import {
  createClientInvitation,
  deliverClientInvitation,
  revokeClientAccess,
  type DeliverActionState,
  type InviteActionState,
} from "@/modules/invitations";
import { toFormState } from "@/shared/form";
import { requireContext } from "../../../_lib/context";

/** Identyfikator klienta z adresu zawsze wygrywa z polami formularza. */
export async function createInviteAction(
  clientId: string,
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const ctx = await requireContext();
  const result = await createClientInvitation(ctx, { ...Object.fromEntries(formData), clientId });
  if (!result.ok) return toFormState(result.error, formData);

  revalidatePath(`/app/clients/${clientId}`);
  const { link, code, qrSvg, expiresAt } = result.value;
  return { created: { link, code, qrSvg, expiresAt: expiresAt.toISOString() } };
}

/** Wysyła klientowi zaproszenie e-mailem; serwer sam weryfikuje link i kod. */
export async function deliverInviteAction(
  clientId: string,
  _prev: DeliverActionState,
  formData: FormData,
): Promise<DeliverActionState> {
  const ctx = await requireContext();
  const result = await deliverClientInvitation(ctx, { ...Object.fromEntries(formData), clientId });
  if (!result.ok) return { error: result.error.message };
  return { message: `Wysłano e-mail na adres ${result.value.recipient}.` };
}

export async function revokeAccessAction(clientId: string, userId: string) {
  const ctx = await requireContext();
  const result = await revokeClientAccess(ctx, clientId, userId);
  if (!result.ok) throw new Error(result.error.message);
  redirect(`/app/clients/${clientId}`);
}

export async function approveDogAction(clientId: string, dogId: string) {
  const ctx = await requireContext();
  const result = await approveDog(ctx, dogId);
  if (!result.ok) throw new Error(result.error.message);
  redirect(`/app/clients/${clientId}`);
}

export async function rejectDogAction(clientId: string, dogId: string) {
  const ctx = await requireContext();
  const result = await rejectDog(ctx, dogId);
  if (!result.ok) throw new Error(result.error.message);
  redirect(`/app/clients/${clientId}`);
}
