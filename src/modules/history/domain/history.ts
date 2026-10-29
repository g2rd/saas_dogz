/**
 * Historia zmian: wpisy dziennika audytu opisane dla człowieka (kto, co, kogo dotyczy) i informacja, czy zmianę można jeszcze cofnąć.
 * Samo cofanie wykonują istniejące przypadki użycia (anulowanie wpłaty, pakietu, cofnięcie zakończenia lub odwołania zajęć), które pilnują
 * reguł w bazie; tu tylko pokazujemy przycisk, gdy zmiana jest ostatnia i stan jeszcze na to pozwala.
 */

/** Rodzaj cofnięcia: wskazuje przypadek użycia, który wykona aplikacja. */
export const UNDO_KINDS = ["void_payment", "cancel_package", "undo_complete", "undo_cancel"] as const;
export type UndoKind = (typeof UNDO_KINDS)[number];

export function isUndoKind(value: unknown): value is UndoKind {
  return typeof value === "string" && (UNDO_KINDS as readonly string[]).includes(value);
}

/** Wpisy, które da się cofnąć, i rodzaj cofnięcia. */
export const UNDO_BY_ACTION: Readonly<Record<string, UndoKind>> = {
  "payment.recorded": "void_payment",
  "client_package.sold": "cancel_package",
  "training_session.completed": "undo_complete",
  "training_session.canceled": "undo_cancel",
};

/** Dane o obiekcie, którego dotyczy wpis (niektóre pola puste, gdy obiektu nie da się już odczytać). */
export type HistorySubject = {
  clientName: string | null;
  packageName: string | null;
  amountMinor: number | null;
  currency: string | null;
  startsAt: Date | null;
};

export type HistoryEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorName: string | null;
  createdAt: Date;
  subject: HistorySubject;
  /** Rodzaj cofnięcia, gdy wpis jest najnowszą zmianą tego obiektu i stan pozwala ją jeszcze cofnąć; inaczej `null`. */
  undo: UndoKind | null;
};

export const HISTORY_PAGE = 50;
export const HISTORY_MAX = 500;

/** Liczba wpisów z parametru adresu: liczba całkowita od 1 do `HISTORY_MAX`, domyślnie jedna strona. */
export function parseHistoryLimit(raw: unknown): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, HISTORY_MAX) : HISTORY_PAGE;
}

/** Czy dwa momenty są tego samego dnia kalendarzowego w strefie szkoły (cofnięcie zakończenia zajęć działa do końca dnia). */
export function sameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  const day = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return day(a) === day(b);
}
