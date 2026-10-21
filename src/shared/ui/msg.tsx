"use client";

import { translateMessage } from "../i18n/messages";
import { useMessageTranslator } from "../i18n/client";

/**
 * Wyświetla komunikat, który może być kodowanym kluczem (`errors.db.forbidden`, `validation.max_length|{"max":100}`):
 * kodowany tłumaczy na język użytkownika, zwykły tekst pokazuje bez zmian. Używaj wszędzie tam, gdzie pokazujesz
 * `error.message` albo komunikaty walidacji.
 */
export function Msg({ text }: { text: string }) {
  const t = useMessageTranslator();
  return <>{translateMessage(t, text)}</>;
}

/** Jak `Msg`, ale dla kilku komunikatów łączonych przecinkiem (błędy pola). */
export function MsgList({ items }: { items: string[] }) {
  const t = useMessageTranslator();
  return <>{items.map((item) => translateMessage(t, item)).join(", ")}</>;
}
