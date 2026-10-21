import { describe, expect, it } from "vitest";
import { IMPORT_MAX_ROWS, detectDelimiter, matchHeader, parseCsv, planClientImport } from "./import";

const none = { emails: new Set<string>(), phones: new Set<string>() };

describe("parseCsv", () => {
  it("czyta separator ; (Excel), BOM i końce linii CRLF", () => {
    const rows = parseCsv("﻿Imię;Nazwisko;Telefon\r\nAnna;Kowalska;600100200\r\nJan;Nowak;\r\n");
    expect(rows).toEqual([
      ["Imię", "Nazwisko", "Telefon"],
      ["Anna", "Kowalska", "600100200"],
      ["Jan", "Nowak", ""],
    ]);
  });

  it("obsługuje cudzysłowy, podwojone cudzysłowy i przecinki w polach", () => {
    expect(parseCsv('imie,nazwisko\n"Anna, Maria","Kowalska ""Kowal"""\n')).toEqual([
      ["imie", "nazwisko"],
      ["Anna, Maria", 'Kowalska "Kowal"'],
    ]);
  });

  it("pozwala na nową linię w polu w cudzysłowie i pomija puste wiersze", () => {
    expect(parseCsv('a,b\n"x\ny",z\n\n,\n')).toEqual([
      ["a", "b"],
      ["x\ny", "z"],
    ]);
  });

  it("wykrywa tabulator i średnik", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("a;b;c,d")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
  });
});

describe("matchHeader", () => {
  it.each([
    ["Imię", "firstName"],
    ["First name", "firstName"],
    ["NAZWISKO", "lastName"],
    ["E-mail", "email"],
    ["Telefon komórkowy", null],
    ["Telefon", "phone"],
    ["Imię psa", "dogName"],
    ["Pies", "dogName"],
    ["Rasa", "breed"],
    ["Imię i nazwisko", "fullName"],
    ["Adres", null],
  ])("%s -> %s", (header, field) => expect(matchHeader(header)).toBe(field));
});

describe("planClientImport", () => {
  it("buduje wiersze z psem, normalizuje e-mail i telefon", () => {
    const plan = planClientImport(
      parseCsv("Imię,Nazwisko,E-mail,Telefon,Pies,Rasa\nAnna,Kowalska,ANNA@Example.PL,600 100 200,Burek,Labrador\n"),
      none,
    );
    expect(plan.issues).toEqual([]);
    expect(plan.rows).toEqual([
      { line: 2, firstName: "Anna", lastName: "Kowalska", email: "anna@example.pl", phone: "+48600100200", dogName: "Burek", breed: "Labrador" },
    ]);
  });

  it("rozbija kolumnę „Imię i nazwisko”", () => {
    const plan = planClientImport(parseCsv("Imię i nazwisko,Telefon\nAnna Maria Kowalska,600100200\n"), none);
    expect(plan.rows[0]).toMatchObject({ firstName: "Anna", lastName: "Maria Kowalska" });
  });

  it("wiersz bez imienia jest błędem, zły e-mail i telefon to ostrzeżenia (wiersz się importuje)", () => {
    const plan = planClientImport(parseCsv("Imię,Nazwisko,E-mail,Telefon\n,Nowak,a@b.pl,600100200\nJan,Nowak,nie-email,12\n"), none);
    expect(plan.issues).toEqual([
      { line: 2, code: "first_name_required", severity: "error" },
      { line: 3, code: "email_dropped", severity: "warning", value: "nie-email" },
      { line: 3, code: "phone_dropped", severity: "warning", value: "12" },
    ]);
    expect(plan.rows).toEqual([{ line: 3, firstName: "Jan", lastName: "Nowak", email: null, phone: null, dogName: null, breed: null }]);
  });

  it("pomija duplikaty w pliku i klientów, którzy już są w szkole (e-mail lub telefon)", () => {
    const plan = planClientImport(
      parseCsv("Imię,E-mail,Telefon\nAnna,a@b.pl,\nAnia,A@B.pl,\nJan,,600100200\nPiotr,p@b.pl,\nMaria,,500500500\n"),
      { emails: new Set(["p@b.pl"]), phones: new Set(["+48500500500"]) },
    );
    expect(plan.rows.map((r) => r.firstName)).toEqual(["Anna", "Jan"]);
    expect(plan.issues.map((i) => [i.line, i.code])).toEqual([
      [3, "duplicate_in_file"],
      [5, "already_exists"],
      [6, "already_exists"],
    ]);
  });

  it("imię bez liter i cyfr (zabłąkany separator) to brak imienia", () => {
    const plan = planClientImport(parseCsv("Imię\n;\n-\nAnna\n"), none);
    expect(plan.rows.map((r) => r.firstName)).toEqual(["Anna"]);
    expect(plan.issues.map((i) => i.code)).toEqual(["first_name_required", "first_name_required"]);
  });

  it("bez kolumny imienia nie importuje niczego, nieznane kolumny są zgłaszane", () => {
    const plan = planClientImport(parseCsv("Adres,Telefon\nUl. Długa,600100200\n"), none);
    expect(plan.missingNameColumn).toBe(true);
    expect(plan.rows).toEqual([]);
    expect(plan.ignoredColumns).toEqual(["Adres"]);
  });

  it("ogranicza liczbę wierszy i odrzuca zbyt długie pola", () => {
    const lines = Array.from({ length: IMPORT_MAX_ROWS + 3 }, (_, i) => `Klient${i}`).join("\n");
    const plan = planClientImport(parseCsv(`Imię\n${lines}\n`), none);
    expect(plan.rows).toHaveLength(IMPORT_MAX_ROWS);
    expect(plan.truncated).toBe(true);
    expect(plan.total).toBe(IMPORT_MAX_ROWS + 3);

    const long = planClientImport(parseCsv(`Imię\n${"a".repeat(101)}\n`), none);
    expect(long.issues[0]).toMatchObject({ code: "too_long", severity: "error" });
  });
});
