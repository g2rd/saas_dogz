"use server";

import { revalidatePath } from "next/cache";
import { createMemberInvitation, revokeMemberInvitation, type MemberInviteState } from "@/modules/invitations";
import { toFormState } from "@/shared/form";
import { requireContext } from "../../_lib/context";

export async function inviteMemberAction(_prev: MemberInviteState, formData: FormData): Promise<MemberInviteState> {
  const ctx = await requireContext();
  const result = await createMemberInvitation(ctx, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);

  revalidatePath("/app/team");
  const { link, emailSent, expiresAt } = result.value;
  return { created: { link, emailSent, expiresAt: expiresAt.toISOString(), email: String(formData.get("email") ?? "").trim().toLowerCase() } };
}

export async function revokeMemberInvitationAction(invitationId: string) {
  const ctx = await requireContext();
  const result = await revokeMemberInvitation(ctx, invitationId);
  if (!result.ok) throw new Error(result.error.message);
  revalidatePath("/app/team");
}
