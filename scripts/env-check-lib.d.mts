export function validateEnv(
  env: Record<string, string | undefined>,
  options?: { target?: "staging" | "production" },
): { errors: string[]; warnings: string[]; ok: string[] };
