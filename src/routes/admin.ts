import { Hono } from "hono";

import { createUser, deleteUserById, listAllApiTokens, requireAuthUser, revokeApiToken, updateUser } from "../lib/auth";
import { getAuditContext, writeAuditLog } from "../lib/audit";
import { setStoredCloudflareApiToken } from "../lib/cloudflare";
import { cleanupDomainFromCloudflare } from "../lib/cloudflare";
import {
  assignDomainToUser,
  configureDomainRuntime,
  createDomainRecord,
  getCloudflareStatus,
  listDomains,
  markDomainVerified,
  removeDomainFromUser,
} from "../lib/domains";
import { AppRouteError } from "../lib/errors";
import { buildPaginationMeta, parsePagination } from "../lib/pagination";
import { optionalString, readJsonBody } from "../lib/request";
import type { AppSchema } from "../types/app";

const adminApp = new Hono<AppSchema>();

adminApp.get("/admin/users", async (c) => {
  const pagination = parsePagination(c);

  const totalRow = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{
    total: number | string;
  }>();

  const result = await c.env.DB.prepare(
    `
      SELECT id, email, username, role, status, created_at, updated_at, last_login_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(pagination.pageSize, pagination.offset)
    .all<Record<string, unknown>>();

  return c.json({
    users: result.results,
    pagination: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
  });
});

adminApp.post("/admin/users", async (c) => {
  const actor = requireAuthUser(c);
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const user = await createUser(c.env, payload, "user");

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.user.created",
    targetType: "user",
    targetId: user.id,
    metadata: {
      email: user.email,
      role: user.role,
    },
  });

  return c.json(
    {
      user,
    },
    201,
  );
});

adminApp.patch("/admin/users/:id", async (c) => {
  const actor = requireAuthUser(c);
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const user = await updateUser(c.env, c.req.param("id"), payload);

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.user.updated",
    targetType: "user",
    targetId: user.id,
    metadata: {
      role: user.role,
      status: user.status,
      username: user.username,
    },
  });

  return c.json({
    user,
  });
});

adminApp.delete("/admin/users/:id", async (c) => {
  const currentUser = requireAuthUser(c);
  const targetUserId = c.req.param("id");

  if (currentUser.id === targetUserId) {
    throw new AppRouteError(400, "VALIDATION_ERROR", "You cannot delete the current user.");
  }

  await deleteUserById(c.env, targetUserId);
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: currentUser.id,
    action: "admin.user.deleted",
    targetType: "user",
    targetId: targetUserId,
  });

  return c.json({
    success: true,
  });
});

adminApp.get("/admin/users/:id/domains", async (c) => {
  const pagination = parsePagination(c);
  const userId = c.req.param("id");

  const totalRow = await c.env.DB.prepare(
    `
      SELECT COUNT(*) AS total
      FROM user_domains ud
      INNER JOIN domains d ON d.id = ud.domain_id
      WHERE ud.user_id = ?
    `,
  )
    .bind(userId)
    .first<{ total: number | string }>();

  const result = await c.env.DB.prepare(
    `
      SELECT d.id, d.domain, d.type, d.status, ud.created_at
      FROM user_domains ud
      INNER JOIN domains d ON d.id = ud.domain_id
      WHERE ud.user_id = ?
      ORDER BY d.domain ASC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(userId, pagination.pageSize, pagination.offset)
    .all<Record<string, unknown>>();

  return c.json({
    domains: result.results,
    pagination: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
  });
});

adminApp.post("/admin/users/:id/domains", async (c) => {
  const actor = requireAuthUser(c);
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const userId = c.req.param("id");
  const domainId = String(payload.domain_id ?? "");

  await assignDomainToUser(c.env, userId, domainId);
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.user_domain.assigned",
    targetType: "user_domain",
    targetId: `${userId}:${domainId}`,
    metadata: { user_id: userId, domain_id: domainId },
  });

  return c.json({
    success: true,
  });
});

adminApp.delete("/admin/users/:id/domains/:domainId", async (c) => {
  const actor = requireAuthUser(c);
  const userId = c.req.param("id");
  const domainId = c.req.param("domainId");

  await removeDomainFromUser(c.env, userId, domainId);
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.user_domain.removed",
    targetType: "user_domain",
    targetId: `${userId}:${domainId}`,
    metadata: { user_id: userId, domain_id: domainId },
  });

  return c.json({
    success: true,
  });
});

