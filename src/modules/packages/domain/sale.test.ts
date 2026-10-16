import { describe, expect, it } from "vitest";
import { resolveSale, saleInputSchema } from "./sale";
import { templateInputSchema } from "./template";

const CLIENT = "10000000-0000-4000-8000-000000000001";
const TEMPLATE = "20000000-0000-4000-8000-000000000001";
const today = "2026-10-16";

const template = {
  name: "Pakiet 10 zajęć",
  sessionsCount: 10,
  validityDays: 90,
  priceMinor: 80000,
  currency: "PLN",
  isActive: true,
  archivedAt: null,
};

const parse = (raw: Record<string, unknown>) => saleInputSchema.parse({ clientId: CLIENT, ...raw });

describe("templateInputSchema", () => {
  it("parses a template from form strings", () => {
    expect(
      templateInputSchema.parse({ name: " Pakiet 10 ", sessionsCount: "10", validityDays: "90", price: "800,50" }),
    ).toEqual({ name: "Pakiet 10", sessionsCount: 10, validityDays: 90, priceMinor: 80050 });
  });

  it("treats empty validity as unlimited and allows a free package", () => {
    expect(templateInputSchema.parse({ name: "Próbny", sessionsCount: "1", validityDays: "", price: "0" })).toMatchObject({
      validityDays: null,
      priceMinor: 0,
    });
  });

  it("rejects bad numbers and amounts with field errors", () => {
    const result = templateInputSchema.safeParse({ name: "", sessionsCount: "0", validityDays: "abc", price: "12,345" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["name", "sessionsCount", "validityDays", "price"]));
    }
  });
});

describe("resolveSale from a template", () => {
  it("takes name, sessions, price and validity from the template with sensible defaults", () => {
    const result = resolveSale(parse({ templateId: TEMPLATE }), template, today);
    expect(result).toEqual({
      ok: true,
      value: {
        clientId: CLIENT,
        dogId: null,
        templateId: TEMPLATE,
        name: "Pakiet 10 zajęć",
        sessionsCount: 10,
        priceMinor: 80000,
        currency: "PLN",
        validFrom: "2026-10-16",
        validUntil: "2027-01-14",
        dueDate: "2026-10-23",
      },
    });
  });

  it("lets the trainer override price, validity and dates", () => {
    const result = resolveSale(
      parse({ templateId: TEMPLATE, price: "700", validityDays: "30", validFrom: "2026-11-01", dueDate: "2026-11-05" }),
      template,
      today,
    );
    expect(result.ok && result.value).toMatchObject({
      priceMinor: 70000,
      validFrom: "2026-11-01",
      validUntil: "2026-12-01",
      dueDate: "2026-11-05",
    });
  });

  it("rejects a missing or inactive template", () => {
    expect(resolveSale(parse({ templateId: TEMPLATE }), null, today).ok).toBe(false);
    expect(resolveSale(parse({ templateId: TEMPLATE }), { ...template, isActive: false }, today).ok).toBe(false);
    expect(resolveSale(parse({ templateId: TEMPLATE }), { ...template, archivedAt: new Date() }, today).ok).toBe(false);
  });
});

describe("resolveSale as a custom package", () => {
  it("requires name, sessions and price", () => {
    const result = resolveSale(parse({}), null, today);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation");
      expect(result.error.details).toMatchObject({
        name: expect.any(Array),
        sessionsCount: expect.any(Array),
        price: expect.any(Array),
      });
    }
  });

  it("builds a package without validity limit", () => {
    const result = resolveSale(parse({ name: "Indywidualny", sessionsCount: "5", price: "450" }), null, today);
    expect(result.ok && result.value).toMatchObject({
      name: "Indywidualny",
      sessionsCount: 5,
      priceMinor: 45000,
      validUntil: null,
    });
  });
});

describe("saleInputSchema", () => {
  it("rejects a malformed date and a non-uuid client", () => {
    expect(saleInputSchema.safeParse({ clientId: CLIENT, dueDate: "2026-02-31" }).success).toBe(false);
    expect(saleInputSchema.safeParse({ clientId: "nie-uuid" }).success).toBe(false);
  });
});
