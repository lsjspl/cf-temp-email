import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { translateErrorMessage, translateManualSteps } from "./i18n";

export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "TOKEN_REVOKED"
  | "MAILBOX_EXPIRED"
  | "DOMAIN_NOT_AVAILABLE"
  | "RATE_LIMITED"
  | "CLOUDFLARE_NOT_CONFIGURED"
  | "CLOUDFLARE_API_ERROR"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED";

export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: AppErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  const locale = typeof (c as { get?: (key: string) => unknown }).get === "function"
    ? (((c as { get: (key: string) => unknown }).get("locale") as string | undefined) ?? "zh-CN")
    : "zh-CN";
  const translated = translateErrorMessage(locale === "en" ? "en" : "zh-CN", message);
  const translatedDetails = details
    ? {
        ...details,
        manual_steps: translateManualSteps(locale === "en" ? "en" : "zh-CN", details.manual_steps),
      }
    : undefined;
  return c.json(
    {
      error: {
        code,
        message: translated,
      },
      ...(translatedDetails ?? {}),
    },
    status,
  );
}

export class AppRouteError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppRouteError";
  }
}
