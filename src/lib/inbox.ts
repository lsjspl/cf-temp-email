import { decryptJsonToken } from "./crypto";
import { AppRouteError } from "./errors";
import { sanitizeHtmlPreview } from "./mail-sanitize";
import { writeAuditLog } from "./audit";
import type { AppEnv } from "../types/env";

interface InboxTokenPayload {
  mailboxId: string;
  expiresAt: string;
}

interface InboxAuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

export async function validateInboxAccessToken(
  env: AppEnv,
  encryptedToken: string,
  auditContext?: InboxAuditContext,
) {
  const storedLink = await env.DB.prepare(
    `
      SELECT id, mailbox_id, expires_at
      FROM mailbox_access_links
      WHERE id = ?
      LIMIT 1
    `,
  )
    .bind(encryptedToken)
    .first<{ id: string; mailbox_id: string; expires_at: string }>();

  if (!storedLink) {
    if (auditContext) {
      await writeAuditLog(env, {
        action: "inbox.access.rejected",
        targetType: "mailbox_access_link",
        targetId: encryptedToken,
        ip: auditContext.ip ?? null,
        userAgent: auditContext.userAgent ?? null,
        metadata: {
          reason: "link_not_found",
        },
      });
    }
    throw new AppRouteError(404, "NOT_FOUND", "Inbox link not found.");
  }

  let payload: InboxTokenPayload;
  try {
    payload = await decryptJsonToken<InboxTokenPayload>(encryptedToken, env.LINK_SECRET);
  } catch {
    if (auditContext) {
      await writeAuditLog(env, {
        action: "inbox.access.rejected",
        targetType: "mailbox_access_link",
        targetId: encryptedToken,
        ip: auditContext.ip ?? null,
        userAgent: auditContext.userAgent ?? null,
        metadata: {
          reason: "token_invalid",
        },
      });
    }
    throw new AppRouteError(401, "UNAUTHORIZED", "Inbox link is invalid.");
  }

  if (payload.mailboxId !== storedLink.mailbox_id) {
    if (auditContext) {
      await writeAuditLog(env, {
        action: "inbox.access.rejected",
        targetType: "mailbox_access_link",
        targetId: encryptedToken,
        ip: auditContext.ip ?? null,
        userAgent: auditContext.userAgent ?? null,
        metadata: {
          reason: "mailbox_mismatch",
        },
      });
    }
    throw new AppRouteError(401, "UNAUTHORIZED", "Inbox link is invalid.");
  }

  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    if (auditContext) {
      await writeAuditLog(env, {
        action: "inbox.access.rejected",
        targetType: "mailbox_access_link",
        targetId: encryptedToken,
        ip: auditContext.ip ?? null,
        userAgent: auditContext.userAgent ?? null,
        metadata: {
          reason: "token_expired",
        },
      });
    }
    throw new AppRouteError(410, "MAILBOX_EXPIRED", "Inbox link has expired.");
  }

  const mailbox = await env.DB.prepare(
    `
      SELECT id, email_address, status, expires_at, created_at
      FROM mailboxes
      WHERE id = ?
      LIMIT 1
    `,
  )
    .bind(storedLink.mailbox_id)
    .first<Record<string, unknown>>();

  if (!mailbox) {
    throw new AppRouteError(404, "NOT_FOUND", "Mailbox not found.");
  }

  await env.DB.prepare("UPDATE mailbox_access_links SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), encryptedToken)
    .run();

  return {
    mailbox,
    mailboxId: storedLink.mailbox_id,
  };
}

export async function listInboxMessages(env: AppEnv, mailboxId: string) {
  const result = await env.DB.prepare(
    `
      SELECT
        m.id,
        m.from_address,
        m.to_address,
        m.subject,
        m.size,
        m.received_at,
        m.expires_at,
        COUNT(a.id) AS attachment_count
      FROM messages m
      LEFT JOIN message_attachments a ON a.message_id = m.id
      WHERE m.mailbox_id = ?
      GROUP BY m.id
      ORDER BY m.received_at DESC
    `,
  )
    .bind(mailboxId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    ...row,
    attachment_count: Number(row.attachment_count ?? 0),
  }));
}

export async function getInboxMessage(env: AppEnv, mailboxId: string, messageId: string) {
  const message = await env.DB.prepare(
    `
      SELECT
        id,
        mailbox_id,
        from_address,
        to_address,
        subject,
        text_r2_key,
        html_r2_key,
        raw_r2_key,
        size,
        received_at,
        expires_at,
        created_at
      FROM messages
      WHERE id = ? AND mailbox_id = ?
      LIMIT 1
    `,
  )
    .bind(messageId, mailboxId)
    .first<Record<string, unknown>>();

  if (!message) {
    throw new AppRouteError(404, "NOT_FOUND", "Message not found.");
  }

  const attachments = await env.DB.prepare(
    `
      SELECT id, filename, content_type, size, r2_key, created_at
      FROM message_attachments
      WHERE message_id = ?
      ORDER BY created_at ASC
    `,
  )
    .bind(messageId)
    .all<Record<string, unknown>>();

  const textBody =
    typeof message.text_r2_key === "string"
      ? await env.MAIL_R2.get(message.text_r2_key).then((object) => object?.text() ?? null)
      : null;
  const htmlBody =
    typeof message.html_r2_key === "string"
      ? await env.MAIL_R2.get(message.html_r2_key).then((object) => object?.text() ?? null)
      : null;

  return {
    ...message,
    text_body: textBody,
    html_body: htmlBody ? sanitizeHtmlPreview(htmlBody) : null,
    attachments: attachments.results,
  };
}

export async function getInboxAttachment(
  env: AppEnv,
  mailboxId: string,
  attachmentId: string,
) {
  const attachment = await env.DB.prepare(
    `
      SELECT
        a.id,
        a.filename,
        a.content_type,
        a.size,
        a.r2_key
      FROM message_attachments a
      INNER JOIN messages m ON m.id = a.message_id
      WHERE a.id = ? AND m.mailbox_id = ?
      LIMIT 1
    `,
  )
    .bind(attachmentId, mailboxId)
    .first<{
      id: string;
      filename: string | null;
      content_type: string | null;
      size: number | null;
      r2_key: string;
    }>();

  if (!attachment) {
    throw new AppRouteError(404, "NOT_FOUND", "Attachment not found.");
  }

  const object = await env.MAIL_R2.get(attachment.r2_key);
  if (!object) {
    throw new AppRouteError(404, "NOT_FOUND", "Attachment object not found.");
  }

  return {
    attachment,
    object,
  };
}
