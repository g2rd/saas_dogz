import type { Formats } from "@/shared/i18n/formats";
import type { Translator } from "@/shared/i18n/messages";
import type { MemberRole } from "./invitation";

export type InvitationMessageInput = {
  organizationName: string;
  clientFirstName: string;
  link: string;
  code: string;
  expiresAt: Date;
  packageName: string | null;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Data ważności zaproszenia liczona w UTC (jak dotąd), zapisana wg języka wiadomości. */
const validUntil = (t: Translator, formats: Formats, expiresAt: Date) =>
  t("invitations.emails.valid_until", { date: formats.date(expiresAt, "UTC") });

/**
 * Treść zaproszenia wysyłanego klientowi e-mailem (link i krótki kod razem). Osoba zapraszana nie ma jeszcze konta ani
 * języka, więc tłumacz i formatery są w języku szkoły.
 */
export function composeInvitationMessage(
  input: InvitationMessageInput,
  t: Translator,
  formats: Formats,
): { subject: string; text: string; html: string } {
  const until = validUntil(t, formats, input.expiresAt);
  const greeting = t("invitations.emails.greeting", { hasName: input.clientFirstName ? "yes" : "no", name: input.clientFirstName });
  const lead = t("invitations.emails.client.lead", {
    organization: input.organizationName,
    hasPackage: input.packageName ? "yes" : "no",
    package: input.packageName ?? "",
  });

  const text = [
    greeting,
    lead,
    t("invitations.emails.client.open_link", { link: input.link }),
    t("invitations.emails.client.enter_code", { code: input.code }),
    until,
  ].join("\n\n");

  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(lead)}</p>` +
    `<p><a href="${escapeHtml(input.link)}">${escapeHtml(t("invitations.emails.accept_button"))}</a></p>` +
    `<p>${escapeHtml(t("invitations.emails.client.enter_code_html"))} <strong>${escapeHtml(input.code)}</strong></p>` +
    `<p>${escapeHtml(until)}</p>`;

  return { subject: t("invitations.emails.client.subject", { organization: input.organizationName }), text, html };
}

/** Treść zaproszenia do zespołu (trener, asystent, administrator) wysyłanego e-mailem, w języku szkoły. */
export function composeMemberInvitationMessage(
  input: { organizationName: string; role: MemberRole; link: string; expiresAt: Date },
  t: Translator,
  formats: Formats,
): { subject: string; text: string; html: string } {
  const until = validUntil(t, formats, input.expiresAt);
  const greeting = t("invitations.emails.greeting", { hasName: "no", name: "" });
  const lead = t("invitations.emails.member.lead", { organization: input.organizationName, role: t(`labels.memberRole.${input.role}`) });
  const text = [greeting, lead, t("invitations.emails.member.join", { link: input.link }), until].join("\n\n");
  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(lead)}</p>` +
    `<p><a href="${escapeHtml(input.link)}">${escapeHtml(t("invitations.emails.accept_button"))}</a></p>` +
    `<p>${escapeHtml(t("invitations.emails.member.join_html"))}</p>` +
    `<p>${escapeHtml(until)}</p>`;
  return { subject: t("invitations.emails.member.subject", { organization: input.organizationName }), text, html };
}
