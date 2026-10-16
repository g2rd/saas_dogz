// Lokalny podgląd poczty (Mailpit z `supabase start`, domyślnie port 54324).
const MAILPIT_URL = process.env.SUPABASE_TEST_MAILPIT_URL ?? "http://127.0.0.1:54324";

export type MailMessage = { id: string; subject: string; text: string; html: string };

/** Czeka na wiadomość do podanego adresu (poll do `timeoutMs`). */
export async function waitForEmailTo(address: string, timeoutMs = 8000): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    const { messages } = (await search.json()) as { messages?: { ID: string }[] };
    if (messages && messages.length > 0) {
      const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
      const body = (await detail.json()) as { ID: string; Subject: string; Text: string; HTML: string };
      return { id: body.ID, subject: body.Subject, text: body.Text, html: body.HTML };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`No e-mail to ${address} within ${timeoutMs} ms`);
}

export async function emailCountTo(address: string): Promise<number> {
  const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  const { messages } = (await search.json()) as { messages?: unknown[] };
  return messages?.length ?? 0;
}
