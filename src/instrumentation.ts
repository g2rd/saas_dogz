import type { Instrumentation } from "next";
import { reportError } from "@/shared/monitoring/sentry";

export async function register() {
  // Pętla deweloperska powiadomień; zależności węzłowe ładujemy tylko w środowisku Node
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/** Błędy serwera (render, akcje, trasy API) trafiają do Sentry, gdy ustawiono `SENTRY_DSN`; wzorzec trasy zamiast adresu (tokeny w adresach). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await reportError(error, { route: context.routePath, method: request.method, tags: { routeType: context.routeType } });
};
