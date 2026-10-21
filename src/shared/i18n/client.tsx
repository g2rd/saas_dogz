"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { createFormats, type Formats } from "./formats";
import type { Translator } from "./messages";

const FormatLocaleContext = createContext<string>("pl");

/** Udostępnia komponentom klienckim znacznik języka z regionem (np. `en-GB`) do formatowania dat i kwot. */
export function FormatsProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  return <FormatLocaleContext.Provider value={locale}>{children}</FormatLocaleContext.Provider>;
}

/** Formatery dat, godzin i kwot w języku użytkownika (komponenty klienckie). */
export function useFormats(): Formats {
  const locale = useContext(FormatLocaleContext);
  return useMemo(() => createFormats(locale), [locale]);
}

/** Tłumacz kodowanych komunikatów dla komponentów klienckich. */
export function useMessageTranslator(): Translator {
  const t = useTranslations();
  return useMemo(
    () =>
      Object.assign((key: string, values?: Record<string, string | number>) => t(key as never, values as never), {
        has: (key: string) => t.has(key as never),
      }),
    [t],
  );
}

/** `<html lang>` w prerenderowanym szkielecie jest wartością domyślną; po hydracji ustawiamy język użytkownika. */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
