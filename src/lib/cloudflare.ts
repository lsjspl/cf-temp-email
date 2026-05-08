import { optionalString } from "./request";
import { AppRouteError } from "./errors";
import type { AppEnv } from "../types/env";

interface CloudflareEnvelope<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
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

const MANUAL_STEPS = [
  "Open Cloudflare Email Routing for the configured zone and confirm the generated DNS records are present.",
  "Verify the catch-all rule points to the expected Worker script before sending production traffic.",
];

function requireRuntimeConfig(env: AppEnv) {
  const token = optionalString(env.CLOUDFLARE_API_TOKEN);
  const zoneId = optionalString(env.CLOUDFLARE_ZONE_ID);
  const zoneName = optionalString(env.CLOUDFLARE_ZONE_NAME)?.toLowerCase();
  const workerName =
    optionalString(env.CLOUDFLARE_EMAIL_WORKER_NAME) ?? "cf-temp-email";

  if (!token || !zoneId || !zoneName) {
    throw new AppRouteError(
      503,
      "CLOUDFLARE_NOT_CONFIGURED",
      "Cloudflare runtime configuration is incomplete.",
      {
        manual_steps: [
          "Set CLOUDFLARE_API_TOKEN as a runtime secret.",
          "Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_ZONE_NAME in Wrangler vars or dashboard variables.",
        ],
      },
    );
  }

  return {
    token,
    zoneId,
    zoneName,
    workerName,
  };
}

function ensureDomainInZone(domain: string, zoneName: string) {
  const normalized = domain.toLowerCase();
  if (normalized !== zoneName && !normalized.endsWith(`.${zoneName}`)) {
    throw new AppRouteError(
      400,
      "VALIDATION_ERROR",
      `Domain must belong to zone ${zoneName}.`,
      {
        manual_steps: [
          `Use a domain inside ${zoneName}.`,
          "If you need a different zone, change the configured zone vars before retrying.",
        ],
      },
    );
  }
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
  const { token } = requireRuntimeConfig(env);
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

async function enableEmailRoutingDns(env: AppEnv, domain: string) {
  const { zoneId, zoneName } = requireRuntimeConfig(env);
  ensureDomainInZone(domain, zoneName);
  const fullName = domain.toLowerCase();
  const shortName = relativeRouteName(fullName, zoneName);
  const attempts = [fullName, shortName].filter(
    (value, index, list) => value && list.indexOf(value) === index,
  );

  let lastError: unknown = null;
  for (const name of attempts) {
    try {
      return await cloudflareRequest<EmailRoutingDnsResult>(
        env,
        `/zones/${zoneId}/email/routing/dns`,
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

async function enableCatchAllWorkerRule(env: AppEnv, domain: string) {
  const { zoneId, workerName } = requireRuntimeConfig(env);
  return cloudflareRequest<CatchAllRuleResult>(
    env,
    `/zones/${zoneId}/email/routing/rules/catch_all`,
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
  const dns = await enableEmailRoutingDns(env, domain);
  const catchAll = await enableCatchAllWorkerRule(env, domain);

  return {
    dns,
    catch_all: catchAll,
    manual_steps: [
      ...MANUAL_STEPS,
      "If the zone handles unrelated mail, narrow the Email Routing rule manually after initial setup.",
    ],
  };
}
