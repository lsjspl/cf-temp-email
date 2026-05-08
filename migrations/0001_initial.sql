PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE domains (
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
);

CREATE TABLE user_domains (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, domain_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE TABLE api_tokens (
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
);

CREATE TABLE mailboxes (
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
);

CREATE TABLE mailbox_access_links (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id)
);

CREATE TABLE messages (
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
);

CREATE TABLE message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE TABLE audit_logs (
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
);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE cloudflare_integrations (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  zone_id TEXT,
  zone_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_domains_domain ON domains(domain);
CREATE INDEX idx_user_domains_user_id ON user_domains(user_id);
CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash);
CREATE INDEX idx_mailboxes_user_id ON mailboxes(user_id);
CREATE INDEX idx_mailboxes_email_address ON mailboxes(email_address);
CREATE INDEX idx_mailboxes_expires_at ON mailboxes(expires_at);
CREATE INDEX idx_messages_mailbox_id ON messages(mailbox_id);
CREATE INDEX idx_messages_received_at ON messages(received_at);
CREATE INDEX idx_messages_expires_at ON messages(expires_at);
CREATE INDEX idx_attachments_message_id ON message_attachments(message_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

