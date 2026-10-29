import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, publicEnv } from "../env";

const PROTECTED_PREFIXES = ["/app", "/portal", "/admin"];

/** Odświeża sesję Supabase i przekierowuje niezalogowanych z tras chronionych. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!hasSupabaseEnv()) return response;

  const env = publicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims weryfikuje podpis JWT; nie wolno ufać samemu ciasteczku.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Wywołania akcji serwerowych (nagłówek `next-action`) przepuszczamy: każda akcja sama sprawdza sesję (kontekst, RLS) i odsyła
  // do logowania z wyjaśnieniem (`toFormState`); przekierowanie z proxy zostawiłoby formularz bez reakcji.
  const isServerAction = request.headers.has("next-action");

  if (isProtected && !isAuthenticated && !isServerAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    // Ciasteczko sesji jest, ale nie przechodzi weryfikacji (wygasła lub unieważniona): login pokaże wyjaśnienie.
    // Kod 303 sprawia, że także wysłanie formularza (POST) kończy się zwykłym wejściem na stronę logowania.
    const hadSession = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
    if (hadSession) url.searchParams.set("expired", "1");
    return NextResponse.redirect(url, 303);
  }

  return response;
}
