import { encryptJsonToken, generateId, randomLocalPart, sha256Hex } from "./crypto";
import { AppRouteError } from "./errors";
import { buildPaginationMeta, type PaginationMeta, type PaginationParams } from "./pagination";
import { optionalString, requireString } from "./request";
import { getLinkSecret } from "./runtime-secrets";
import type { AppEnv } from "../types/env";

interface DomainRow {
  id: string;
  domain: string;
}

interface MailboxRow {
  id: string;
  email_address: string;
  local_part: string;
  status: string;
  domain_id: string;
  expires_at: string;
  created_at: string;
  domain_name: string;
  encrypted_token: string | null;
}

interface MessageRow {
  id: string;
  from_address: string | null;
  to_address: string;
  subject: string | null;
  size: number | null;
  received_at: string;
  expires_at: string;
  attachment_count: number | string;
}

function mailboxLinkUrl(requestUrl: string, encryptedToken: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/inbox/${encodeURIComponent(encryptedToken)}`;
}

function resolveTtlSeconds(env: AppEnv, ttlSeconds?: number | null): number {
  if (ttlSeconds && ttlSeconds > 0) {
    return ttlSeconds;
  }

  const fallback = Number.parseInt(env.DEFAULT_MAIL_TTL_SECONDS, 10);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 86_400;
}

async function loadUserDomain(env: AppEnv, userId: string, domainId: string): Promise<DomainRow | null> {
  // 先查用户是否已分配该域名
  const assigned = await env.DB.prepare(
    `
      SELECT d.id, d.domain
      FROM domains d
      INNER JOIN user_domains ud ON ud.domain_id = d.id
      WHERE ud.user_id = ? AND d.id = ? AND d.status = 'active'
      LIMIT 1
    `,
  )
    .bind(userId, domainId)
    .first<DomainRow>();

  if (assigned) return assigned;

  // 如果未分配，检查用户是否是 admin——admin 可以使用任何 active 域名
  const user = await env.DB.prepare("SELECT role FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<{ role: string }>();

  if (user?.role === "admin") {
    return (
      (await env.DB.prepare(
        "SELECT id, domain FROM domains WHERE id = ? AND status = 'active' LIMIT 1",
      )
        .bind(domainId)
        .first<DomainRow>()) ?? null
    );
  }

  return null;
}

async function emailExists(env: AppEnv, emailAddress: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `
      SELECT id
      FROM mailboxes
      WHERE email_address = ?
      LIMIT 1
    `,
  )
    .bind(emailAddress)
    .first<{ id: string }>();

  return Boolean(row?.id);
}

function resolveLocalPartPrefix(prefix: unknown): string | null {
  const normalized = optionalString(prefix)?.toLowerCase() ?? null;
  if (!normalized) {
    return null;
  }

  if (!/^[a-z0-9][a-z0-9-_]{1,62}$/.test(normalized)) {
    throw new AppRouteError(
      400,
      "VALIDATION_ERROR",
      "prefix must match /^[a-z0-9][a-z0-9-_]{1,62}$/",
    );
  }

  return normalized;
}

async function resolveLocalPart(
  env: AppEnv,
  domainName: string,
  requestedPrefix: string | null,
): Promise<string> {
  if (requestedPrefix) {
    const emailAddress = `${requestedPrefix}@${domainName}`;
    if (await emailExists(env, emailAddress)) {
      throw new AppRouteError(409, "VALIDATION_ERROR", "That mailbox prefix is already in use.");
    }

    return requestedPrefix;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomLocalPart(10);
    if (!(await emailExists(env, `${candidate}@${domainName}`))) {
      return candidate;
    }
  }

  throw new AppRouteError(500, "INTERNAL_ERROR", "Failed to generate a unique mailbox address.");
}

export async function createMailbox(
  env: AppEnv,
  requestUrl: string,
  userId: string,
  payload: Record<string, unknown>,
  createdByTokenId?: string,
) {
  const domainId = requireString(payload.domain_id, "domain_id");
  const prefix = resolveLocalPartPrefix(payload.prefix);
  const ttlSeconds =
    payload.ttl_seconds === undefined || payload.ttl_seconds === null
      ? null
      : Number.parseInt(String(payload.ttl_seconds), 10);

  if (ttlSeconds !== null && (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0)) {
    throw new AppRouteError(400, "VALIDATION_ERROR", "ttl_seconds must be a positive integer.");
  }

  const domain = await loadUserDomain(env, userId, domainId);
  if (!domain) {
    throw new AppRouteError(404, "DOMAIN_NOT_AVAILABLE", "Domain is not available to this user.");
  }

  const localPart = await resolveLocalPart(env, domain.domain, prefix);
  const emailAddress = `${localPart}@${domain.domain}`;
  const mailboxId = generateId("mb");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + resolveTtlSeconds(env, ttlSeconds) * 1000,
  ).toISOString();
  const accessSecretHash = await sha256Hex(generateId("access"));
  // 生成短链接 ID 和加密 token（token 只存数据库，URL 用短 ID）
  const linkId = generateId("lnk");
  const encryptedToken = await encryptJsonToken(
    { m: mailboxId, e: expiresAt },
    await getLinkSecret(env),
  );
  const tokenHash = await sha256Hex(encryptedToken);

  await env.DB.batch([
    env.DB.prepare(
      `
        INSERT INTO mailboxes (
          id,
          user_id,
          domain_id,
          email_address,
          local_part,
          status,
          access_secret_hash,
          created_by_token_id,
          expires_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `,
    ).bind(
      mailboxId,
      userId,
      domain.id,
      emailAddress,
      localPart,
      accessSecretHash,
      createdByTokenId ?? null,
      expiresAt,
      createdAt,
    ),
    env.DB.prepare(
      `
        INSERT INTO mailbox_access_links (
          id,
          mailbox_id,
          token_hash,
          expires_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `,
    ).bind(linkId, mailboxId, tokenHash, expiresAt, createdAt),
  ]);

  return {
    id: mailboxId,
    email_address: emailAddress,
    expires_at: expiresAt,
    encrypted_access_url: mailboxLinkUrl(requestUrl, linkId),
  };
}

export async function listUserDomains(
  env: AppEnv,
  userId: string,
  pagination: PaginationParams,
): Promise<{ items: Record<string, unknown>[]; meta: PaginationMeta }> {
  const totalRow = await env.DB.prepare(
    `
      SELECT COUNT(*) AS total
      FROM user_domains ud
      INNER JOIN domains d ON d.id = ud.domain_id
      WHERE ud.user_id = ?
    `,
  )
    .bind(userId)
    .first<{ total: number | string }>();

  const result = await env.DB.prepare(
    `
      SELECT d.id, d.domain, d.type, d.status, d.created_at, d.updated_at
      FROM domains d
      INNER JOIN user_domains ud ON ud.domain_id = d.id
      WHERE ud.user_id = ?
      ORDER BY d.domain ASC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(userId, pagination.pageSize, pagination.offset)
    .all<Record<string, unknown>>();

  return {
    items: result.results,
    meta: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
  };
}

export async function listUserMailboxes(
  env: AppEnv,
  requestUrl: string,
  userId: string,
  pagination: PaginationParams,
) {
  const totalRow = await env.DB.prepare(
    `
      SELECT COUNT(*) AS total
      FROM mailboxes
      WHERE user_id = ?
    `,
  )
    .bind(userId)
    .first<{ total: number | string }>();

  const result = await env.DB.prepare(
    `
      SELECT
        m.id,
        m.email_address,
        m.local_part,
        m.status,
        m.domain_id,
        m.expires_at,
        m.created_at,
        d.domain AS domain_name,
        (
          SELECT mal.id
          FROM mailbox_access_links mal
          WHERE mal.mailbox_id = m.id
          ORDER BY mal.created_at DESC
          LIMIT 1
        ) AS encrypted_token
      FROM mailboxes m
      INNER JOIN domains d ON d.id = m.domain_id
      WHERE m.user_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(userId, pagination.pageSize, pagination.offset)
    .all<MailboxRow>();

  const items = result.results.map((row) => ({
    id: row.id,
    email_address: row.email_address,
    local_part: row.local_part,
    status: row.status,
    domain_id: row.domain_id,
    domain: row.domain_name,
    expires_at: row.expires_at,
    created_at: row.created_at,
    encrypted_access_url: row.encrypted_token
      ? mailboxLinkUrl(requestUrl, row.encrypted_token)
      : null,
  }));

  return {
    items,
    meta: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
  };
}

export async function listMailboxMessages(
  env: AppEnv,
  userId: string,
  mailboxId: string,
  pagination: PaginationParams,
) {
  const mailbox = await env.DB.prepare(
    `
      SELECT id
      FROM mailboxes
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
  )
    .bind(mailboxId, userId)
    .first<{ id: string }>();

  if (!mailbox) {
    throw new AppRouteError(404, "NOT_FOUND", "Mailbox not found.");
  }

  const totalRow = await env.DB.prepare(
    `
      SELECT COUNT(*) AS total
      FROM messages
      WHERE mailbox_id = ?
    `,
  )
    .bind(mailboxId)
    .first<{ total: number | string }>();

  const result = await env.DB.prepare(
    `
      SELECT
        m.id,
        m.from_address,
        m.to_address,
        m.subject,
        m.size,
        m.received_at,
        m.expires_at,
        COUNT(a.id) AS attachment_count
      FROM messages m
      LEFT JOIN message_attachments a ON a.message_id = m.id
      WHERE m.mailbox_id = ?
      GROUP BY m.id
      ORDER BY m.received_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(mailboxId, pagination.pageSize, pagination.offset)
    .all<MessageRow>();

  const items = result.results.map((row) => ({
    id: row.id,
    from_address: row.from_address,
    to_address: row.to_address,
    subject: row.subject,
    size: row.size,
    received_at: row.received_at,
    expires_at: row.expires_at,
    attachment_count: Number(row.attachment_count ?? 0),
  }));

  return {
    items,
    meta: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
  };
}
