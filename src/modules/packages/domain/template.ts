import { z } from "zod";
import { formAmountMinor, formInt, formOptionalInt } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";

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
      z.string().trim().min(1, msg("validation.package_name")).max(100, msg("validation.max_length", { max: 100 })),
    ),
    sessionsCount: formInt(1, 500, msg("validation.sessions_count_range")),
    validityDays: formOptionalInt(1, 3650, msg("validation.validity_days_range")),
    price: formAmountMinor(),
  })
  .transform((v) => ({
    name: v.name,
    sessionsCount: v.sessionsCount,
    validityDays: v.validityDays,
    priceMinor: v.price,
  }));

export type TemplateInput = z.output<typeof templateInputSchema>;
