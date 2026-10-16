/** Wynik wysyłki jednym kanałem. Błąd dostawcy to wyjątek (procesor zapisuje go i ponawia). */
export type SendOutcome = { status: "sent" | "preview" | "skipped"; detail?: string };

export type EmailMessage = { to: string; subject: string; text: string; html: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<SendOutcome>;
}

export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string | null };

export interface PushSender {
  /** `gone: true` oznacza wygasłą subskrypcję (do usunięcia). */
  send(target: PushTarget, payload: PushPayload): Promise<SendOutcome & { gone?: boolean }>;
}
