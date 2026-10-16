import { authorize, getOrganizationSettings } from "@/modules/core";
import type { RequestContext } from "@/shared/context";
import { addDaysIso } from "@/shared/dates";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import { err, ok, type Result } from "@/shared/result";
import { dateInZone, dayRange, startOfDayUtc, zonedDateTimeToUtc } from "@/shared/time";
import { shouldConsumeOnCancel, type CancellationPolicy } from "../domain/cancellation";
import {
  cancelInputSchema,
  completeInputSchema,
  scheduleInputSchema,
  type Session,
} from "../domain/session";
import { sessionTypeInputSchema, type SessionType } from "../domain/session-type";
import {
  sessionsRepository,
  type CancelResult,
  type CompleteResult,
} from "../infrastructure/sessions-repository";
import { sessionTypesRepository } from "../infrastructure/session-types-repository";

// --- rodzaje zajęć ---------------------------------------------------------------------------------

export async function listSessionTypes(
  ctx: RequestContext,
  options: { includeArchived?: boolean } = {},
): Promise<Result<SessionType[]>> {
  const allowed = authorize(ctx, "sessions.read");
  if (!allowed.ok) return allowed;
  return sessionTypesRepository(ctx.db).list(ctx.organizationId, options.includeArchived);
}

export async function getSessionType(ctx: RequestContext, id: string): Promise<Result<SessionType>> {
  const allowed = authorize(ctx, "sessions.read");
  if (!allowed.ok) return allowed;
  return sessionTypesRepository(ctx.db).get(ctx.organizationId, id);
}

export async function createSessionType(ctx: RequestContext, raw: unknown): Promise<Result<SessionType>> {
  const allowed = authorize(ctx, "session_types.write");
  if (!allowed.ok) return allowed;
  const input = parseInput(sessionTypeInputSchema, raw);
  if (!input.ok) return err(input.error);
  return sessionTypesRepository(ctx.db).insert(ctx.organizationId, ctx.userId, input.value);
}

export async function updateSessionType(
  ctx: RequestContext,
  id: string,
  raw: unknown,
): Promise<Result<SessionType>> {
  const allowed = authorize(ctx, "session_types.write");
  if (!allowed.ok) return allowed;
  const input = parseInput(sessionTypeInputSchema, raw);
  if (!input.ok) return err(input.error);
  return sessionTypesRepository(ctx.db).update(ctx.organizationId, id, input.value);
}

export async function archiveSessionType(ctx: RequestContext, id: string): Promise<Result<SessionType>> {
  const allowed = authorize(ctx, "session_types.write");
  if (!allowed.ok) return allowed;
  return sessionTypesRepository(ctx.db).setArchived(ctx.organizationId, id, ctx.clock.now());
}

export async function restoreSessionType(ctx: RequestContext, id: string): Promise<Result<SessionType>> {
  const allowed = authorize(ctx, "session_types.write");
  if (!allowed.ok) return allowed;
  return sessionTypesRepository(ctx.db).setArchived(ctx.organizationId, id, null);
}

// --- planowanie i listy ----------------------------------------------------------------------------

