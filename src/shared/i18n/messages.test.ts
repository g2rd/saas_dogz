import { describe, expect, it } from "vitest";
import { msg, parseMessage, translateMessage, type Translator } from "./messages";

function translator(catalog: Record<string, string>): Translator {
  const t = ((key: string, values?: Record<string, string | number>) =>
    (catalog[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values?.[name]))) as Translator;
  t.has = (key) => key in catalog;
  return t;
}

describe("msg i parseMessage", () => {
  it("koduje klucz bez parametrów jako sam klucz", () => {
    expect(msg("validation.email")).toBe("validation.email");
    expect(parseMessage("validation.email")).toEqual({ key: "validation.email", params: {} });
  });

  it("koduje parametry jako JSON po kresce pionowej", () => {
    const encoded = msg("validation.max_length", { max: 100 });
    expect(encoded).toBe('validation.max_length|{"max":100}');
    expect(parseMessage(encoded)).toEqual({ key: "validation.max_length", params: { max: 100 } });
  });

  it("nie bierze zwykłego tekstu za klucz", () => {
    expect(parseMessage("Podaj imię")).toBeNull();
    expect(parseMessage("Nie znaleziono klienta.")).toBeNull();
    expect(parseMessage("validation")).toBeNull(); // jeden człon to nie klucz
    expect(parseMessage("a.b|nie-json")).toBeNull();
    expect(parseMessage("a.b|[1,2]")).toBeNull();
  });
});

describe("translateMessage", () => {
  const t = translator({ "validation.max_length": "At most {max} characters", "errors.db.forbidden": "No permission" });

  it("tłumaczy kodowany komunikat z parametrami", () => {
    expect(translateMessage(t, msg("validation.max_length", { max: 100 }))).toBe("At most 100 characters");
    expect(translateMessage(t, "errors.db.forbidden")).toBe("No permission");
  });

  it("zwykły tekst i nieznany klucz zwraca bez zmian", () => {
    expect(translateMessage(t, "Hasło jest zbyt słabe.")).toBe("Hasło jest zbyt słabe.");
    expect(translateMessage(t, "errors.unknown.key")).toBe("errors.unknown.key");
  });
});
