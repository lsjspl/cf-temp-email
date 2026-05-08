import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
  return c.json(
    {
      error: {
        code,
        message,
      },
      ...(details ?? {}),
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
