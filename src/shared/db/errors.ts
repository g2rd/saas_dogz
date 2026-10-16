import { appError, type AppError } from "../errors";

type DbError = { code?: string; message: string };

/** Mapuje błąd PostgREST/PostgreSQL na błąd aplikacji. */
export function fromDbError(error: DbError): AppError {
  switch (error.code) {
    case "42501":
      return appError("forbidden", "Brak uprawnień do tej operacji.");
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
