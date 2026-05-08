# Tech Stack

## Runtime & platform

- **Cloudflare Workers** — single Worker handles `fetch`, `email` (Email Routing), and `scheduled` (cron) events. Entry: `src/index.ts`.
- `compatibility_date: 2026-05-08`. Cron trigger: `*/15 * * * *` drives `runCleanup`.

## Framework & libraries

- **Hono 4** (`hono`) — HTTP routing and middleware. The app is typed with `Hono<AppSchema>` where `AppSchema = { Bindings: AppEnv; Variables: AppVariables }`.
- **postal-mime** — parses inbound raw MIME into subject/text/html/attachments.
- **@cloudflare/workers-types** — ambient types for `D1Database`, `KVNamespace`, `R2Bucket`, `ForwardableEmailMessage`, `ScheduledController`, `ExecutionContext`.
- No React / build step / bundler config — Wrangler bundles TypeScript directly.

## Cloudflare bindings (see `wrangler.jsonc`)

| Binding     | Type | Purpose                                                            |
|-------------|------|--------------------------------------------------------------------|
| `DB`        | D1   | Relational store (users, domains, mailboxes, messages, audit, …). |
| `MAIL_KV`   | KV   | Sessions, rate-limit counters, inbox hot-cache keys.              |
| `MAIL_R2`   | R2   | Raw `.eml`, parsed text, parsed html, attachment blobs.           |

Env vars in `wrangler.jsonc` → `APP_NAME`, `DEFAULT_MAIL_TTL_SECONDS`, `CLOUDFLARE_EMAIL_WORKER_NAME`.
Secrets in `.dev.vars` → `SESSION_SECRET`, `LINK_SECRET`, `CLOUDFLARE_API_TOKEN`. Missing `SESSION_SECRET` / `LINK_SECRET` are auto-generated into `system_settings` on first use via `runtime-secrets.ts` + `db-bootstrap.ts`.

## TypeScript config

- `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict: true`, `noEmit: true`.
- ESM only (`"type": "module"` in `package.json`).

## Common commands

Run from the repo root on Windows (cmd). Replace `&&` with `&` or run one at a time.

```bat
npm install

:: Start local dev (wrangler dev) — long-running, run manually
npm run dev

:: Type check (no emit)
npm run typecheck

:: Apply D1 migrations
npm run db:migrate:local       :: local miniflare D1
npm run db:migrate              :: remote production D1

:: Smoke test against a running dev server
npm run test:smoke

:: Deploy the Worker
npm run deploy
```

## Conventions & patterns

- **Errors**: throw `new AppRouteError(status, code, message, details?)`; the global `app.onError` turns it into a localized JSON response via `errorResponse`. `AppErrorCode` is a closed union in `src/lib/errors.ts` — extend it there, don't use ad-hoc strings.
- **IDs**: all primary keys are prefixed opaque strings from `generateId("prefix")` (`usr`, `msg`, `att`, `sess`, …). Tokens use `generateOpaqueToken`; hash with `sha256Hex` before storing.
- **Timestamps**: always `new Date().toISOString()`, stored as SQLite `TEXT`.
- **Auth**:
  - `loadSessionUser` populates `c.get("authUser")` from the `tm_session` cookie + KV.
  - `requireSessionUser` / `requireAdmin` gate UI + admin routes.
  - `requireApiToken` gates `/api/v1/*` using `Authorization: Bearer …`.
- **Rate limiting**: `loginRateLimit()`, `inboxRateLimit()`, `apiRateLimit()` middlewares backed by `MAIL_KV`.
- **Audit**: call `writeAuditLog(env, { action, targetType, targetId, metadata })` for anything security- or lifecycle-relevant.
- **D1**: always use prepared statements (`env.DB.prepare(...).bind(...)`). Multi-statement writes go through `env.DB.batch([...])`. Never interpolate user input into SQL.
- **Email storage layout** (in `MAIL_R2`):
  - `raw/{mailboxId}/{messageId}.eml`
  - `text/{mailboxId}/{messageId}.txt`
  - `html/{mailboxId}/{messageId}.html`
  - `attachments/{mailboxId}/{messageId}/{attachmentId}/{filename}`
- **i18n**: user-facing text must be routed through `translateErrorMessage` / `attachLocale` / helpers in `web-i18n.ts`. Locale lives on `c.get("locale")`, default `zh-CN`.
- **HTML rendering**: `src/lib/html.ts` and `src/lib/mail-sanitize.ts` own HTML emission and email body sanitization; do not build raw HTML strings in route handlers.