adminApp.get("/admin/domains", async (c) => {
  const pagination = parsePagination(c);
  const { items, meta } = await listDomains(c.env, pagination);
  return c.json({
    domains: items,
    pagination: meta,
  });
});

adminApp.post("/admin/domains", async (c) => {
  const actor = requireAuthUser(c);
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const domain = await createDomainRecord(c.env, payload, actor.id);

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.domain.created",
    targetType: "domain",
    targetId: String(domain?.id ?? ""),
    metadata: domain ?? null,
  });

  return c.json(
    {
      domain,
    },
    201,
  );
});

adminApp.patch("/admin/domains/:id", async (c) => {
  const actor = requireAuthUser(c);
  const domainId = c.req.param("id");
  const payload = await readJsonBody<Record<string, unknown>>(c);
  
  const type = payload.type ? String(payload.type) : undefined;
  const status = payload.status ? String(payload.status) : undefined;
  
  const updates: string[] = [];
  const bindings: unknown[] = [];
  
  if (type) {
    updates.push("type = ?");
    bindings.push(type);
  }
  if (status) {
    updates.push("status = ?");
    bindings.push(status);
  }
  
  if (updates.length === 0) {
    throw new AppRouteError(400, "VALIDATION_ERROR", "No valid fields to update.");
  }
  
  updates.push("updated_at = ?");
  bindings.push(new Date().toISOString());
  bindings.push(domainId);
  
  await c.env.DB.prepare(
    `UPDATE domains SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();
  
  const domain = await c.env.DB.prepare("SELECT * FROM domains WHERE id = ?")
    .bind(domainId)
    .first<Record<string, unknown>>();
  
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.domain.updated",
    targetType: "domain",
    targetId: domainId,
    metadata: domain ?? null,
  });
  
  return c.json({ domain });
});

adminApp.delete("/admin/domains/:id", async (c) => {
  const actor = requireAuthUser(c);
  const domainId = c.req.param("id");
  
  // 检查是否有邮箱使用该域名
  const mailboxCount = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM mailboxes WHERE domain_id = ?"
  ).bind(domainId).first<{ total: number | string }>();
  
  if (Number(mailboxCount?.total ?? 0) > 0) {
    throw new AppRouteError(400, "VALIDATION_ERROR", "Cannot delete domain with active mailboxes.");
  }
  
  // 获取域名信息用于清理 Cloudflare
  const domainRecord = await c.env.DB.prepare(
    "SELECT domain, zone_id, cloudflare_dns_record_id, cloudflare_rule_id FROM domains WHERE id = ?"
  ).bind(domainId).first<{ domain: string; zone_id: string | null; cloudflare_dns_record_id: string | null; cloudflare_rule_id: string | null }>();
  
  // 清理 Cloudflare 上的 DNS 记录和 Email Routing 规则
  let cfCleanup = { success: true, errors: [] as string[] };
  if (domainRecord) {
    cfCleanup = await cleanupDomainFromCloudflare(c.env, domainRecord);
  }
  
  // 删除数据库记录
  await c.env.DB.prepare("DELETE FROM user_domains WHERE domain_id = ?").bind(domainId).run();
  await c.env.DB.prepare("DELETE FROM cloudflare_integrations WHERE domain_id = ?").bind(domainId).run();
  await c.env.DB.prepare("DELETE FROM domains WHERE id = ?").bind(domainId).run();
  
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.domain.deleted",
    targetType: "domain",
    targetId: domainId,
    metadata: {
      domain: domainRecord?.domain ?? null,
      cloudflare_cleanup: cfCleanup,
    },
  });
  
  return c.json({ success: true, cloudflare_cleanup: cfCleanup });
});

adminApp.post("/admin/domains/:id/verify", async (c) => {
  const actor = requireAuthUser(c);
  const domain = await markDomainVerified(c.env, c.req.param("id"));

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.domain.verified",
    targetType: "domain",
    targetId: c.req.param("id"),
    metadata: domain ?? null,
  });

  return c.json({
    domain,
  });
});

adminApp.post("/admin/domains/:id/configure-cloudflare", async (c) => {
  const actor = requireAuthUser(c);
  try {
    const result = await configureDomainRuntime(c.env, c.req.param("id"));

    await writeAuditLog(c.env, {
      ...getAuditContext(c),
      actorUserId: actor.id,
      action: "admin.domain.cloudflare_configured",
      targetType: "domain",
      targetId: c.req.param("id"),
      metadata: result,
    });

    return c.json(result);
  } catch (error) {
    await writeAuditLog(c.env, {
      ...getAuditContext(c),
      actorUserId: actor.id,
      action: "admin.domain.cloudflare_configuration_failed",
      targetType: "domain",
      targetId: c.req.param("id"),
      metadata: {
        message: error instanceof Error ? error.message : "Unknown Cloudflare error.",
      },
    });
    throw error;
  }
});

adminApp.get("/admin/mailboxes", async (c) => {
  const pagination = parsePagination(c);

  const totalRow = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM mailboxes").first<{
    total: number | string;
  }>();

  const result = await c.env.DB.prepare(
    `
      SELECT
        m.id,
        m.email_address,
        m.local_part,
        m.status,
        m.expires_at,
        m.created_at,
        u.id AS user_id,
        u.email AS user_email,
        d.domain AS domain
      FROM mailboxes m
      INNER JOIN users u ON u.id = m.user_id
      INNER JOIN domains d ON d.id = m.domain_id
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(pagination.pageSize, pagination.offset)
    .all<Record<string, unknown>>();

  return c.json({
    mailboxes: result.results,
    pagination: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
  });
});

adminApp.get("/admin/api-tokens", async (c) => {
  const pagination = parsePagination(c);
  const { items, meta } = await listAllApiTokens(c.env, pagination);
  return c.json({
    tokens: items,
    pagination: meta,
  });
});

adminApp.post("/admin/api-tokens/:id/revoke", async (c) => {
  const actor = requireAuthUser(c);
  const tokenId = c.req.param("id");
  const revokedToken = await revokeApiToken(c.env, tokenId);

  if (!revokedToken) {
    throw new AppRouteError(404, "NOT_FOUND", "API token not found.");
  }

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.api_token.revoked",
    targetType: "api_token",
    targetId: tokenId,
  });

  return c.json({
    success: true,
  });
});

