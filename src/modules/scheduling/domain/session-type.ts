import { z } from "zod";
import { formAmountMinor, formInt } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";

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
      z.string().trim().min(1, msg("validation.session_type_name")).max(100, msg("validation.max_length", { max: 100 })),
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
