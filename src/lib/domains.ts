import { generateId } from "./crypto";
import { configureDomainWithCloudflare, getStoredCloudflareApiToken } from "./cloudflare";
import { AppRouteError } from "./errors";
import { optionalString, requireString } from "./request";
import type { AppEnv } from "../types/env";

function normalizeDomain(domain: string): string {
  const normalized = domain.trim().toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) {
    throw new AppRouteError(400, "VALIDATION_ERROR", "domain must be a valid hostname.");
  }

  return normalized;
}

export async function createDomainRecord(
  env: AppEnv,
  payload: Record<string, unknown>,
  actorUserId?: string,
) {
  const domain = normalizeDomain(requireString(payload.domain, "domain"));

  const type = optionalString(payload.type) ?? "subdomain";
  const status = optionalString(payload.status) ?? "pending";

  if (type !== "root" && type !== "subdomain") {
    throw new AppRouteError(400, "VALIDATION_ERROR", "type must be root or subdomain.");
  }

  if (!["pending", "active", "failed", "disabled"].includes(status)) {
    throw new AppRouteError(
      400,
      "VALIDATION_ERROR",
      "status must be pending, active, failed, or disabled.",
    );
  }

  const id = generateId("dom");
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `
        INSERT INTO domains (
          id,
          domain,
          type,
          zone_id,
          status,
          created_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(id, domain, type, null, status, actorUserId ?? null, now, now)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new AppRouteError(409, "VALIDATION_ERROR", "That domain already exists.");
    }
    throw error;
  }

  return getDomainById(env, id);
}

export async function getDomainById(env: AppEnv, domainId: string) {
  return (
    (await env.DB.prepare(
      `
        SELECT
          d.id,
          d.domain,
          d.type,
          d.zone_id,
          d.status,
          d.cloudflare_rule_id,
          d.cloudflare_dns_record_id,
          d.created_by,
          d.created_at,
          d.updated_at,
          COUNT(ud.id) AS assigned_user_count
        FROM domains d
        LEFT JOIN user_domains ud ON ud.domain_id = d.id
        WHERE d.id = ?
        GROUP BY d.id
        LIMIT 1
      `,
    )
      .bind(domainId)
      .first<Record<string, unknown>>()) ?? null
  );
}

export async function listDomains(env: AppEnv) {
  const result = await env.DB.prepare(
    `
      SELECT
        d.id,
        d.domain,
        d.type,
        d.zone_id,
        d.status,
        d.cloudflare_rule_id,
        d.cloudflare_dns_record_id,
        d.created_by,
        d.created_at,
        d.updated_at,
        COUNT(ud.id) AS assigned_user_count
      FROM domains d
      LEFT JOIN user_domains ud ON ud.domain_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `,
  ).all<Record<string, unknown>>();

  return result.results;
}

export async function assignDomainToUser(env: AppEnv, userId: string, domainId: string) {
  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<{ id: string }>();
  if (!user) {
    throw new AppRouteError(404, "NOT_FOUND", "User not found.");
  }

  const domain = await env.DB.prepare(
    "SELECT id, status FROM domains WHERE id = ? LIMIT 1",
  )
    .bind(domainId)
    .first<{ id: string; status: string }>();
  if (!domain) {
    throw new AppRouteError(404, "NOT_FOUND", "Domain not found.");
  }

  if (domain.status !== "active") {
    throw new AppRouteError(400, "DOMAIN_NOT_AVAILABLE", "Domain must be active before assignment.");
  }

  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `
        INSERT INTO user_domains (id, user_id, domain_id, created_at)
        VALUES (?, ?, ?, ?)
      `,
    )
      .bind(generateId("ud"), userId, domainId, now)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new AppRouteError(409, "VALIDATION_ERROR", "Domain is already assigned to that user.");
    }
    throw error;
  }
}

export async function removeDomainFromUser(env: AppEnv, userId: string, domainId: string) {
  await env.DB.prepare(
    `
      DELETE FROM user_domains
      WHERE user_id = ? AND domain_id = ?
    `,
  )
    .bind(userId, domainId)
    .run();
}

export async function markDomainVerified(env: AppEnv, domainId: string) {
  const domain = await env.DB.prepare(
    "SELECT id, domain FROM domains WHERE id = ? LIMIT 1",
  )
    .bind(domainId)
    .first<{ id: string; domain: string }>();

  if (!domain) {
    throw new AppRouteError(404, "NOT_FOUND", "Domain not found.");
  }

  await env.DB.prepare(
    `
      UPDATE domains
      SET status = 'active', updated_at = ?
      WHERE id = ?
    `,
  )
    .bind(new Date().toISOString(), domainId)
    .run();

  return getDomainById(env, domainId);
}

export async function getCloudflareStatus(env: AppEnv) {
  const integration = await env.DB.prepare(
    `
      SELECT
        id,
        domain_id,
        account_id,
        zone_id,
        zone_name,
        status,
        details_json,
        last_error,
        created_at,
        updated_at
      FROM cloudflare_integrations
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  ).first<Record<string, unknown>>();

  return {
    runtime: {
      has_api_token: Boolean(await getStoredCloudflareApiToken(env)),
      email_worker_name: optionalString(env.CLOUDFLARE_EMAIL_WORKER_NAME) ?? "cf-temp-email",
      zone_scope: "all_accessible_zones",
    },
    integration: integration ?? null,
  };
}

export async function configureDomainRuntime(env: AppEnv, domainId: string) {
  const domain = await env.DB.prepare(
    `
      SELECT id, domain
      FROM domains
      WHERE id = ?
      LIMIT 1
    `,
  )
    .bind(domainId)
    .first<{ id: string; domain: string }>();

  if (!domain) {
    throw new AppRouteError(404, "NOT_FOUND", "Domain not found.");
  }

  try {
    const result = await configureDomainWithCloudflare(env, domain.domain);
    const dnsRecordId = result.dns.records?.find((item) => item.id)?.id ?? result.dns.id ?? null;
    const catchAllId = result.catch_all.id ?? null;

    await env.DB.batch([
      env.DB.prepare(
        `
          UPDATE domains
          SET
            zone_id = ?,
            status = 'active',
            cloudflare_rule_id = ?,
            cloudflare_dns_record_id = ?,
            updated_at = ?
          WHERE id = ?
        `,
      ).bind(result.zone.id, catchAllId, dnsRecordId, new Date().toISOString(), domainId),
      env.DB.prepare(
        `
          INSERT INTO cloudflare_integrations (
            id,
            domain_id,
            account_id,
            zone_id,
            zone_name,
            status,
            details_json,
            last_error,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)
        `,
      ).bind(
        generateId("cfi"),
        domainId,
        result.zone.accountId,
        result.zone.id,
        result.zone.name,
        JSON.stringify(result),
        new Date().toISOString(),
        new Date().toISOString(),
      ),
    ]);

    return {
      domain: await getDomainById(env, domainId),
      cloudflare: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Cloudflare error.";
    await env.DB.prepare(
      `
        UPDATE domains
        SET status = 'failed', updated_at = ?
        WHERE id = ?
      `,
    )
      .bind(new Date().toISOString(), domainId)
      .run();
    await env.DB.prepare(
      `
        INSERT INTO cloudflare_integrations (
          id,
          domain_id,
          account_id,
          zone_id,
          zone_name,
          status,
          details_json,
          last_error,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'failed', NULL, ?, ?, ?)
      `,
    )
      .bind(
        generateId("cfi"),
        domainId,
        null,
        null,
        null,
        message,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
    throw error;
  }
}
