import { describe, expect, it } from "vitest";
import { money } from "../money";
import { createFormats } from "./formats";

const normalize = (text: string) => text.replace(/[  ]/g, " ");

describe("formatery zależne od języka", () => {
  it("polski: data, nagłówek dnia i kwota po polsku", () => {
    const pl = createFormats("pl-PL");
    expect(pl.calendarDate("2026-10-16")).toBe("16.10.2026");
    expect(pl.dayHeading("2026-10-16")).toBe("piątek, 16 października");
    expect(normalize(pl.money(money(120050, "PLN")))).toBe("1200,50 zł"); // polski nie grupuje liczb czterocyfrowych
    expect(normalize(pl.money(money(1200050, "PLN")))).toBe("12 000,50 zł");
  });

  it("angielski (Wielka Brytania): data dzień/miesiąc, funt", () => {
    const gb = createFormats("en-GB");
    expect(gb.calendarDate("2026-10-16")).toBe("16/10/2026");
    expect(gb.dayHeading("2026-10-16")).toBe("Friday 16 October");
    expect(gb.money(money(120050, "GBP"))).toBe("£1,200.50");
  });

  it("angielski (USA): data miesiąc/dzień, dolar", () => {
    const us = createFormats("en-US");
    expect(us.calendarDate("2026-10-16")).toBe("10/16/2026");
    expect(us.money(money(120050, "USD"))).toBe("$1,200.50");
  });

  it("niemiecki: euro po niemiecku (kolejny język bez zmian w kodzie)", () => {
    expect(normalize(createFormats("de-DE").money(money(120050, "EUR")))).toBe("1.200,50 €");
  });

  it("data i godzina w strefie szkoły", () => {
    const at = new Date("2026-10-16T21:30:00Z");
    expect(createFormats("pl-PL").dateTime(at, "Europe/Warsaw")).toContain("23:30");
    expect(createFormats("en-GB").dateTime(at, "Europe/London")).toContain("22:30");
  });

  it("niepoprawna data kalendarzowa wraca bez zmian", () => {
    expect(createFormats("pl").calendarDate("nie-data")).toBe("nie-data");
  });

  it("lista zależy od języka", () => {
    expect(createFormats("pl").list(["A", "B", "C"])).toBe("A, B i C");
    expect(createFormats("en").list(["A", "B", "C"])).toBe("A, B, and C");
  });
});
