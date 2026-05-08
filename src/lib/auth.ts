import type { MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { generateId, generateOpaqueToken, hashPassword, sha256Hex, verifyPassword } from "./crypto";
import { AppRouteError, errorResponse } from "./errors";
import { optionalString, requireString, validateEmailAddress, validatePassword } from "./request";
import { getSessionSecret } from "./runtime-secrets";
import type { AppSchema, AuthMode } from "../types/app";
import type { AuthUser, UserRole, UserStatus } from "../types/auth";
import type { AppEnv } from "../types/env";

const SESSION_COOKIE_NAME = "tm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionRecord {
  userId: string;
  expiresAt: string;
}

interface ApiTokenPrincipalRow {
  token_id: string;
  user_id: string;
  email: string;
  username: string | null;
  role: UserRole;
  status: UserStatus;
  token_status: "active" | "revoked";
}

interface ApiTokenRow {
  id: string;
}

function mapUser(row: Pick<UserRow, "id" | "email" | "username" | "role" | "status">): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    status: row.status,
  };
}

async function sessionCacheKey(env: AppEnv, sessionId: string): Promise<string> {
  const secret = await getSessionSecret(env);
  const hashed = await sha256Hex(`${secret}:${sessionId}`);
  return `session:${hashed}`;
}

export function getAuthUser(c: { get: (key: "authUser") => AuthUser | undefined }): AuthUser | undefined {
  return c.get("authUser");
}

export function requireAuthUser(c: { get: (key: "authUser") => AuthUser | undefined }): AuthUser {
  const user = c.get("authUser");
  if (!user) {
    throw new AppRouteError(401, "UNAUTHORIZED", "Unauthorized");
  }

  return user;
}

export function requireApiTokenId(c: { get: (key: "apiTokenId") => string | undefined }): string {
  const tokenId = c.get("apiTokenId");
  if (!tokenId) {
    throw new AppRouteError(401, "UNAUTHORIZED", "Unauthorized");
  }

  return tokenId;
}

