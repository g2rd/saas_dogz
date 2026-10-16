import { z } from "zod";
import { formAmountMinor, formInt, formOptionalInt } from "@/shared/form";

export type PackageTemplate = {
  id: string;
  organizationId: string;
  name: string;
  sessionsCount: number;
  validityDays: number | null;
  priceMinor: number;
  currency: string;
  isActive: boolean;
  archivedAt: Date | null;
};

export const templateInputSchema = z
  .object({
    name: z.preprocess(
      (v) => (v == null ? "" : v),
      z.string().trim().min(1, "Podaj nazwę pakietu").max(100, "Maksymalnie 100 znaków"),
    ),
    sessionsCount: formInt(1, 500, "Podaj liczbę zajęć (1-500)"),
    validityDays: formOptionalInt(1, 3650, "Podaj ważność w dniach (1-3650) albo zostaw puste"),
    price: formAmountMinor(),
  })
  .transform((v) => ({
    name: v.name,
    sessionsCount: v.sessionsCount,
    validityDays: v.validityDays,
    priceMinor: v.price,
  }));

export type TemplateInput = z.output<typeof templateInputSchema>;
