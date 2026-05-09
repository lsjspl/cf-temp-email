import type { MiddlewareHandler } from "hono";

import { getAuditContext, writeAuditLog } from "./audit";
import { errorResponse } from "./errors";
import type { AppSchema } from "../types/app";

interface RateLimitOptions {
  keyPrefix: string;
  maxRequests: number;
  windowSeconds: number;
  getSubject: (c: Parameters<MiddlewareHandler<AppSchema>>[0]) => string | null;
  auditAction?: string;
}

function windowBucket(windowSeconds: number): number {
  return Math.floor(Date.now() / 1000 / windowSeconds);
}

function expirationTtl(windowSeconds: number): number {
  return windowSeconds + 5;
}

async function incrementCounter(
  kv: KVNamespace,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const existing = await kv.get(key);
  const nextValue = Number.parseInt(existing ?? "0", 10) + 1;
  await kv.put(key, String(nextValue), {
    expirationTtl: expirationTtl(windowSeconds),
  });
  return nextValue;
}

export function createRateLimitMiddleware(
  options: RateLimitOptions,
): MiddlewareHandler<AppSchema> {
  return async (c, next) => {
    const subject = options.getSubject(c);
    if (!subject) {
      return errorResponse(c, 401, "UNAUTHORIZED", "Unauthorized");
    }

    const bucket = windowBucket(options.windowSeconds);
    const key = `${options.keyPrefix}:${subject}:${bucket}`;
    const count = await incrementCounter(c.env.MAIL_KV, key, options.windowSeconds);

    if (count > options.maxRequests) {
      if (options.auditAction) {
        await writeAuditLog(c.env, {
          ...getAuditContext(c),
          action: options.auditAction,
          targetType: "rate_limit",
          targetId: key,
          metadata: {
            key,
            bucket,
            count,
            max_requests: options.maxRequests,
            window_seconds: options.windowSeconds,
          },
        });
      }

      return errorResponse(c, 429, "RATE_LIMITED", "Rate limit exceeded.");
    }

    await next();
  };
}

export function loginRateLimit(): MiddlewareHandler<AppSchema> {
  return createRateLimitMiddleware({
    keyPrefix: "rate_limit:login",
    maxRequests: 5,
    windowSeconds: 15 * 60,
    getSubject: (c) => c.get("requestIp") ?? "unknown",
    auditAction: "auth.login.rate_limited",
  });
}

export function apiRateLimit(): MiddlewareHandler<AppSchema> {
  return createRateLimitMiddleware({
    keyPrefix: "rate_limit:api",
    maxRequests: 120,
    windowSeconds: 60,
    getSubject: (c) => c.get("apiTokenId") ?? null,
    auditAction: "api.rate_limited",
  });
}

export function inboxRateLimit(): MiddlewareHandler<AppSchema> {
  return createRateLimitMiddleware({
    keyPrefix: "rate_limit:inbox",
    maxRequests: 120,
    windowSeconds: 60,
    getSubject: (c) => {
      const path = new URL(c.req.url).pathname;
      const prefix = "/inbox/";
      const raw = path.startsWith(prefix) ? path.slice(prefix.length).split("/")[0] : "";
      const token = decodeURIComponent(raw);
      const ip = c.get("requestIp") ?? "unknown";
      // 只用 token 前 24 字符作为 key，避免 KV key 过长
      return token ? `${ip}:${token.slice(0, 24)}` : null;
    },
    auditAction: "inbox.rate_limited",
  });
}
