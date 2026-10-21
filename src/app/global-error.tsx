"use client";

/**
 * Ostatnia linia obrony: błąd w głównym układzie strony (np. awaria dostawcy tłumaczeń). Zastępuje cały dokument, więc
 * nie ma tu ani stylów aplikacji, ani tłumaczeń z next-intl: język wybieramy z przeglądarki (polski albo angielski).
 */
const TEXTS = {
  pl: { title: "Coś poszło nie tak", text: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie; jeśli się powtarza, daj nam znać.", retry: "Spróbuj ponownie" },
  en: { title: "Something went wrong", text: "An unexpected error occurred. Try again; if it keeps happening, let us know.", retry: "Try again" },
} as const;

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const language = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("en") ? "en" : "pl";
  const text = TEXTS[language];
  return (
    <html lang={language}>
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif", background: "#ffffff", color: "#171717" }}>
        <main role="alert" style={{ maxWidth: 420, margin: "0 auto", padding: "20vh 16px 0" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 12px" }}>{text.title}</h1>
          <p style={{ lineHeight: 1.5, color: "#52525b", margin: "0 0 24px" }}>{text.text}</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ height: 44, padding: "0 28px", border: 0, borderRadius: 999, background: "#059669", color: "#fff", fontSize: "1rem", fontWeight: 600 }}
          >
            {text.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
