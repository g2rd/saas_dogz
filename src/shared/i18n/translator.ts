import { createTranslator } from "next-intl";
import { loadMessages } from "@/i18n/messages";
import type { Locale } from "@/shared/i18n/locale";
import type { Translator } from "@/shared/i18n/messages";

const cache = new Map<Locale, Promise<Translator>>();

/**
 * Tłumacz dla wskazanego języka poza żądaniem HTTP (zadanie w tle wysyłające powiadomienia do odbiorców w ich językach).
 * Katalogi są statyczne, więc tłumacz dla języka powstaje raz na proces.
 */
export function translatorFor(locale: Locale): Promise<Translator> {
  let translator = cache.get(locale);
  if (!translator) {
    translator = loadMessages(locale).then((messages) => {
      const t = createTranslator({ locale, messages: messages as never });
      return Object.assign((key: string, values?: Record<string, string | number>) => t(key as never, values as never), {
        has: (key: string) => t.has(key as never),
      });
    });
    cache.set(locale, translator);
  }
  return translator;
}
