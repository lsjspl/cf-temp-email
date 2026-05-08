import type { AppEnv } from "../types/env";

const SCHEMA_STATEMENTS = [
  "PRAGMA foreign_keys = ON",
  `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('root', 'subdomain')),
      zone_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed', 'disabled')),
      cloudflare_rule_id TEXT,
      cloudflare_dns_record_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS user_domains (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, domain_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (domain_id) REFERENCES domains(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS mailboxes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      email_address TEXT NOT NULL UNIQUE,
      local_part TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'expired')),
      access_secret_hash TEXT NOT NULL,
      created_by_token_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      disabled_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (created_by_token_id) REFERENCES api_tokens(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS mailbox_access_links (
      id TEXT PRIMARY KEY,
      mailbox_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      mailbox_id TEXT NOT NULL,
      from_address TEXT,
      to_address TEXT NOT NULL,
      subject TEXT,
      text_r2_key TEXT,
      html_r2_key TEXT,
      raw_r2_key TEXT NOT NULL,
      size INTEGER,
      received_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      filename TEXT,
      content_type TEXT,
      size INTEGER,
      r2_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ip TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS cloudflare_integrations (
      id TEXT PRIMARY KEY,
      domain_id TEXT,
      account_id TEXT,
      zone_id TEXT,
      zone_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      details_json TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
  "CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain)",
  "CREATE INDEX IF NOT EXISTS idx_user_domains_user_id ON user_domains(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash)",
  "CREATE INDEX IF NOT EXISTS idx_mailboxes_user_id ON mailboxes(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_mailboxes_email_address ON mailboxes(email_address)",
  "CREATE INDEX IF NOT EXISTS idx_mailboxes_expires_at ON mailboxes(expires_at)",
  "CREATE INDEX IF NOT EXISTS idx_messages_mailbox_id ON messages(mailbox_id)",
  "CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at)",
  "CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON messages(expires_at)",
  "CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON message_attachments(message_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_cloudflare_integrations_updated_at ON cloudflare_integrations(updated_at)",
];

const CLOUDFLARE_INTEGRATION_COLUMNS = [
  { name: "domain_id", sql: "ALTER TABLE cloudflare_integrations ADD COLUMN domain_id TEXT" },
  { name: "details_json", sql: "ALTER TABLE cloudflare_integrations ADD COLUMN details_json TEXT" },
  { name: "last_error", sql: "ALTER TABLE cloudflare_integrations ADD COLUMN last_error TEXT" },
];

let bootstrapPromise: Promise<void> | null = null;

async function ensureCloudflareIntegrationColumns(env: AppEnv): Promise<void> {
  const info = await env.DB.prepare("PRAGMA table_info(cloudflare_integrations)")
    .all<{ name: string }>();
  const existing = new Set(info.results.map((row) => row.name));

  for (const column of CLOUDFLARE_INTEGRATION_COLUMNS) {
    if (!existing.has(column.name)) {
      await env.DB.prepare(column.sql).run();
    }
  }
}

async function runBootstrap(env: AppEnv): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await env.DB.prepare(statement).run();
  }

  await ensureCloudflareIntegrationColumns(env);
}

export async function ensureDatabaseReady(env: AppEnv): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap(env).catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
}
