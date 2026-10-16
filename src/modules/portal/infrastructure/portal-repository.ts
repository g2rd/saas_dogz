import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import type { PortalDog, PortalPayment, PortalSession } from "../domain/portal";

// Raw rows from the views and tables the client may read through RLS (read model).
export type PackageRow = {
  id: string;
  name: string;
  sessions_total: number;
  balance: number;
  valid_until: string | null;
  price_minor: number;
  currency: string;
  canceled_at: string | null;
};

export type ChargeRow = {
  id: string;
  description: string;
  amount_minor: number;
  allocated_minor: number;
  currency: string;
  due_date: string;
  voided_at: string | null;
};

type SessionRow = {
  id: string;
  type_name: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  dog_name: string | null;
  status: PortalSession["status"];
};

type DogRow = {
  id: string;
  name: string;
  breed: string | null;
  birth_date: string | null;
  sex: PortalDog["sex"];
  approval_status: PortalDog["approvalStatus"];
};

export function portalRepository(db: SupabaseClient, organizationId: string, clientId: string) {
  return {
    async getHeader(): Promise<Result<{ organizationName: string; timezone: string; clientFirstName: string }>> {
      const [org, settings, client] = await Promise.all([
        db.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
        db.from("organization_settings").select("timezone").eq("organization_id", organizationId).maybeSingle(),
        db.from("clients").select("first_name").eq("organization_id", organizationId).eq("id", clientId).maybeSingle(),
      ]);
      if (org.error) return err(fromDbError(org.error));
      if (client.error) return err(fromDbError(client.error));
      if (!client.data) return err(appError("not_found", "Nie znaleziono konta klienta."));
      return ok({
        organizationName: (org.data as { name: string } | null)?.name ?? "",
        timezone: (settings.data as { timezone: string } | null)?.timezone ?? "Europe/Warsaw",
        clientFirstName: (client.data as { first_name: string }).first_name,
      });
    },

    async listPackages(): Promise<Result<PackageRow[]>> {
      const { data, error } = await db
        .from("v_client_package_balance")
        .select("id, name, sessions_total, balance, valid_until, price_minor, currency, canceled_at")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) return err(fromDbError(error));
      return ok(data as PackageRow[]);
    },

    async listCharges(): Promise<Result<ChargeRow[]>> {
      const { data, error } = await db
        .from("v_charge_balance")
        .select("id, description, amount_minor, allocated_minor, currency, due_date, voided_at")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("due_date")
        .order("created_at");
      if (error) return err(fromDbError(error));
      return ok(data as ChargeRow[]);
    },

    async listPayments(): Promise<Result<PortalPayment[]>> {
      const { data, error } = await db
        .from("payments")
        .select("id, amount_minor, currency, paid_at, method")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .is("voided_at", null)
        .order("paid_at", { ascending: false })
        .limit(50);
      if (error) return err(fromDbError(error));
      return ok(
        (data as { id: string; amount_minor: number; currency: string; paid_at: string; method: PortalPayment["method"] }[]).map(
          (row) => ({
            id: row.id,
            amountMinor: row.amount_minor,
            currency: row.currency,
            paidAt: new Date(row.paid_at),
            method: row.method,
          }),
        ),
      );
    },

    async listSessions(options: {
      status: PortalSession["status"];
      from?: Date;
      newestFirst?: boolean;
      limit: number;
    }): Promise<Result<PortalSession[]>> {
      let query = db
        .from("v_session_details")
        .select("id, type_name, starts_at, ends_at, location, dog_name, status")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .eq("status", options.status)
        .order("starts_at", { ascending: !options.newestFirst })
        .limit(options.limit);
      if (options.from) query = query.gte("starts_at", options.from.toISOString());

      const { data, error } = await query;
      if (error) return err(fromDbError(error));
      return ok(
        (data as SessionRow[]).map((row) => ({
          id: row.id,
          typeName: row.type_name,
          startsAt: new Date(row.starts_at),
          endsAt: new Date(row.ends_at),
          location: row.location,
          dogName: row.dog_name,
          status: row.status,
        })),
      );
    },

    async listDogs(): Promise<Result<PortalDog[]>> {
      const { data, error } = await db
        .from("dogs")
        .select("id, name, breed, birth_date, sex, approval_status")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .is("archived_at", null)
        .order("name");
      if (error) return err(fromDbError(error));
      return ok(
        (data as DogRow[]).map((row) => ({
          id: row.id,
          name: row.name,
          breed: row.breed,
          birthDate: row.birth_date,
          sex: row.sex,
          approvalStatus: row.approval_status,
        })),
      );
    },
  };
}
