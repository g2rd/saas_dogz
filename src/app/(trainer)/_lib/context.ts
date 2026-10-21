import { redirect } from "next/navigation";
import { getRequestContext } from "@/modules/core";
import type { RequestContext } from "@/shared/context";

/** Kontekst dla stron i akcji panelu trenera; niezalogowanych odsyła do logowania, bez organizacji do kreatora. */
export async function requireContext(): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (ctx.ok) return ctx.value;
  if (ctx.error.code === "unauthenticated") redirect("/login");
  if (ctx.error.code === "no_organization") redirect("/app");
  if (ctx.error.code === "org_suspended") redirect("/suspended");
  throw new Error(ctx.error.message);
}