adminApp.get("/admin/messages", async (c) => {
  const pagination = parsePagination(c);

  const totalRow = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM messages").first<{
    total: number | string;
  }>();

  const result = await c.env.DB.prepare(
    `
      SELECT
        m.id,
        m.subject,
        m.from_address,
        m.to_address,
        m.size,
        m.received_at,
        mb.email_address,
        u.email AS owner_email
      FROM messages m
      INNER JOIN mailboxes mb ON mb.id = m.mailbox_id
      INNER JOIN users u ON u.id = mb.user_id
      ORDER BY m.received_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(pagination.pageSize, pagination.offset)
    .all<Record<string, unknown>>();

  return c.json({
    messages: result.results,
    pagination: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
  });
});

adminApp.get("/admin/audit-logs", async (c) => {
  const pagination = parsePagination(c, { defaultPageSize: 50 });

  const totalRow = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM audit_logs").first<{
    total: number | string;
  }>();

  const result = await c.env.DB.prepare(
    `
      SELECT id, actor_user_id, action, target_type, target_id, ip, user_agent, metadata_json, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(pagination.pageSize, pagination.offset)
    .all<Record<string, unknown>>();

  return c.json({
    audit_logs: result.results,
    pagination: buildPaginationMeta(Number(totalRow?.total ?? 0), pagination),
  });
});

adminApp.get("/admin/cloudflare/status", async (c) => {
  return c.json(await getCloudflareStatus(c.env));
});

adminApp.post("/admin/cloudflare/config", async (c) => {
  const actor = requireAuthUser(c);
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const apiToken = optionalString(payload.api_token);

  await setStoredCloudflareApiToken(c.env, apiToken);
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    actorUserId: actor.id,
    action: "admin.cloudflare.config.updated",
    targetType: "cloudflare_config",
    targetId: "api_token",
    metadata: {
      api_token_configured: Boolean(apiToken),
    },
  });

  return c.json({
    success: true,
    api_token_configured: Boolean(apiToken),
  });
});

export default adminApp;
