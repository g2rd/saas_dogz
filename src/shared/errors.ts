export type AppErrorCode =
  | "unauthenticated"
  | "no_organization"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "plan_limit"
  | "internal";

export type AppError = {
  code: AppErrorCode;
  message: string;
  details?: unknown;
};

export const appError = (
  code: AppErrorCode,
  message: string,
  details?: unknown,
): AppError => ({ code, message, details });
