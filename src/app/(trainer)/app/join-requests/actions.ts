"use server";

import { revalidatePath } from "next/cache";
import { decideJoinRequest, rotateSchoolJoinLink } from "@/modules/invitations";
import { requireContext } from "../../_lib/context";

/** Tworzy (pierwszy raz) albo wymienia link szkoły; błąd przerywa żądanie i trafia do error boundary. */
export async function rotateSchoolLinkAction() {
  const ctx = await requireContext();
  const result = await rotateSchoolJoinLink(ctx);
  if (!result.ok) throw new Error(result.error.message);
  revalidatePath("/app/join-requests");
}

/** Akceptacja (z opcjonalnym wskazaniem istniejącego klienta w polu `clientId`) albo odrzucenie prośby. */
export async function decideJoinRequestAction(requestId: string, approve: boolean, formData: FormData) {
  const ctx = await requireContext();
  const result = await decideJoinRequest(ctx, { requestId, approve, clientId: approve ? formData.get("clientId") : null });
  if (!result.ok) throw new Error(result.error.message);
  revalidatePath("/app/join-requests");
  revalidatePath("/app/clients");
}
