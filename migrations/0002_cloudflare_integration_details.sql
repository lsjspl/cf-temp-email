ALTER TABLE cloudflare_integrations ADD COLUMN domain_id TEXT;
ALTER TABLE cloudflare_integrations ADD COLUMN details_json TEXT;
ALTER TABLE cloudflare_integrations ADD COLUMN last_error TEXT;

CREATE INDEX idx_cloudflare_integrations_updated_at
  ON cloudflare_integrations(updated_at);
