import { optionalString } from "./request";
import { AppRouteError } from "./errors";
import type { AppEnv } from "../types/env";

interface CloudflareEnvelope<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
  result_info?: {
    page?: number;
    per_page?: number;
    count?: number;
    total_count?: number;
    total_pages?: number;
  };
}

interface EmailRoutingDnsResult {
  id?: string;
  name?: string;
  records?: Array<{ id?: string; name?: string; type?: string; content?: string }>;
}

interface CatchAllRuleResult {
  id?: string;
  name?: string;
  enabled?: boolean;
}

interface ZoneResult {
  id: string;
  name: string;
  account?: {
    id?: string;
  };
}

interface ResolvedZone {
  id: string;
  name: string;
  accountId: string | null;
}

const CLOUDFLARE_TOKEN_SETTING_KEY = "system:cloudflare:api_token";

const MANUAL_STEPS = [
  "Open Cloudflare Email Routing for the configured zone and confirm the generated DNS records are present.",
  "Verify the catch-all rule points to the expected Worker script before sending production traffic.",
];

function requireRuntimeConfig(env: AppEnv) {
  const workerName =
    optionalString(env.CLOUDFLARE_EMAIL_WORKER_NAME) ?? "cf-temp-email";

  return {
    workerName,
  };
}

export async function getStoredCloudflareApiToken(env: AppEnv): Promise<string | null> {
  const row = await env.DB.prepare(
    `
      SELECT value
      FROM system_settings
      WHERE key = ?
      LIMIT 1
    `,
  )
    .bind(CLOUDFLARE_TOKEN_SETTING_KEY)
    .first<{ value: string | null }>();

  return row?.value?.trim() || null;
}

