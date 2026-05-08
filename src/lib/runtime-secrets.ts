import { generateOpaqueToken } from "./crypto";
import type { AppEnv } from "../types/env";

type SecretName = "SESSION_SECRET" | "LINK_SECRET";

const SYSTEM_SETTING_KEYS: Record<SecretName, string> = {
  SESSION_SECRET: "system:secret:session",
  LINK_SECRET: "system:secret:link",
};

const inMemorySecrets = new Map<SecretName, string>();
const pendingSecrets = new Map<SecretName, Promise<string>>();

async function loadOrCreateSecret(env: AppEnv, name: SecretName): Promise<string> {
  const cachedValue = inMemorySecrets.get(name);
  if (cachedValue) {
    return cachedValue;
  }

  const pending = pendingSecrets.get(name);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    const settingKey = SYSTEM_SETTING_KEYS[name];
    const existing = await env.DB.prepare(
      `
        SELECT value
        FROM system_settings
        WHERE key = ?
        LIMIT 1
      `,
    )
      .bind(settingKey)
      .first<{ value: string | null }>();

    const existingValue = existing?.value?.trim();
    if (existingValue) {
      inMemorySecrets.set(name, existingValue);
      return existingValue;
    }

    const generated = generateOpaqueToken("sec", 32);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `
        INSERT OR IGNORE INTO system_settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `,
    )
      .bind(settingKey, generated, now)
      .run();

    const stored = await env.DB.prepare(
      `
        SELECT value
        FROM system_settings
        WHERE key = ?
        LIMIT 1
      `,
    )
      .bind(settingKey)
      .first<{ value: string | null }>();

    const resolved = stored?.value?.trim();
    if (!resolved) {
      throw new Error(`Failed to initialize ${name}.`);
    }

    inMemorySecrets.set(name, resolved);
    return resolved;
  })();

  pendingSecrets.set(name, promise);

  try {
    return await promise;
  } finally {
    pendingSecrets.delete(name);
  }
}

export async function getSessionSecret(env: AppEnv): Promise<string> {
  return loadOrCreateSecret(env, "SESSION_SECRET");
}

export async function getLinkSecret(env: AppEnv): Promise<string> {
  return loadOrCreateSecret(env, "LINK_SECRET");
}
