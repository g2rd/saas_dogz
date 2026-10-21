import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clock } from "./clock";

/**
 * Kontekst klienta w panelu `/portal`: zalogowana osoba z dostępem do jednej kartoteki klienta.
 * Nie ma roli ani uprawnień personelu; dane chroni wyłącznie RLS (polityki dla klienta).
 */
export type ClientRequestContext = {
  userId: string;
  organizationId: string;
  clientId: string;
  db: SupabaseClient;
  clock: Clock;
  /** Stan dostępu szkoły; brak = pełny dostęp (np. w testach). */
  access?: OrgAccess;
};

/** Stan dostępu szkoły ustawiany przez właściciela platformy. Zawieszona szkoła nie dostaje kontekstu w ogóle. */
export type OrgAccess = {
  status: "trial" | "active" | "read_only";
  /** Koniec okresu próbnego lub opłaconego okresu; `null` = bez terminu. */
  until: Date | null;
  reason: string | null;
};

/** Kontekst żądania personelu przekazywany do każdego przypadku użycia. */
export type RequestContext = {
  userId: string;
  organizationId: string;
  /** Rola w organizacji; walidowana w module core. */
  role: string;
  /** Klient bazy działający jako zalogowany użytkownik, więc RLS zawsze obowiązuje. */
  db: SupabaseClient;
  clock: Clock;
  /** Stan dostępu szkoły; brak = pełny dostęp (np. w testach). */
  access?: OrgAccess;
};
