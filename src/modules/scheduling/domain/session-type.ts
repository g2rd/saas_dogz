import { z } from "zod";
import { formAmountMinor, formInt } from "@/shared/form";

export type SessionType = {
  id: string;
  organizationId: string;
  name: string;
  durationMinutes: number;
  defaultPriceMinor: number;
  currency: string;
  archivedAt: Date | null;
};

export const sessionTypeInputSchema = z
  .object({
    name: z.preprocess(
      (v) => (v == null ? "" : v),
      z.string().trim().min(1, "Podaj nazwę zajęć").max(100, "Maksymalnie 100 znaków"),
    ),
    durationMinutes: formInt(5, 480, "Podaj czas trwania w minutach (5-480)"),
    defaultPrice: formAmountMinor(),
  })
  .transform((v) => ({
    name: v.name,
    durationMinutes: v.durationMinutes,
    defaultPriceMinor: v.defaultPrice,
  }));

export type SessionTypeInput = z.output<typeof sessionTypeInputSchema>;
