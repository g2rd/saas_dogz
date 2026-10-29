import { authorize, getOrganizationSettings } from "@/modules/core";
import type { RequestContext } from "@/shared/context";
import { err, type Result } from "@/shared/result";
import type { HistoryEntry } from "../domain/history";
import { historyRepository } from "../infrastructure/history-repository";

/** Historia zmian szkoły (właściciel i administrator): najnowsze `limit` wpisów dziennika audytu z opisem i możliwością cofnięcia. */
export async function listHistory(ctx: RequestContext, limit: number): Promise<Result<HistoryEntry[]>> {
  const allowed = authorize(ctx, "audit.read");
  if (!allowed.ok) return allowed;
  const settings = await getOrganizationSettings(ctx);
  if (!settings.ok) return err(settings.error);
  return historyRepository(ctx.db).list(ctx.organizationId, limit, settings.value.timezone, ctx.clock.now());
}
