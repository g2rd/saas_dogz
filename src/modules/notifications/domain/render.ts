import { money } from "@/shared/money";
import type { Formats } from "@/shared/i18n/formats";
import type { MessageParams, Translator } from "@/shared/i18n/messages";
import type { NotificationParams } from "./notification";

/**
 * Parametry zapisane w powiadomieniu (surowe wartości: kwota w groszach, moment w UTC) na wartości dla szablonu ICU:
 * daty, godziny i kwoty w języku odbiorcy oraz w strefie szkoły. Flagi logiczne zamieniamy na `yes`/`no` (do `select`).
 */
export function localizeParams(params: NotificationParams, formats: Formats): MessageParams {
  const values: MessageParams = {};
  for (const [key, value] of Object.entries(params)) {
    values[key] = typeof value === "boolean" ? (value ? "yes" : "no") : value === null ? "" : value;
  }
  const timezone = typeof params.timezone === "string" ? params.timezone : undefined;

  if (typeof params.amountMinor === "number" && typeof params.currency === "string") {
    values.amount = formats.money(money(params.amountMinor, params.currency));
  }
  if (typeof params.startsAt === "string") {
    const at = new Date(params.startsAt);
    if (!Number.isNaN(at.getTime())) {
      values.date = formats.date(at, timezone);
      values.time = formats.time(at, timezone);
    }
  }
  if (typeof params.dueDate === "string" && params.dueDate) values.due = formats.calendarDate(params.dueDate);
  if (typeof params.accessUntil === "string" && params.accessUntil) {
    const until = new Date(params.accessUntil);
    if (!Number.isNaN(until.getTime())) values.until = formats.date(until, timezone);
  }
  return values;
}

/**
 * Tytuł i treść powiadomienia w języku tłumacza (`notify.<klucz>.title|body`). `null`, gdy w katalogu nie ma takiego klucza
 * (np. wpis z nowszej wersji aplikacji): wywołujący wraca wtedy do tekstu zapisanego przy tworzeniu.
 */
export function renderNotification(
  t: Translator,
  formats: Formats,
  messageKey: string,
  params: NotificationParams,
): { title: string; body: string } | null {
  const titleKey = `notify.${messageKey}.title`;
  if (!t.has(titleKey)) return null;
  const values = localizeParams(params, formats);
  const bodyKey = `notify.${messageKey}.body`;
  return { title: t(titleKey, values).trim(), body: t.has(bodyKey) ? t(bodyKey, values).trim() : "" };
}

/** Treść wiadomości zewnętrznej (e-mail, push) na podstawie gotowego powiadomienia; `openLabel` to „Otwórz w aplikacji” w języku odbiorcy. */
export function renderExternalMessage(
  draft: { title: string; body: string; link: string | null },
  baseUrl: string,
  openLabel = "Otwórz w aplikacji",
): { subject: string; text: string; html: string; url: string | null } {
  const url = draft.link ? `${baseUrl}${draft.link}` : null;
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const text = [draft.title, draft.body, url].filter(Boolean).join("\n\n");
  const html =
    `<h2>${escape(draft.title)}</h2>` +
    (draft.body ? `<p>${escape(draft.body)}</p>` : "") +
    (url ? `<p><a href="${escape(url)}">${escape(openLabel)}</a></p>` : "");
  return { subject: draft.title, text, html, url };
}
