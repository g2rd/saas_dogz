import { isValidPhone, normalizeEmail, normalizePhone } from "./client";

/** Limity importu: plik z kartoteką małej szkoły; większe pliki trzeba podzielić. */
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 1_000_000;

/** Wiersz gotowy do zapisu (po oczyszczeniu); pies jest opcjonalny. */
export type ImportRow = {
  /** Numer linii w pliku (1 = nagłówek), do raportu błędów. */
  line: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dogName: string | null;
  breed: string | null;
};

/** Kod problemu; tekst dla użytkownika powstaje w UI z katalogu (`clients.import.issue.<kod>`). */
export type ImportIssueCode =
  | "first_name_required"
  | "too_long"
  | "email_dropped"
  | "phone_dropped"
  | "duplicate_in_file"
  | "already_exists";

export type ImportIssue = {
  line: number;
  code: ImportIssueCode;
  /** Błąd pomija wiersz; ostrzeżenie importuje go bez danego pola. */
  severity: "error" | "warning";
  /** Wartość, której dotyczy problem (np. odrzucony e-mail), do pokazania obok komunikatu. */
  value?: string;
};

export type ImportField = "firstName" | "lastName" | "fullName" | "email" | "phone" | "dogName" | "breed";

/** Rozpoznawane nagłówki (po normalizacji: małe litery, bez polskich znaków i separatorów). */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  firstName: ["imie", "firstname", "first", "givenname"],
  lastName: ["nazwisko", "lastname", "last", "surname", "familyname"],
  fullName: ["imieinazwisko", "klient", "client", "name", "fullname", "nazwa"],
  email: ["email", "mail", "emailklienta", "adresemail"],
  phone: ["telefon", "tel", "phone", "mobile", "komorka", "numertelefonu", "phonenumber"],
  dogName: ["pies", "imiepsa", "dog", "dogname", "psiak"],
  breed: ["rasa", "breed", "rasapsa", "dogbreed"],
};

const strip = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function matchHeader(raw: string): ImportField | null {
  const key = strip(raw);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

/** Wybiera separator (`;`, `,` lub tabulator) po pierwszej linii poza cudzysłowami: najczęstszy wygrywa (Excel po polsku zapisuje `;`). */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const candidate of [";", ",", "\t"]) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Parser CSV (RFC 4180 z dowolnym separatorem): cudzysłowy, `""`, nowe linie w polach, BOM; puste wiersze pomijane. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export type ImportPlan = {
  /** Wiersze do zapisania (bez błędów, bez duplikatów). */
  rows: ImportRow[];
  issues: ImportIssue[];
  /** Nagłówki, których nie rozpoznano (zostaną pominięte). */
  ignoredColumns: string[];
  /** Liczba wierszy z danymi w pliku (bez nagłówka). */
  total: number;
  /** Plik bez rozpoznanych kolumn imienia: nie ma czego importować. */
  missingNameColumn: boolean;
  /** Przekroczono limit wierszy (nadmiarowe pominięto). */
  truncated: boolean;
};

/** Istniejący klienci szkoły do wykrywania duplikatów (e-mail albo telefon w zapisie międzynarodowym). */
export type ExistingContacts = { emails: ReadonlySet<string>; phones: ReadonlySet<string> };

const MAX = { name: 100, email: 200, phone: 40, dog: 100, breed: 100 };

function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/**
 * Zamienia tabelę z pliku na wiersze do importu i listę problemów. Czysta funkcja: ten sam kod działa w podglądzie
 * i przy zapisie (zapis nie ufa podglądowi i liczy wszystko od nowa).
 */
export function planClientImport(table: string[][], existing: ExistingContacts): ImportPlan {
  const [header = [], ...body] = table;
  const columns = header.map((cell) => matchHeader(cell));
  const ignoredColumns = header.filter((_, index) => columns[index] === null && header[index].trim() !== "");
  const has = (field: ImportField) => columns.includes(field);
  const missingNameColumn = !has("firstName") && !has("fullName");
  const result: ImportPlan = { rows: [], issues: [], ignoredColumns, total: body.length, missingNameColumn, truncated: body.length > IMPORT_MAX_ROWS };
  if (missingNameColumn) return result;

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  body.slice(0, IMPORT_MAX_ROWS).forEach((cells, index) => {
    const line = index + 2;
    const get = (field: ImportField) => {
      const at = columns.indexOf(field);
      return at === -1 ? "" : (cells[at] ?? "").trim();
    };

    let firstName = get("firstName");
    let lastName = get("lastName");
    if (!firstName && has("fullName")) {
      const split = splitFullName(get("fullName"));
      firstName = split.first;
      lastName = lastName || split.last;
    } else if (has("fullName") && !lastName && firstName && !has("lastName")) {
      lastName = splitFullName(get("fullName")).last;
    }

    // Imię bez ani jednej litery i cyfry (np. zabłąkany średnik z innego separatora) traktujemy jak brak imienia
    if (!/[\p{L}\p{N}]/u.test(firstName)) {
      result.issues.push({ line, code: "first_name_required", severity: "error" });
      return;
    }
    const dogName = get("dogName");
    const breed = get("breed");
    if (
      firstName.length > MAX.name ||
      lastName.length > MAX.name ||
      dogName.length > MAX.dog ||
      breed.length > MAX.breed ||
      get("email").length > MAX.email ||
      get("phone").length > MAX.phone
    ) {
      result.issues.push({ line, code: "too_long", severity: "error" });
      return;
    }

    let email = normalizeEmail(get("email"));
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      result.issues.push({ line, code: "email_dropped", severity: "warning", value: get("email") });
      email = null;
    }
    let phone = normalizePhone(get("phone"));
    if (phone && !isValidPhone(phone)) {
      result.issues.push({ line, code: "phone_dropped", severity: "warning", value: get("phone") });
      phone = null;
    }

    if ((email && existing.emails.has(email)) || (phone && existing.phones.has(phone))) {
      result.issues.push({ line, code: "already_exists", severity: "error", value: email ?? phone ?? undefined });
      return;
    }
    if ((email && seenEmails.has(email)) || (phone && seenPhones.has(phone))) {
      result.issues.push({ line, code: "duplicate_in_file", severity: "error", value: email ?? phone ?? undefined });
      return;
    }
    if (email) seenEmails.add(email);
    if (phone) seenPhones.add(phone);

    result.rows.push({ line, firstName, lastName, email, phone, dogName: dogName || null, breed: breed || null });
  });
  return result;
}
