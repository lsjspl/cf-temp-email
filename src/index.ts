import { Hono } from "hono";

import {
  attachRequestMetadata,
  loadSessionUser,
  requireAdmin,
  requireApiToken,
  requireSessionUser,
  touchApiTokenUsage,
} from "./lib/auth";
import { writeAuditLog } from "./lib/audit";
import { ensureDatabaseReady } from "./lib/db-bootstrap";
import { runCleanup } from "./lib/cleanup";
import { processInboundEmail } from "./lib/email";
import { AppRouteError, errorResponse } from "./lib/errors";
import { attachLocale } from "./lib/i18n";
import { getInboxAttachment, getInboxMessage, listInboxMessages, validateInboxAccessToken } from "./lib/inbox";
import { apiRateLimit, inboxRateLimit, loginRateLimit } from "./lib/rate-limit";
import { parsePagination } from "./lib/pagination";
import adminApp from "./routes/admin";
import authApp from "./routes/auth";
import externalApiApp from "./routes/external-api";
import setupApp from "./routes/setup";
import userApp from "./routes/user";
import type { AppSchema } from "./types/app";
import type { AppEnv } from "./types/env";

const app = new Hono<AppSchema>();

app.use("*", async (c, next) => {
  await ensureDatabaseReady(c.env);
  await next();
});
app.use("*", attachLocale);
app.use("*", attachRequestMetadata);
app.use("*", loadSessionUser);
app.use("/auth/login", loginRateLimit());
app.use("/inbox/*", inboxRateLimit());

app.route("/", setupApp);
app.route("/", authApp);

app.use("/admin/*", requireSessionUser, requireAdmin);
app.route("/", adminApp);

app.use("/user/*", requireSessionUser);
app.route("/", userApp);

app.use("/api/v1/*", requireApiToken);
app.use("/api/v1/*", apiRateLimit());
app.use("/api/v1/*", touchApiTokenUsage);
app.route("/", externalApiApp);

app.get("/inbox/:encryptedToken/messages", async (c) => {
  const { mailbox, mailboxId } = await validateInboxAccessToken(c.env, c.req.param("encryptedToken"), {
    ip: c.get("requestIp") ?? null,
    userAgent: c.req.header("User-Agent") ?? null,
  });
  const pagination = parsePagination(c);
  const { items, meta } = await listInboxMessages(c.env, mailboxId, pagination);
  return c.json({
    mailbox,
    messages: items,
    pagination: meta,
  });
});

app.get("/inbox/:encryptedToken/messages/:messageId", async (c) => {
  const { mailbox, mailboxId } = await validateInboxAccessToken(c.env, c.req.param("encryptedToken"), {
    ip: c.get("requestIp") ?? null,
    userAgent: c.req.header("User-Agent") ?? null,
  });
  return c.json({
    mailbox,
    message: await getInboxMessage(c.env, mailboxId, c.req.param("messageId")),
  });
});

app.get("/inbox/:encryptedToken/attachments/:attachmentId", async (c) => {
  const { mailboxId } = await validateInboxAccessToken(c.env, c.req.param("encryptedToken"), {
    ip: c.get("requestIp") ?? null,
    userAgent: c.req.header("User-Agent") ?? null,
  });
  const { attachment, object } = await getInboxAttachment(c.env, mailboxId, c.req.param("attachmentId"));
  const headers = new Headers();
  headers.set("Content-Type", attachment.content_type ?? "application/octet-stream");
  const filename = attachment.filename ?? `${attachment.id}.bin`;
  headers.set("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
  return new Response(object.body, {
    headers,
  });
});

app.notFound(async (c) => {
  // API 路径返回 JSON 404
  const path = new URL(c.req.url).pathname;
  if (
    path.startsWith("/auth/") ||
    path.startsWith("/admin/") ||
    path.startsWith("/user/") ||
    path.startsWith("/api/") ||
    path.startsWith("/setup/")
  ) {
    return errorResponse(c, 404, "NOT_FOUND", "Not Found");
  }
  // SPA fallback: 返回 index.html
  return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url), c.req.raw));
});

app.onError((err, c) => {
  if (err instanceof AppRouteError) {
    return errorResponse(c, err.status, err.code, err.message, err.details);
  }

  console.error(err);
  return errorResponse(c, 500, "INTERNAL_ERROR", "Internal Server Error");
});

async function handleIncomingEmail(
  env: AppEnv,
  message: ForwardableEmailMessage,
): Promise<void> {
  await ensureDatabaseReady(env);
  await processInboundEmail(env, message);
}

async function runScheduledCleanup(env: AppEnv): Promise<void> {
  await ensureDatabaseReady(env);
  const summary = await runCleanup(env);
  await writeAuditLog(env, {
    action: "system.cleanup.completed",
    targetType: "scheduled_cleanup",
    targetId: "*/15 * * * *",
    metadata: summary,
  });
  console.log("Cleanup complete", summary);
}

export default {
  fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: AppEnv, ctx: ExecutionContext) {
    ctx.waitUntil(handleIncomingEmail(env, message));
  },
  async scheduled(_event: ScheduledController, env: AppEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledCleanup(env));
  },
};
