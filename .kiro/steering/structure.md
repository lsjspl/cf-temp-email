# Project Structure

## Top-level layout

```
cf-temp-email/
├── src/                    # Worker source (TypeScript, ESM)
│   ├── index.ts            # Hono app + fetch/email/scheduled handlers
│   ├── routes/             # HTTP route modules, mounted from index.ts
│   ├── lib/                # Domain logic, middleware, helpers
│   └── types/              # Shared TypeScript types (no runtime code)
├── migrations/             # D1 SQL migrations (apply in numeric order)
├── scripts/                # Node utility scripts (e.g. smoke tests)
├── docs/                   # Design docs (Chinese)
├── manual-smoke/           # Local smoke-test state (gitignored logs)
├── .kiro/                  # Kiro specs and steering
├── wrangler.jsonc          # Worker config: bindings, vars, cron triggers
├── tsconfig.json           # TS compiler options (noEmit, strict)
├── package.json            # Scripts + deps (hono, postal-mime)
├── .dev.vars[.example]     # Local secrets (gitignored)
└── .gitignore
```

`.wrangler/`, `.manual-debug-*`, `node_modules/`, and `*smoke-run.log` are all generated/ignored.

## `src/index.ts`

The single Worker entry point. Responsibilities:

1. Build the root `Hono<AppSchema>` app.
2. Mount global middleware in this order: `ensureDatabaseReady` → `attachLocale` → `attachRequestMetadata` → `loadSessionUser`, then per-scope rate limits.
3. Mount route groups: `webApp`, `setupApp`, `authApp`, `adminApp` (under `requireSessionUser + requireAdmin`), `userApp` (under `requireSessionUser`), `externalApiApp` (under `requireApiToken + apiRateLimit + touchApiTokenUsage`).
4. Inline handlers for `/inbox/:encryptedToken/...` (shareable inbox link flow).
5. Export `{ fetch, email, scheduled }` — the Worker's three entry events.

When adding a new feature, **new routes go in `src/routes/*.ts`** and are mounted from `index.ts`. Keep `index.ts` as a composition root, not a place for business logic.

## `src/routes/`

Each file exports a `Hono<AppSchema>` sub-app:

- `web.ts` — server-rendered HTML pages.
- `setup.ts` — first-run admin bootstrap (`/setup/*`).
- `auth.ts` — login / logout / session endpoints.
- `admin.ts` — admin-only management (users, domains, tokens, etc.).
- `user.ts` — authenticated user dashboard APIs.
- `external-api.ts` — public Bearer-token API under `/api/v1/*`.

Route handlers should:
- Delegate work to `src/lib/*` modules.
- Throw `AppRouteError` for error paths; let `app.onError` format the response.
- Pull auth via `requireAuthUser(c)` / `requireApiTokenId(c)` rather than reading `c.get` directly.

## `src/lib/`

Domain and infrastructure helpers. One concern per file:

| File                 | Purpose                                                                 |
|----------------------|-------------------------------------------------------------------------|
| `auth.ts`            | Sessions, API tokens, Hono middleware (`requireAdmin`, `requireApiToken`). |
| `crypto.ts`          | Password hashing, id generation, opaque tokens, SHA-256.                |
| `request.ts`         | Input parsing/validation helpers (`requireString`, `validateEmailAddress`, …). |
| `errors.ts`          | `AppErrorCode` union, `AppRouteError`, `errorResponse`.                 |
| `i18n.ts` / `web-i18n.ts` | Locale detection + translation tables.                             |
| `mailboxes.ts`       | Mailbox CRUD and lifecycle.                                             |
| `inbox.ts`           | Shareable inbox link token verification + message/attachment fetch.     |
| `email.ts`           | Inbound-email handler (`processInboundEmail`) — D1 + R2 + KV writes.   |
| `mail-sanitize.ts`   | HTML email sanitization before rendering.                               |
| `html.ts`            | Safe HTML rendering helpers for the web UI.                             |
| `domains.ts`         | Domain registration and Cloudflare integration glue.                    |
| `cloudflare.ts`      | Cloudflare API client (uses admin-configured API token).                |
| `rate-limit.ts`      | KV-backed rate-limit middleware factories.                              |
| `audit.ts`           | `writeAuditLog` helper.                                                 |
| `cleanup.ts`         | Cron cleanup of expired mailboxes/messages.                             |
| `db-bootstrap.ts`    | Lazy D1 init + secret provisioning.                                     |
| `runtime-secrets.ts` | Reads/generates `SESSION_SECRET` / `LINK_SECRET` from `system_settings`. |

New cross-cutting helpers belong here. Keep files focused; if a file grows past one responsibility, split it.

## `src/types/`

Pure type declarations, no runtime imports from `lib/` or `routes/`.

- `env.ts` — `AppEnv` (Worker bindings + vars).
- `auth.ts` — `UserRole`, `UserStatus`, `AuthUser`.
- `app.ts` — `AuthMode`, `AppVariables`, `AppSchema` (Hono generic).

## `migrations/`

D1 schema changes, numbered sequentially (`0001_initial.sql`, `0002_cloudflare_integration_details.sql`, …). Rules:

- One migration per logical change; never edit a previously applied migration.
- Always include `PRAGMA foreign_keys = ON;` awareness — FK columns exist on `users`, `domains`, `mailboxes`, `messages`, etc.
- After editing, run `npm run db:migrate:local` before `npm run db:migrate`.

## `scripts/` and `manual-smoke/`

- `scripts/request-smoke.mjs` — Node script that exercises the HTTP API against a local `wrangler dev` instance (`npm run test:smoke`).
- `manual-smoke/` holds miniflare state and logs from those runs; treat as disposable.

## `.kiro/`

- `.kiro/specs/<feature>/` — per-feature specs (requirements / design / tasks).
- `.kiro/steering/` — these steering files. Always included in context.
