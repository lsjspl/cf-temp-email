import { Hono } from "hono";

import { getAuditContext, writeAuditLog } from "../lib/audit";
import { generateId, generateOpaqueToken, sha256Hex } from "../lib/crypto";
import { requireAuthUser, revokeApiToken } from "../lib/auth";
import { createMailbox, listMailboxMessages, listUserDomains, listUserMailboxes } from "../lib/mailboxes";
import { readJsonBody, requireString } from "../lib/request";
import type { AppSchema } from "../types/app";

const userApp = new Hono<AppSchema>();

userApp.get("/user/domains", async (c) => {
  const user = requireAuthUser(c);
  return c.json({
    domains: await listUserDomains(c.env, user.id),
  });
});

userApp.get("/user/api-tokens", async (c) => {
  const user = requireAuthUser(c);
  const result = await c.env.DB.prepare(
    `
      SELECT id, name, token_prefix, status, last_used_at, created_at, revoked_at
      FROM api_tokens
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
  )
    .bind(user.id)
    .all<Record<string, unknown>>();

  return c.json({
    tokens: result.results,
  });
});

userApp.post("/user/api-tokens", async (c) => {
  const user = requireAuthUser(c);
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const name = requireString(payload.name, "name");
  const rawToken = generateOpaqueToken("tm");
  const tokenPrefix = rawToken.slice(0, 12);
  const tokenHash = await sha256Hex(rawToken);
  const tokenId = generateId("tok");
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `
      INSERT INTO api_tokens (
        id,
        user_id,
        name,
        token_hash,
        token_prefix,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `,
  )
    .bind(tokenId, user.id, name, tokenHash, tokenPrefix, now)
    .run();

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    action: "user.api_token.created",
    targetType: "api_token",
    targetId: tokenId,
    metadata: {
      name,
      token_prefix: tokenPrefix,
      user_id: user.id,
    },
  });

  return c.json(
    {
      token: {
        id: tokenId,
        name,
        token_prefix: tokenPrefix,
        created_at: now,
      },
      value: rawToken,
    },
    201,
  );
});

userApp.delete("/user/api-tokens/:id", async (c) => {
  const user = requireAuthUser(c);
  const tokenId = c.req.param("id");
  const revokedToken = await revokeApiToken(c.env, tokenId, user.id);

  if (!revokedToken) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "API token not found.",
        },
      },
      404,
    );
  }

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    action: "user.api_token.revoked",
    targetType: "api_token",
    targetId: tokenId,
    metadata: {
      user_id: user.id,
    },
  });

  return c.json({
    success: true,
  });
});

userApp.get("/user/mailboxes", async (c) => {
  const user = requireAuthUser(c);
  return c.json({
    mailboxes: await listUserMailboxes(c.env, c.req.url, user.id),
  });
});

userApp.post("/user/mailboxes", async (c) => {
  const user = requireAuthUser(c);
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const mailbox = await createMailbox(c.env, c.req.url, user.id, payload);

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    action: "user.mailbox.created",
    targetType: "mailbox",
    targetId: mailbox.id,
    metadata: {
      email_address: mailbox.email_address,
      domain_id: payload.domain_id ?? null,
      ttl_seconds: payload.ttl_seconds ?? null,
    },
  });

  return c.json(mailbox, 201);
});

userApp.get("/user/mailboxes/:id/messages", async (c) => {
  const user = requireAuthUser(c);
  return c.json({
    messages: await listMailboxMessages(c.env, user.id, c.req.param("id")),
  });
});

export default userApp;
