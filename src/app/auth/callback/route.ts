import { NextResponse, type NextRequest } from "next/server";
import { CALLBACK_NEXT_PREFIXES, exchangeAuthCode, safeNextPath } from "@/modules/core";
import { createUserClient } from "@/shared/supabase/server";

/** Cel linków z e-maili Supabase (potwierdzenie konta, reset hasła): wymienia kod na sesję i przekierowuje. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), CALLBACK_NEXT_PREFIXES);

  const db = await createUserClient();
  const result = await exchangeAuthCode(db, searchParams.get("code"));
  if (!result.ok) {
    return NextResponse.redirect(new URL("/forgot-password?error=link", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
