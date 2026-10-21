import { appError, type AppError } from "../errors";
import { msg } from "@/shared/i18n/messages";

type DbError = { code?: string; message: string };

/** Mapuje błąd PostgREST/PostgreSQL na błąd aplikacji. */
export function fromDbError(error: DbError): AppError {
  switch (error.code) {
    case "42501":
      return appError("forbidden", msg("errors.db.forbidden"));
    case "P0002":
      return appError("not_found", msg("errors.db.not_found"));
    case "23P01":
      // Kolizja terminów trenera (exclusion constraint na training_sessions).
      return appError("conflict", msg("errors.db.overlap"), { reason: "overlap" });
    case "DT001":
      return appError("conflict", msg("errors.db.no_package"), { reason: "no_package" });
    case "DT003":
      return appError("conflict", msg("errors.db.throttled"), { reason: "throttled" });
    case "DT004":
      return appError("conflict", msg("errors.db.invitation_unusable"), { reason: "invitation_unusable" });
    case "DT005":
      return appError("conflict", msg("errors.db.email_mismatch"), { reason: "email_mismatch" });
    case "DT007":
      return appError("conflict", msg("errors.db.not_free_slot"), { reason: "not_free_slot" });
    case "DT008":
      return appError("conflict", msg("errors.db.offer_exists"), { reason: "offer_exists" });
    case "DT009":
      return appError("conflict", msg("errors.db.offer_closed"), { reason: "offer_closed" });
    case "DT010":
      return appError("conflict", msg("errors.db.charge_paid"), { reason: "charge_paid" });
    case "DT011":
      return appError("conflict", msg("errors.db.package_used"), { reason: "package_used" });
    case "DT012":
      return appError("conflict", msg("errors.db.undo_window"), { reason: "undo_window" });
    case "DT013":
      return appError("conflict", msg("errors.db.slot_filled"), { reason: "slot_filled" });
    case "DT014":
      return appError("conflict", msg("errors.db.already_voided"), { reason: "already_voided" });
    case "DT015":
      return appError("forbidden", msg("errors.db.read_only"), { reason: "read_only" });
    case "DT018":
      return appError("conflict", msg("errors.db.currency_locked"), { reason: "currency_locked" });
    case "DT017":
      return appError("conflict", msg("errors.db.rate_limited"), { reason: "rate_limited" });
    case "DT016":
      return appError("forbidden", msg("errors.db.signup_closed"), { reason: "signup_closed" });
    case "DT006":
      return appError("conflict", msg("errors.db.already_member"), { reason: "already_member" });
    case "DT002":
      return appError("conflict", msg("errors.db.not_scheduled"), { reason: "not_scheduled" });
    case "23505":
      return appError("conflict", msg("errors.db.duplicate"));
    case "23503":
    case "23514":
    case "23502":
      return appError("validation", msg("errors.db.constraint"), error.message);
    default:
      return appError("internal", msg("errors.db.generic"), error.message);
  }
}
