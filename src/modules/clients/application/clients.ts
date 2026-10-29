import { authorize } from "@/modules/core";
import { parseInput } from "@/shared/form";
import { err, type Result } from "@/shared/result";
import type { RequestContext } from "@/shared/context";
import {
  clientInputSchemaFor,
  sanitizeSearch,
  type Client,
} from "../domain/client";
import { clientsRepository } from "../infrastructure/clients-repository";

export type ClientListQuery = { search?: string; includeArchived?: boolean };

export async function listClients(
  ctx: RequestContext,
  query: ClientListQuery = {},
): Promise<Result<Client[]>> {
  const allowed = authorize(ctx, "clients.read");
  if (!allowed.ok) return allowed;

  const search = query.search ? sanitizeSearch(query.search) : "";
  return clientsRepository(ctx.db).list(ctx.organizationId, {
    search: search || undefined,
    includeArchived: query.includeArchived,
  });
}

export async function getClient(ctx: RequestContext, id: string): Promise<Result<Client>> {
  const allowed = authorize(ctx, "clients.read");
  if (!allowed.ok) return allowed;
  return clientsRepository(ctx.db).get(ctx.organizationId, id);
}

/** `phoneCountry`: kraj (region użytkownika), z którego liczymy numery telefonu bez prefiksu. */
export type ClientOptions = { phoneCountry?: string | null };

export async function createClient(ctx: RequestContext, raw: unknown, options: ClientOptions = {}): Promise<Result<Client>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(clientInputSchemaFor(options.phoneCountry), raw);
  if (!input.ok) return err(input.error);

  return clientsRepository(ctx.db).insert(ctx.organizationId, ctx.userId, input.value);
}

export async function updateClient(
  ctx: RequestContext,
  id: string,
  raw: unknown,
  options: ClientOptions = {},
): Promise<Result<Client>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(clientInputSchemaFor(options.phoneCountry), raw);
  if (!input.ok) return err(input.error);

  return clientsRepository(ctx.db).update(ctx.organizationId, id, input.value);
}

export async function archiveClient(ctx: RequestContext, id: string): Promise<Result<Client>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;
  return clientsRepository(ctx.db).setArchived(ctx.organizationId, id, ctx.clock.now());
}

export async function restoreClient(ctx: RequestContext, id: string): Promise<Result<Client>> {
  const allowed = authorize(ctx, "clients.write");
  if (!allowed.ok) return allowed;
  return clientsRepository(ctx.db).setArchived(ctx.organizationId, id, null);
}
