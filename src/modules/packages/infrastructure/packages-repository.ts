import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import type { SaleDraft } from "../domain/sale";
import type { LedgerReason } from "../domain/ledger";

const COLUMNS =
  "id, organization_id, client_id, dog_id, name, sessions_total, valid_from, valid_until, price_minor, currency, canceled_at, created_at, balance";

export type PackageRecord = {
  id: string;
  organizationId: string;
  clientId: string;
  dogId: string | null;
  name: string;
  sessionsTotal: number;
  validFrom: string;
  validUntil: string | null;
  priceMinor: number;
  currency: string;
  canceledAt: Date | null;
  createdAt: Date;
  balance: number;
};

export type LedgerRecord = {
  id: string;
  delta: number;
  reason: LedgerReason;
  note: string | null;
  createdAt: Date;
};

type PackageRow = {
  id: string;
  organization_id: string;
  client_id: string;
  dog_id: string | null;
  name: string;
  sessions_total: number;
  valid_from: string;
  valid_until: string | null;
  price_minor: number;
  currency: string;
  canceled_at: string | null;
  created_at: string;
  balance: number;
};

type LedgerRow = {
  id: string;
  delta: number;
  reason: LedgerReason;
  note: string | null;
  created_at: string;
};

function toPackage(row: PackageRow): PackageRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    dogId: row.dog_id,
    name: row.name,
    sessionsTotal: row.sessions_total,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    priceMinor: row.price_minor,
    currency: row.currency,
    canceledAt: row.canceled_at ? new Date(row.canceled_at) : null,
    createdAt: new Date(row.created_at),
    balance: row.balance,
  };
}

const notFound = () => appError("not_found", "Nie znaleziono pakietu.");

export function packagesRepository(db: SupabaseClient) {
  return {
    async listByClient(organizationId: string, clientId: string): Promise<Result<PackageRecord[]>> {
      const { data, error } = await db
        .from("v_client_package_balance")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) return err(fromDbError(error));
      return ok((data as PackageRow[]).map(toPackage));
    },

    async get(organizationId: string, id: string): Promise<Result<PackageRecord>> {
      const { data, error } = await db
        .from("v_client_package_balance")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(notFound());
      return ok(toPackage(data as PackageRow));
    },

    /** Aktywne pakiety, którym zostało od 1 do `threshold` zajęć (nieanulowane, nieprzeterminowane). */
    async listLowBalance(organizationId: string, threshold: number, today: string): Promise<Result<PackageRecord[]>> {
      const { data, error } = await db
        .from("v_client_package_balance")
        .select(COLUMNS)
        .eq("organization_id", organizationId)
        .gt("balance", 0)
        .lte("balance", threshold)
        .is("canceled_at", null)
        .or(`valid_until.is.null,valid_until.gte.${today}`)
        .order("balance")
        .limit(200);
      if (error) return err(fromDbError(error));
      return ok((data as PackageRow[]).map(toPackage));
    },

    async listLedger(organizationId: string, packageId: string): Promise<Result<LedgerRecord[]>> {
      const { data, error } = await db
        .from("package_ledger")
        .select("id, delta, reason, note, created_at")
        .eq("organization_id", organizationId)
        .eq("client_package_id", packageId)
        .order("created_at", { ascending: false });
      if (error) return err(fromDbError(error));
      return ok(
        (data as LedgerRow[]).map((row) => ({
          id: row.id,
          delta: row.delta,
          reason: row.reason,
          note: row.note,
          createdAt: new Date(row.created_at),
        })),
      );
    },

    /** Atomowa sprzedaż (funkcja SQL): pakiet, wpis „zakup" w dzienniku, należność, zdarzenie, audyt. */
    async sell(organizationId: string, draft: SaleDraft): Promise<Result<string>> {
      const { data, error } = await db.rpc("sell_package", {
        p_org: organizationId,
        p_client: draft.clientId,
        p_dog: draft.dogId,
        p_template: draft.templateId,
        p_name: draft.name,
        p_sessions: draft.sessionsCount,
        p_price_minor: draft.priceMinor,
        p_currency: draft.currency,
        p_valid_from: draft.validFrom,
        p_valid_until: draft.validUntil,
        p_due_date: draft.dueDate,
      });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },

    async adjust(
      organizationId: string,
      packageId: string,
      delta: number,
      reason: "adjustment" | "refund",
      note: string | null,
    ): Promise<Result<string>> {
      const { data, error } = await db.rpc("adjust_package", {
        p_org: organizationId,
        p_package: packageId,
        p_delta: delta,
        p_reason: reason,
        p_note: note,
      });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },
  };
}
