/**
 * Wersja regulaminu testów i polityki prywatności (data ostatniej zmiany treści w katalogach `legal` w `messages/`).
 * Zmieniasz treść dokumentów → podnieś datę: kolejne konta zapiszą zgodę na nową wersję (stare zgody zostają w bazie).
 */
export const LEGAL_VERSION = "2026-10-21";

export const LEGAL_DOCUMENTS = ["terms", "privacy"] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/** Adresy publicznych stron dokumentów. */
export const LEGAL_PATHS: Record<LegalDocument, string> = { terms: "/terms", privacy: "/privacy" };
