export interface AppEnv {
  DB: D1Database;
  MAIL_KV: KVNamespace;
  MAIL_R2: R2Bucket;
  APP_NAME: string;
  DEFAULT_MAIL_TTL_SECONDS: string;
  CLOUDFLARE_EMAIL_WORKER_NAME?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_ZONE_NAME?: string;
  CLOUDFLARE_API_TOKEN?: string;
  SESSION_SECRET: string;
  LINK_SECRET: string;
}