/** Planuje zajęcia: data i godzina są w strefie organizacji. */
export async function scheduleSession(ctx: RequestContext, raw: unknown): Promise<Result<string>> {
  const allowed = authorize(ctx, "sessions.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(scheduleInputSchema, raw);
  if (!input.ok) return err(input.error);

  const settings = await getOrganizationSettings(ctx);
  if (!settings.ok) return settings;

  const startsAt = zonedDateTimeToUtc(input.value.date, input.value.time, settings.value.timezone);
  if (!startsAt) {
    return err(appError("validation", "Popraw zaznaczone pola.", { time: ["Niepoprawna data lub godzina"] }));
  }

  const result = await sessionsRepository(ctx.db).schedule(ctx.organizationId, {
    sessionTypeId: input.value.sessionTypeId,
    trainerId: input.value.trainerId ?? ctx.userId,
    startsAt,
    location: input.value.location,
    clientId: input.value.clientId,
    dogId: input.value.dogId,
  });
  if (!result.ok && result.error.code === "conflict") {
    return err(
      appError("validation", "Popraw zaznaczone pola.", {
        time: ["Trener ma już zajęcia w tym czasie. Wybierz inną godzinę albo innego trenera."],
      }),
    );
  }
  return result;
}

export type SessionAgenda = {
  timezone: string;
  /** Polityka późnych odwołań organizacji (do podpowiedzi przy odwoływaniu). */
  cancellationPolicy: CancellationPolicy;
  /** Dzisiejsza data w strefie organizacji (YYYY-MM-DD). */
  today: string;
  /** Zajęcia z dzisiejszej doby (zaplanowane, odbyte i odwołane). */
  todaySessions: Session[];
  /** Zaplanowane zajęcia od jutra do końca okna. */
  upcoming: Session[];
};

/** Lista „Dziś” i „Najbliższe” (domyślnie 14 dni) w strefie organizacji. */
export async function getSessionAgenda(
  ctx: RequestContext,
  options: { upcomingDays?: number } = {},
): Promise<Result<SessionAgenda>> {
  const allowed = authorize(ctx, "sessions.read");
  if (!allowed.ok) return allowed;

  const settings = await getOrganizationSettings(ctx);
  if (!settings.ok) return settings;
  const timezone = settings.value.timezone;

  const today = dateInZone(ctx.clock.now(), timezone);
  const todayRange = dayRange(today, timezone);
  const windowEnd = startOfDayUtc(addDaysIso(today, 1 + (options.upcomingDays ?? 14)), timezone);

  const repo = sessionsRepository(ctx.db);
  const [todayResult, upcomingResult] = await Promise.all([
    repo.list(ctx.organizationId, { from: todayRange.from, to: todayRange.to }),
    repo.list(ctx.organizationId, { from: todayRange.to, to: windowEnd, status: "scheduled" }),
  ]);
  if (!todayResult.ok) return todayResult;
  if (!upcomingResult.ok) return upcomingResult;

  return ok({
    timezone,
    cancellationPolicy: {
      lateCancelHours: settings.value.lateCancelHours,
      lateCancelConsumesSession: settings.value.lateCancelConsumesSession,
    },
    today,
    todaySessions: todayResult.value,
    upcoming: upcomingResult.value,
  });
}

/** Zajęcia jednego klienta: nadchodzące (rosnąco) i ostatnie odbyte (malejąco). */
export async function listClientSessions(
  ctx: RequestContext,
  clientId: string,
): Promise<Result<{ upcoming: Session[]; recent: Session[]; timezone: string }>> {
  const allowed = authorize(ctx, "sessions.read");
  if (!allowed.ok) return allowed;

  const settings = await getOrganizationSettings(ctx);
  if (!settings.ok) return settings;

  const repo = sessionsRepository(ctx.db);
  const now = ctx.clock.now();
  const [upcoming, recent] = await Promise.all([
    repo.list(ctx.organizationId, { clientId, status: "scheduled", from: new Date(now.getTime() - 86_400_000), limit: 20 }),
    repo.list(ctx.organizationId, { clientId, status: "completed", newestFirst: true, limit: 5 }),
  ]);
  if (!upcoming.ok) return upcoming;
  if (!recent.ok) return recent;
  return ok({ upcoming: upcoming.value, recent: recent.value, timezone: settings.value.timezone });
}

export async function getSession(ctx: RequestContext, id: string): Promise<Result<Session>> {
  const allowed = authorize(ctx, "sessions.read");
  if (!allowed.ok) return allowed;
  return sessionsRepository(ctx.db).get(ctx.organizationId, id);
}

// --- rozliczanie i odwoływanie -------------------------------------------------------------------------

export type CompleteOutcome = CompleteResult & { chargeCreated: boolean };

/**
 * Oznacza zajęcia jako odbyte i atomowo zużywa jedno zajęcie z pakietu klienta (wskazanego lub wybranego
 * automatycznie). Bez pakietu zwraca konflikt `no_package`; z `withoutPackage` tworzy należność za pojedyncze zajęcia.
 */
export async function completeSession(
  ctx: RequestContext,
  sessionId: string,
  raw: unknown,
): Promise<Result<CompleteOutcome>> {
  const allowed = authorize(ctx, "sessions.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(completeInputSchema, raw);
  if (!input.ok) return err(input.error);

  if (input.value.withoutPackage) {
    const canCharge = authorize(ctx, "payments.write");
    if (!canCharge.ok) return canCharge;
  }

  const result = await sessionsRepository(ctx.db).complete(ctx.organizationId, {
    sessionId,
    packageId: input.value.packageId,
    note: input.value.note,
    withoutPackage: input.value.withoutPackage,
  });
  if (!result.ok) return result;
  return ok({ ...result.value, chargeCreated: result.value.chargeId !== null });
}

/**
 * Odwołuje zajęcia. Bez wskazania `consume` decyduje polityka organizacji (próg godzin i czy późne
 * odwołanie zabiera zajęcie); trener może ją zmienić (`consume`: "1" nalicza, "0" nie).
 */
export async function cancelSession(
  ctx: RequestContext,
  sessionId: string,
  raw: unknown,
): Promise<Result<CancelResult>> {
  const allowed = authorize(ctx, "sessions.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(cancelInputSchema, raw);
  if (!input.ok) return err(input.error);

  const repo = sessionsRepository(ctx.db);
  let consume = input.value.consume;
  if (consume === null) {
    const [session, settings] = await Promise.all([repo.get(ctx.organizationId, sessionId), getOrganizationSettings(ctx)]);
    if (!session.ok) return session;
    if (!settings.ok) return settings;
    consume = shouldConsumeOnCancel(session.value.startsAt, ctx.clock.now(), settings.value);
  }

  return repo.cancel(ctx.organizationId, sessionId, consume);
}

/** Czy odwołanie „teraz” byłoby według polityki późne (do podpowiedzi w interfejsie). */
export async function previewCancelConsumes(ctx: RequestContext, session: Session): Promise<boolean> {
  const settings = await getOrganizationSettings(ctx);
  if (!settings.ok) return false;
  return shouldConsumeOnCancel(session.startsAt, ctx.clock.now(), settings.value);
}
