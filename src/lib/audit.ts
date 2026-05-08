import { generateId } from "./crypto";
import type { AuthMode } from "../types/app";
import type { AppEnv } from "../types/env";

interface AuditLogInput {
  actorUserId?: string | null;
  authMode?: AuthMode | null;
  apiTokenId?: string | null;
  sessionId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAuditLog(env: AppEnv, input: AuditLogInput): Promise<void> {
  const metadata = {
    auth_mode: input.authMode ?? null,
    api_token_id: input.apiTokenId ?? null,
    session_id: input.sessionId ?? null,
    ...(input.metadata ?? {}),
  };

  await env.DB.prepare(
    `
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action,
        target_type,
        target_id,
        ip,
        user_agent,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      generateId("audit"),
      input.actorUserId ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      JSON.stringify(metadata),
      new Date().toISOString(),
    )
    .run();
}

export function getRequestIp(headers: Headers): string {
  return (
    headers.get("CF-Connecting-IP") ??
    headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function getAuditContext(c: {
  req: { header: (name: string) => string | undefined };
  get: {
    (key: "authUser"): { id: string } | undefined;
    (key: "authMode"): AuthMode | undefined;
    (key: "apiTokenId"): string | undefined;
    (key: "sessionId"): string | undefined;
  };
}) {
  return {
    actorUserId: c.get("authUser")?.id ?? null,
    authMode: c.get("authMode") ?? null,
    apiTokenId: c.get("apiTokenId") ?? null,
    sessionId: c.get("sessionId") ?? null,
    ip:
      c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      "unknown",
    userAgent: c.req.header("User-Agent") ?? null,
  };
}
