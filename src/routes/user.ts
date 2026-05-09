import { Hono } from "hono";

import { getAuditContext, writeAuditLog } from "../lib/audit";
import { generateId, generateOpaqueToken, sha256Hex } from "../lib/crypto";
import { requireAuthUser, revokeApiToken } from "../lib/auth";
import { AppRouteError } from "../lib/errors";
import { createMailbox, listMailboxMessages, listUserDomains, listUserMailboxes } from "../lib/mailboxes";
import { buildPaginationMeta, parsePagination } from "../lib/pagination";
import { readJsonBody, requireString } from "../lib/request";
import type { AppSchema } from "../types/app";

const userApp = new Hono<AppSchema>();

userApp.get("/user/domains", async (c) => {
  const user = requireAuthUser(c);
  const pagination = parsePagination(c);
  const { items, meta } = await listUserDomains(c.env, user.id, pagination);
  return c.json({
    domains: items,
    pagination: meta,
  });
});

userApp.get("/user/api-tokens", async (c) => {
  const user = requireAuthUser(c);
  const pagination = parsePagination(c);

  const totalRow = await c.env.DB.prepare(
    `
      SELECT COUNT(*) AS total
      FROM api_tokens
      WHERE user_id = ?
    `,
  )
    .bind(user.id)
    .first<{ total: number | string }>();

  const result = await c.env.DB.prepare(
    `
      SELECT id, name, token_prefix, status, last_used_at, created_at, revoked_at
      FROM api_tokens
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(user.id, pagination.pageSize, pagination.offset)
    .all<Record<string, unknown>>();

  return c.json({
    tokens: result.results,
    pagination: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
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

userApp.patch("/user/api-tokens/:id", async (c) => {
  const user = requireAuthUser(c);
  const tokenId = c.req.param("id");
  const payload = await readJsonBody<Record<string, unknown>>(c);
  
  // 验证 Token 归属
  const token = await c.env.DB.prepare(
    "SELECT id, user_id FROM api_tokens WHERE id = ?"
  ).bind(tokenId).first<{ id: string; user_id: string }>();
  
  if (!token) {
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
  
  if (token.user_id !== user.id) {
    return c.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to edit this token.",
        },
      },
      403,
    );
  }
  
  const name = payload.name ? String(payload.name) : undefined;
  
  if (!name) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Name is required.",
        },
      },
      400,
    );
  }
  
  await c.env.DB.prepare(
    "UPDATE api_tokens SET name = ? WHERE id = ?"
  ).bind(name, tokenId).run();
  
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    action: "user.api_token.updated",
    targetType: "api_token",
    targetId: tokenId,
    metadata: {
      name,
      user_id: user.id,
    },
  });
  
  return c.json({ success: true });
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
  const pagination = parsePagination(c);
  const { items, meta } = await listUserMailboxes(c.env, c.req.url, user.id, pagination);
  return c.json({
    mailboxes: items,
    pagination: meta,
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

userApp.delete("/user/mailboxes/:id", async (c) => {
  const user = requireAuthUser(c);
  const mailboxId = c.req.param("id");
  
  // 验证邮箱归属
  const mailbox = await c.env.DB.prepare(
    "SELECT id, email_address, user_id FROM mailboxes WHERE id = ?"
  ).bind(mailboxId).first<{ id: string; email_address: string; user_id: string }>();
  
  if (!mailbox) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Mailbox not found.",
        },
      },
      404,
    );
  }
  
  if (mailbox.user_id !== user.id) {
    return c.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to delete this mailbox.",
        },
      },
      403,
    );
  }
  
  // 删除相关数据
  await c.env.DB.prepare("DELETE FROM messages WHERE mailbox_id = ?").bind(mailboxId).run();
  await c.env.DB.prepare("DELETE FROM mailbox_access_links WHERE mailbox_id = ?").bind(mailboxId).run();
  await c.env.DB.prepare("DELETE FROM mailboxes WHERE id = ?").bind(mailboxId).run();
  
  // 清理 KV 缓存
  await c.env.MAIL_KV.delete(`inbox:latest:${mailboxId}`);
  await c.env.MAIL_KV.delete(`inbox:count:${mailboxId}`);
  
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    action: "user.mailbox.deleted",
    targetType: "mailbox",
    targetId: mailboxId,
    metadata: {
      email_address: mailbox.email_address,
      user_id: user.id,
    },
  });
  
  return c.json({ success: true });
});

userApp.get("/user/mailboxes/:id/messages", async (c) => {
  const user = requireAuthUser(c);
  const pagination = parsePagination(c);
  const { items, meta } = await listMailboxMessages(
    c.env,
    user.id,
    c.req.param("id"),
    pagination,
  );
  return c.json({
    messages: items,
    pagination: meta,
  });
});

export default userApp;
