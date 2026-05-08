# Product

`cf-temp-email` is a self-hosted **temporary / disposable email service** that runs entirely on Cloudflare's edge platform.

## What it does

- Lets admins register owned domains (or subdomains) with Cloudflare and route inbound mail into the Worker via Cloudflare Email Routing.
- Lets authenticated users mint short-lived mailboxes on those domains, receive messages, and read text/HTML bodies plus attachments.
- Provides a shareable encrypted inbox link so a mailbox can be viewed without a user session (useful for one-off signups, integrations, etc.).
- Exposes an external **Bearer-token API** (`/api/v1/*`) for programmatic mailbox creation and message retrieval.
- Cleans up expired mailboxes and messages on a cron schedule (every 15 minutes).

## Core domain concepts

- **User** (`admin` or `user`) — authenticates via session cookie (`tm_session`).
- **API token** — hashed bearer token tied to a user, used for the external API.
- **Domain** — Cloudflare-managed domain or subdomain that can host mailboxes.
- **Mailbox** — `local_part@domain` with an `expires_at`, owned by a user, optionally created by an API token.
- **Mailbox access link** — opaque/encrypted token granting read-only inbox access without a session.
- **Message + attachments** — raw `.eml` plus parsed text/html stored in R2, metadata in D1.
- **Audit log** — every notable action (login, mailbox create, inbound accepted/rejected, cleanup, etc.) is persisted.

## Language & locale

- Default UI/error locale is `zh-CN`; `en` is supported. All user-facing strings go through `translateErrorMessage` / `attachLocale` / `web-i18n`.
- Design doc (`docs/设计文档.md`) is written in Chinese. Prefer Chinese for new product-level docs unless the user asks otherwise.
