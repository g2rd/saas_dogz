import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { FormatsProvider, HtmlLang } from "@/shared/i18n/client";
import { getLocaleContext } from "@/shared/i18n/server";

/**
 * Dostawca tłumaczeń i formatowania dla całej aplikacji. Język zależy od żądania (ciasteczko, `Accept-Language`), więc to
 * komponent dynamiczny: w głównym layoucie stoi pod `<Suspense>` (Cache Components).
 */
export async function IntlShell({ children }: { children: React.ReactNode }) {
  const [locale, messages, context] = await Promise.all([getLocale(), getMessages(), getLocaleContext()]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FormatsProvider locale={context.intl}>
        <HtmlLang locale={locale} />
        {children}
      </FormatsProvider>
    </NextIntlClientProvider>
  );
}