export async function setStoredCloudflareApiToken(env: AppEnv, token: string | null): Promise<void> {
  const now = new Date().toISOString();

  if (!token) {
    await env.DB.prepare("DELETE FROM system_settings WHERE key = ?")
      .bind(CLOUDFLARE_TOKEN_SETTING_KEY)
      .run();
    return;
  }

  await env.DB.prepare(
    `
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
  )
    .bind(CLOUDFLARE_TOKEN_SETTING_KEY, token, now)
    .run();
}

function relativeRouteName(domain: string, zoneName: string): string {
  if (domain === zoneName) {
    return zoneName;
  }

  const suffix = `.${zoneName}`;
  if (domain.endsWith(suffix)) {
    return domain.slice(0, -suffix.length);
  }

  return domain;
}

async function cloudflareRequest<T>(
  env: AppEnv,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getStoredCloudflareApiToken(env);
  if (!token) {
    throw new AppRouteError(
      503,
      "CLOUDFLARE_NOT_CONFIGURED",
      "Cloudflare API token is not configured in the admin settings.",
      {
        manual_steps: [
          "Open the admin Operations panel.",
          "Save a Cloudflare API token with access to the zones you want this worker to manage.",
        ],
      },
    );
  }
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as CloudflareEnvelope<T> | null;
  if (!response.ok || !payload?.success) {
    const message =
      payload?.errors?.map((item) => item.message).filter(Boolean).join("; ") ||
      `Cloudflare API request failed with status ${response.status}.`;
    throw new AppRouteError(502, "CLOUDFLARE_API_ERROR", message, {
      manual_steps: MANUAL_STEPS,
    });
  }

  if (!payload.result) {
    throw new AppRouteError(502, "CLOUDFLARE_API_ERROR", "Cloudflare API returned no result.", {
      manual_steps: MANUAL_STEPS,
    });
  }

  return payload.result;
}

async function listAccessibleZones(env: AppEnv): Promise<ZoneResult[]> {
  const token = await getStoredCloudflareApiToken(env);
  if (!token) {
    throw new AppRouteError(
      503,
      "CLOUDFLARE_NOT_CONFIGURED",
      "Cloudflare API token is not configured in the admin settings.",
      {
        manual_steps: [
          "Open the admin Operations panel.",
          "Save a Cloudflare API token with access to the zones you want this worker to manage.",
        ],
      },
    );
  }
  const zones: ZoneResult[] = [];
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}&order=name&direction=asc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const payload = (await response.json().catch(() => null)) as CloudflareEnvelope<ZoneResult[]> | null;
    if (!response.ok || !payload?.success || !payload.result) {
      const message =
        payload?.errors?.map((item) => item.message).filter(Boolean).join("; ") ||
        `Cloudflare API request failed with status ${response.status}.`;
      throw new AppRouteError(502, "CLOUDFLARE_API_ERROR", message, {
        manual_steps: MANUAL_STEPS,
      });
    }

    zones.push(...payload.result);

    const totalPages = Number(payload.result_info?.total_pages ?? 1);
    if (!Number.isFinite(totalPages) || page >= totalPages) {
      break;
    }

    page += 1;
  }

  return zones;
}

async function resolveZoneForDomain(env: AppEnv, domain: string): Promise<ResolvedZone> {
  const normalized = domain.toLowerCase();
  const zones = await listAccessibleZones(env);
  const matches = zones
    .map((zone) => ({ ...zone, normalizedName: zone.name.toLowerCase() }))
    .filter((zone) => normalized === zone.normalizedName || normalized.endsWith(`.${zone.normalizedName}`))
    .sort((left, right) => right.normalizedName.length - left.normalizedName.length);

  const match = matches[0];
  if (!match) {
    throw new AppRouteError(
      400,
      "VALIDATION_ERROR",
      "Domain does not belong to any zone accessible by the configured Cloudflare token.",
      {
        manual_steps: [
          "Use a domain inside a zone that this Cloudflare token can access.",
          "If the token should manage this zone, expand the token's zone permissions and retry.",
        ],
      },
    );
  }

  return {
    id: match.id,
    name: match.name.toLowerCase(),
    accountId: match.account?.id ?? null,
  };
}

async function enableEmailRoutingDns(env: AppEnv, zone: ResolvedZone, domain: string) {
  const fullName = domain.toLowerCase();
  const shortName = relativeRouteName(fullName, zone.name);
  const attempts = [fullName, shortName].filter(
    (value, index, list) => value && list.indexOf(value) === index,
  );

  let lastError: unknown = null;
  for (const name of attempts) {
    try {
      return await cloudflareRequest<EmailRoutingDnsResult>(
        env,
        `/zones/${zone.id}/email/routing/dns`,
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function enableCatchAllWorkerRule(env: AppEnv, zone: ResolvedZone, domain: string) {
  const { workerName } = requireRuntimeConfig(env);
  return cloudflareRequest<CatchAllRuleResult>(
    env,
    `/zones/${zone.id}/email/routing/rules/catch_all`,
    {
      method: "PUT",
      body: JSON.stringify({
        name: `Temp Mail catch-all for ${domain}`,
        enabled: true,
        matchers: [{ type: "all" }],
        actions: [{ type: "worker", value: [workerName] }],
      }),
    },
  );
}

export async function configureDomainWithCloudflare(env: AppEnv, domain: string) {
  const zone = await resolveZoneForDomain(env, domain);
  const dns = await enableEmailRoutingDns(env, zone, domain);
  const catchAll = await enableCatchAllWorkerRule(env, zone, domain);

  return {
    zone,
    dns,
    catch_all: catchAll,
    manual_steps: [
      ...MANUAL_STEPS,
      "If the zone handles unrelated mail, narrow the Email Routing rule manually after initial setup.",
    ],
  };
}


/**
 * 删除域名时清理 Cloudflare 上的 DNS 记录和 Email Routing 规则。
 * 如果 Cloudflare API token 未配置或清理失败，不阻塞删除操作（仅记录错误）。
 */
export async function cleanupDomainFromCloudflare(
  env: AppEnv,
  domainRecord: { domain: string; zone_id?: string | null; cloudflare_dns_record_id?: string | null; cloudflare_rule_id?: string | null },
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  const token = await getStoredCloudflareApiToken(env);
  if (!token) {
    return { success: true, errors: [] }; // 没配置 token，跳过
  }

  const zoneId = domainRecord.zone_id;
  if (!zoneId) {
    // 没有 zone_id 说明从未配置过 Cloudflare，跳过
    return { success: true, errors: [] };
  }

  // 1. 删除 DNS 记录（MX、TXT 等 Email Routing 相关记录）
  try {
    // 先查找该域名相关的所有 DNS 记录
    const dnsResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(domainRecord.domain)}&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    const dnsPayload = (await dnsResponse.json().catch(() => null)) as CloudflareEnvelope<Array<{ id: string; type: string; name: string }>> | null;

    if (dnsPayload?.success && dnsPayload.result) {
      // 删除 MX 和 TXT 记录（Email Routing 创建的）
      const emailRecords = dnsPayload.result.filter(
        (r) => (r.type === "MX" || r.type === "TXT") && r.name === domainRecord.domain,
      );
      for (const record of emailRecords) {
        try {
          await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            },
          );
        } catch (e) {
          errors.push(`Failed to delete DNS record ${record.id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    // 如果有存储的 dns_record_id，也尝试删除
    if (domainRecord.cloudflare_dns_record_id) {
      try {
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${domainRecord.cloudflare_dns_record_id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (e) {
        errors.push(`Failed to delete stored DNS record: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
  } catch (e) {
    errors.push(`DNS cleanup failed: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // 2. 禁用 catch-all 规则（不能直接删除，改为禁用）
  if (domainRecord.cloudflare_rule_id) {
    try {
      await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules/catch_all`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Disabled catch-all",
            enabled: false,
            matchers: [{ type: "all" }],
            actions: [{ type: "drop" }],
          }),
        },
      );
    } catch (e) {
      errors.push(`Failed to disable catch-all rule: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return { success: errors.length === 0, errors };
}
