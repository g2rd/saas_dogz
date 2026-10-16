const BASE = "http://localhost";
const MAX_LENGTH = 500;

/**
 * Bezpieczny adres docelowy po logowaniu (parametr `next`).
 * Przepuszcza wyłącznie ścieżki względne wewnątrz jednego z dozwolonych prefiksów;
 * wszystko inne (inny host, `//host`, `\`, `..`, znaki sterujące) zamienia na `fallback`.
 */
export function safeNextPath(
  raw: unknown,
  allowedPrefixes: readonly string[] = ["/app"],
  fallback = "/app",
): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (/[\u0000- \u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  // Po normalizacji adres nadal musi wskazywać na ten sam host (blokuje m.in. "/\\evil.com").
  if (url.origin !== BASE) return fallback;

  const { pathname } = url;
  const allowed = allowedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return allowed ? `${pathname}${url.search}` : fallback;
}
