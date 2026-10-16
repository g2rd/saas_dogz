import { appError, type AppError } from "../errors";

type DbError = { code?: string; message: string };

/** Mapuje błąd PostgREST/PostgreSQL na błąd aplikacji. */
export function fromDbError(error: DbError): AppError {
  switch (error.code) {
    case "42501":
      return appError("forbidden", "Brak uprawnień do tej operacji.");
    case "P0002":
      return appError("not_found", "Nie znaleziono rekordu.");
    case "23P01":
      // Kolizja terminów trenera (exclusion constraint na training_sessions).
      return appError("conflict", "Trener ma już zajęcia w tym czasie.", { reason: "overlap" });
    case "DT001":
      return appError("conflict", "Klient nie ma pakietu z wolnymi zajęciami.", { reason: "no_package" });
    case "DT003":
      return appError("conflict", "Zbyt wiele nieudanych prób. Spróbuj ponownie za kilka minut.", { reason: "throttled" });
    case "DT004":
      return appError("conflict", "To zaproszenie wygasło lub zostało już użyte.", { reason: "invitation_unusable" });
    case "DT005":
      return appError("conflict", "To zaproszenie jest przypisane do innego adresu e-mail.", { reason: "email_mismatch" });
    case "DT007":
      return appError("conflict", "Wolny termin można ogłosić tylko dla odwołanych zajęć, które jeszcze się nie odbyły.", { reason: "not_free_slot" });
    case "DT008":
      return appError("conflict", "Ten termin jest już ogłoszony.", { reason: "offer_exists" });
    case "DT009":
      return appError("conflict", "To ogłoszenie nie jest już otwarte (termin zajęty lub zamknięty).", { reason: "offer_closed" });
    case "DT006":
      return appError("conflict", "Ta osoba ma już dostęp do tej organizacji.", { reason: "already_member" });
    case "DT002":
      return appError("conflict", "Te zajęcia zostały już rozliczone lub odwołane.", { reason: "not_scheduled" });
    case "23505":
      return appError("conflict", "Taki rekord już istnieje.");
    case "23503":
    case "23514":
    case "23502":
      return appError("validation", "Dane nie spełniają ograniczeń bazy.", error.message);
    default:
      return appError("internal", "Operacja nie powiodła się.", error.message);
  }
}