export async function getUserById(env: AppEnv, userId: string): Promise<AuthUser | null> {
  const row = await env.DB.prepare(
    `
      SELECT id, email, username, role, status
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
  )
    .bind(userId)
    .first<UserRow>();

  return row ? mapUser(row) : null;
}

async function getUserByLogin(env: AppEnv, login: string): Promise<UserRow | null> {
  const lowered = login.toLowerCase();
  const row = await env.DB.prepare(
    `
      SELECT id, email, username, password_hash, role, status, last_login_at, created_at, updated_at
      FROM users
      WHERE lower(email) = ? OR lower(username) = ?
      LIMIT 1
    `,
  )
    .bind(lowered, lowered)
    .first<UserRow>();

  return row ?? null;
}

export async function countAdmins(env: AppEnv): Promise<number> {
  const row = await env.DB.prepare(
    `
      SELECT COUNT(*) AS total
      FROM users
      WHERE role = 'admin'
    `,
  ).first<{ total: number | string }>();

  return Number(row?.total ?? 0);
}

export async function initializeAdmin(env: AppEnv, payload: Record<string, unknown>) {
  if ((await countAdmins(env)) > 0) {
    throw new AppRouteError(409, "FORBIDDEN", "System has already been initialized.");
  }

  const email = validateEmailAddress(requireString(payload.email, "email"), "email");
  const username = optionalString(payload.username);
  const password = validatePassword(requireString(payload.password, "password"));
  const now = new Date().toISOString();
  const userId = generateId("usr");
  const passwordHash = await hashPassword(password);

  await env.DB.batch([
    env.DB.prepare(
      `
        INSERT INTO users (
          id,
          email,
          username,
          password_hash,
          role,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?)
      `,
    ).bind(userId, email, username, passwordHash, now, now),
    env.DB.prepare(
      `
        INSERT OR REPLACE INTO system_settings (key, value, updated_at)
        VALUES ('setup_completed', 'true', ?)
      `,
    ).bind(now),
  ]);

  const user = await getUserById(env, userId);
  if (!user) {
    throw new AppRouteError(500, "INTERNAL_ERROR", "Failed to create initial administrator.");
  }

  return user;
}

export async function createUser(env: AppEnv, payload: Record<string, unknown>, roleFallback: UserRole) {
  const email = validateEmailAddress(requireString(payload.email, "email"), "email");
  const username = optionalString(payload.username);
  const password = validatePassword(requireString(payload.password, "password"));
  const candidateRole = optionalString(payload.role) ?? roleFallback;
  const role = candidateRole === "admin" || candidateRole === "user" ? candidateRole : null;

  if (!role) {
    throw new AppRouteError(400, "VALIDATION_ERROR", "role must be admin or user.");
  }

  const now = new Date().toISOString();
  const userId = generateId("usr");
  const passwordHash = await hashPassword(password);

  try {
    await env.DB.prepare(
      `
        INSERT INTO users (
          id,
          email,
          username,
          password_hash,
          role,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `,
    )
      .bind(userId, email, username, passwordHash, role, now, now)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new AppRouteError(409, "VALIDATION_ERROR", "A user with that email already exists.");
    }
    throw error;
  }

  const user = await getUserById(env, userId);
  if (!user) {
    throw new AppRouteError(500, "INTERNAL_ERROR", "Failed to create user.");
  }

  return user;
}

export async function updateUser(env: AppEnv, userId: string, payload: Record<string, unknown>) {
  const existingUser = await env.DB.prepare(
    `
      SELECT id, email, username, password_hash, role, status, last_login_at, created_at, updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
  )
    .bind(userId)
    .first<UserRow>();

  if (!existingUser) {
    throw new AppRouteError(404, "NOT_FOUND", "User not found.");
  }

  const username = optionalString(payload.username) ?? existingUser.username;
  const roleValue = optionalString(payload.role) ?? existingUser.role;
  const statusValue = optionalString(payload.status) ?? existingUser.status;

  if (roleValue !== "admin" && roleValue !== "user") {
    throw new AppRouteError(400, "VALIDATION_ERROR", "role must be admin or user.");
  }

  if (statusValue !== "active" && statusValue !== "disabled") {
    throw new AppRouteError(400, "VALIDATION_ERROR", "status must be active or disabled.");
  }

  const now = new Date().toISOString();

  await env.DB.prepare(
    `
      UPDATE users
      SET username = ?, role = ?, status = ?, updated_at = ?
      WHERE id = ?
    `,
  )
    .bind(username, roleValue, statusValue, now, userId)
    .run();

  const user = await getUserById(env, userId);
  if (!user) {
    throw new AppRouteError(500, "INTERNAL_ERROR", "Failed to update user.");
  }

  return user;
}

export async function deleteUserById(env: AppEnv, userId: string): Promise<void> {
  const result = await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  if (!result.success) {
    throw new AppRouteError(500, "INTERNAL_ERROR", "Failed to delete user.");
  }
}

export async function createSession(c: {
  env: AppEnv;
  set: (key: "authUser" | "sessionId" | "authMode", value: AuthUser | string) => void;
}, user: AuthUser): Promise<void> {
  const sessionId = generateOpaqueToken("sess");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const sessionRecord: SessionRecord = {
    userId: user.id,
    expiresAt,
  };

  await c.env.MAIL_KV.put(await sessionCacheKey(c.env, sessionId), JSON.stringify(sessionRecord), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  setCookie(c as never, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  c.set("authUser", user);
  c.set("sessionId", sessionId);
  c.set("authMode", "session");
}

export async function destroySession(c: {
  env: AppEnv;
  get: (key: "sessionId") => string | undefined;
}): Promise<void> {
  const sessionId = c.get("sessionId");
  if (sessionId) {
    await c.env.MAIL_KV.delete(await sessionCacheKey(c.env, sessionId));
  }

  deleteCookie(c as never, SESSION_COOKIE_NAME, {
    path: "/",
  });
}

export async function authenticateLogin(env: AppEnv, login: string, password: string): Promise<AuthUser> {
  const user = await getUserByLogin(env, login);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new AppRouteError(401, "UNAUTHORIZED", "Invalid credentials.");
  }

  if (user.status !== "active") {
    throw new AppRouteError(403, "FORBIDDEN", "User is disabled.");
  }

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, user.id)
    .run();

  return mapUser(user);
}

export async function markApiTokenUsed(env: AppEnv, tokenId: string): Promise<void> {
  await env.DB.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), tokenId)
    .run();
}

