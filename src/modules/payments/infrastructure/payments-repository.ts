import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import type { Allocation } from "../domain/allocation";
import type { Charge, ClientBalance, Payment, PaymentMethod } from "../domain/payment";

const CHARGE_COLUMNS =
  "id, client_id, source_type, source_id, amount_minor, allocated_minor, currency, due_date, description, voided_at, created_at";

type ChargeRow = {
  id: string;
  client_id: string;
  source_type: Charge["sourceType"];
  source_id: string | null;
  amount_minor: number;
  allocated_minor: number;
  currency: string;
  due_date: string;
  description: string;
  voided_at: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  client_id: string;
  amount_minor: number;
  currency: string;
  paid_at: string;
  method: PaymentMethod;
  reference: string | null;
  voided_at: string | null;
};

function toCharge(row: ChargeRow): Charge {
  return {
    id: row.id,
    clientId: row.client_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    amountMinor: row.amount_minor,
    allocatedMinor: row.allocated_minor,
    currency: row.currency,
    dueDate: row.due_date,
    description: row.description,
    voidedAt: row.voided_at ? new Date(row.voided_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export type RecordPaymentCommand = {
  clientId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  paidAt: string | null;
  reference: string | null;
  allocations: Allocation[];
};

export function paymentsRepository(db: SupabaseClient) {
  return {
    async listChargesByClient(organizationId: string, clientId: string): Promise<Result<Charge[]>> {
      const { data, error } = await db
        .from("v_charge_balance")
        .select(CHARGE_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("due_date")
        .order("created_at");
      if (error) return err(fromDbError(error));
      return ok((data as ChargeRow[]).map(toCharge));
    },

    /** Nieanulowane należności z terminem przed `before` (filtr „nie rozliczone w całości" robi aplikacja). */
    async listDueBefore(organizationId: string, before: string): Promise<Result<Charge[]>> {
      const { data, error } = await db
        .from("v_charge_balance")
        .select(CHARGE_COLUMNS)
        .eq("organization_id", organizationId)
        .is("voided_at", null)
        .lt("due_date", before)
        .order("due_date")
        .limit(500);
      if (error) return err(fromDbError(error));
      return ok((data as ChargeRow[]).map(toCharge));
    },

    async listPaymentsByClient(organizationId: string, clientId: string): Promise<Result<Payment[]>> {
      const { data, error } = await db
        .from("payments")
        .select("id, client_id, amount_minor, currency, paid_at, method, reference, voided_at")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("paid_at", { ascending: false });
      if (error) return err(fromDbError(error));
      return ok(
        (data as PaymentRow[]).map((row) => ({
          id: row.id,
          clientId: row.client_id,
          amountMinor: row.amount_minor,
          currency: row.currency,
          paidAt: new Date(row.paid_at),
          method: row.method,
          reference: row.reference,
          voidedAt: row.voided_at ? new Date(row.voided_at) : null,
        })),
      );
    },

    async getClientBalance(organizationId: string, clientId: string): Promise<Result<ClientBalance>> {
      const { data, error } = await db
        .from("v_client_balance")
        .select("client_id, charged_minor, allocated_minor, paid_minor")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(appError("not_found", "Nie znaleziono klienta."));
      const row = data as { client_id: string; charged_minor: number; allocated_minor: number; paid_minor: number };
      return ok({
        clientId: row.client_id,
        chargedMinor: row.charged_minor,
        allocatedMinor: row.allocated_minor,
        paidMinor: row.paid_minor,
      });
    },

    /** Atomowy zapis wpłaty z alokacjami (funkcja SQL pilnuje niezmienników i blokuje należności). */
    async record(organizationId: string, command: RecordPaymentCommand): Promise<Result<string>> {
      const { data, error } = await db.rpc("record_payment", {
        p_org: organizationId,
        p_client: command.clientId,
        p_amount_minor: command.amountMinor,
        p_currency: command.currency,
        p_method: command.method,
        p_paid_at: command.paidAt,
        p_reference: command.reference,
        p_allocations: command.allocations.map((a) => ({ charge_id: a.chargeId, amount_minor: a.amountMinor })),
      });
      if (error) return err(fromDbError(error));
      return ok(data as string);
    },

    async voidPayment(organizationId: string, paymentId: string): Promise<Result<void>> {
      const { error } = await db.rpc("void_payment", { p_org: organizationId, p_payment: paymentId });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },

    async voidCharge(organizationId: string, chargeId: string): Promise<Result<void>> {
      const { error } = await db.rpc("void_charge", { p_org: organizationId, p_charge: chargeId });
      if (error) return err(fromDbError(error));
      return ok(undefined);
    },
  };
}
