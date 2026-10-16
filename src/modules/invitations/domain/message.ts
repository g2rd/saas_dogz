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

const formatDate = (at: Date) =>
  `${String(at.getUTCDate()).padStart(2, "0")}.${String(at.getUTCMonth() + 1).padStart(2, "0")}.${at.getUTCFullYear()}`;

/** Treść zaproszenia wysyłanego klientowi e-mailem lub SMS-em (link i krótki kod razem). */
export function composeInvitationMessage(input: InvitationMessageInput): {
  subject: string;
  text: string;
  html: string;
  sms: string;
} {
  const until = formatDate(input.expiresAt);
  const greeting = input.clientFirstName ? `Cześć ${input.clientFirstName}!` : "Cześć!";
  const lead = `${input.organizationName} zaprasza Cię do panelu klienta${
    input.packageName ? ` (pakiet „${input.packageName}”)` : ""
  }, gdzie zobaczysz saldo zajęć, płatności i terminy.`;

  const text = [
    greeting,
    lead,
    `Otwórz link: ${input.link}`,
    `Albo wejdź na stronę /invite i wpisz kod: ${input.code}`,
    `Zaproszenie jest ważne do ${until}.`,
  ].join("\n\n");

  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(lead)}</p>` +
    `<p><a href="${escapeHtml(input.link)}">Przyjmij zaproszenie</a></p>` +
    `<p>Albo wpisz kod na stronie zaproszenia: <strong>${escapeHtml(input.code)}</strong></p>` +
    `<p>Zaproszenie jest ważne do ${until}.</p>`;

  const sms = `${input.organizationName}: zaproszenie do panelu klienta. Link: ${input.link} Kod: ${input.code} (do ${until})`;

  return { subject: `Zaproszenie do panelu klienta: ${input.organizationName}`, text, html, sms };
}

/** Treść zaproszenia do zespołu (trener, asystent, administrator) wysyłanego e-mailem. */
export function composeMemberInvitationMessage(input: {
  organizationName: string;
  roleLabel: string;
  link: string;
  expiresAt: Date;
}): { subject: string; text: string; html: string } {
  const until = formatDate(input.expiresAt);
  const lead = `${input.organizationName} zaprasza Cię do zespołu w DogTrainer jako: ${input.roleLabel}.`;
  const text = [
    "Cześć!",
    lead,
    `Załóż konto lub zaloguj się na ten sam adres e-mail i przyjmij zaproszenie: ${input.link}`,
    `Zaproszenie jest ważne do ${until}.`,
  ].join("\n\n");
  const html =
    "<p>Cześć!</p>" +
    `<p>${escapeHtml(lead)}</p>` +
    `<p><a href="${escapeHtml(input.link)}">Przyjmij zaproszenie</a></p>` +
    "<p>Załóż konto lub zaloguj się na ten sam adres e-mail.</p>" +
    `<p>Zaproszenie jest ważne do ${until}.</p>`;
  return { subject: `Zaproszenie do zespołu: ${input.organizationName}`, text, html };
}