export async function revokeApiToken(
  env: AppEnv,
  tokenId: string,
  userId?: string,
): Promise<ApiTokenRow | null> {
  const query =
    userId !== undefined
      ? `
        UPDATE api_tokens
        SET status = 'revoked', revoked_at = ?
        WHERE id = ? AND user_id = ? AND status != 'revoked'
        RETURNING id
      `
      : `
        UPDATE api_tokens
        SET status = 'revoked', revoked_at = ?
        WHERE id = ? AND status != 'revoked'
        RETURNING id
      `;

  const statement = env.DB.prepare(query);
  const row =
    userId !== undefined
      ? await statement.bind(new Date().toISOString(), tokenId, userId).first<ApiTokenRow>()
      : await statement.bind(new Date().toISOString(), tokenId).first<ApiTokenRow>();

  return row ?? null;
}

export async function listAllApiTokens(env: AppEnv) {
  const result = await env.DB.prepare(
    `
      SELECT
        t.id,
        t.user_id,
        u.email AS user_email,
        t.name,
        t.token_prefix,
        t.status,
        t.last_used_at,
        t.created_at,
        t.revoked_at
      FROM api_tokens t
      INNER JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
    `,
  ).all<Record<string, unknown>>();

  return result.results;
}

export const attachRequestMetadata: MiddlewareHandler<AppSchema> = async (c, next) => {
  const requestIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";
  c.set("requestIp", requestIp);
  await next();
};

export const loadSessionUser: MiddlewareHandler<AppSchema> = async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionId) {
    await next();
    return;
  }

  const rawSession = await c.env.MAIL_KV.get(await sessionCacheKey(c.env, sessionId));
  if (!rawSession) {
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    await next();
    return;
  }

  try {
    const session = JSON.parse(rawSession) as SessionRecord;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await c.env.MAIL_KV.delete(await sessionCacheKey(c.env, sessionId));
      deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
      await next();
      return;
    }

    const user = await getUserById(c.env, session.userId);
    if (!user || user.status !== "active") {
      await c.env.MAIL_KV.delete(await sessionCacheKey(c.env, sessionId));
      deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
      await next();
      return;
    }

    c.set("authUser", user);
    c.set("sessionId", sessionId);
    c.set("authMode", "session");
  } catch {
    await c.env.MAIL_KV.delete(await sessionCacheKey(c.env, sessionId));
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  }

  await next();
};

export const requireSessionUser: MiddlewareHandler<AppSchema> = async (c, next) => {
  if (!c.get("authUser")) {
    return errorResponse(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  await next();
};

export const requireAdmin: MiddlewareHandler<AppSchema> = async (c, next) => {
  const user = c.get("authUser");
  if (!user) {
    return errorResponse(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  if (user.role !== "admin") {
    return errorResponse(c, 403, "FORBIDDEN", "Forbidden");
  }

  await next();
};

export const requireApiToken: MiddlewareHandler<AppSchema> = async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return errorResponse(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  const rawToken = authorization.slice("Bearer ".length).trim();
  const tokenHash = await sha256Hex(rawToken);
  const row = await c.env.DB.prepare(
    `
      SELECT
        t.id AS token_id,
        t.status AS token_status,
        u.id AS user_id,
        u.email AS email,
        u.username AS username,
        u.role AS role,
        u.status AS status
      FROM api_tokens t
      INNER JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ?
      LIMIT 1
    `,
  )
    .bind(tokenHash)
    .first<ApiTokenPrincipalRow>();

  if (!row || row.token_status !== "active") {
    return errorResponse(c, 401, "TOKEN_REVOKED", "API token is invalid or revoked.");
  }

  if (row.status !== "active") {
    return errorResponse(c, 403, "FORBIDDEN", "User is disabled.");
  }

  c.set("authUser", {
    id: row.user_id,
    email: row.email,
    username: row.username,
    role: row.role,
    status: row.status,
  });
  c.set("apiTokenId", row.token_id);
  c.set("authMode", "api_token");

  await next();
};

export const touchApiTokenUsage: MiddlewareHandler<AppSchema> = async (c, next) => {
  const tokenId = c.get("apiTokenId");
  if (!tokenId) {
    return errorResponse(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  await next();
  await markApiTokenUsed(c.env, tokenId);
};
