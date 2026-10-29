import { redirect } from "next/navigation";
import { getPortalContext } from "@/modules/portal";
import type { ClientRequestContext } from "@/shared/context";

/** Kontekst dla stron i akcji panelu klienta; niezalogowanych odsyła do logowania, konta bez dostępu do panelu trenera. */
export async function requirePortalContext(): Promise<ClientRequestContext> {
  const ctx = await getPortalContext();
  if (ctx.ok) return ctx.value;
  if (ctx.error.code === "unauthenticated") redirect("/login?next=%2Fportal&expired=1");
  if (ctx.error.code === "no_client_access") redirect("/app");
  if (ctx.error.code === "org_suspended") redirect("/suspended");
  throw new Error(ctx.error.message);
}
