import PostalMime from "postal-mime";

import { writeAuditLog } from "./audit";
import { generateId } from "./crypto";
import type { AppEnv } from "../types/env";

interface ParsedAddress {
  address?: string;
  name?: string;
}

function r2MessageKeys(mailboxId: string, messageId: string) {
  return {
    raw: `raw/${mailboxId}/${messageId}.eml`,
    text: `text/${mailboxId}/${messageId}.txt`,
    html: `html/${mailboxId}/${messageId}.html`,
  };
}

function toAddressString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "address" in value) {
    return ((value as ParsedAddress).address ?? null) || null;
  }

  return null;
}

function toAttachmentBody(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  return new Uint8Array();
}

async function readRawEmail(message: ForwardableEmailMessage): Promise<Uint8Array> {
  return new Uint8Array(await new Response(message.raw).arrayBuffer());
}

export async function processInboundEmail(
  env: AppEnv,
  message: ForwardableEmailMessage,
): Promise<void> {
  const mailbox = await env.DB.prepare(
    `
      SELECT id, email_address, expires_at, status
      FROM mailboxes
      WHERE email_address = ?
      LIMIT 1
    `,
  )
    .bind(message.to.toLowerCase())
    .first<{ id: string; email_address: string; expires_at: string; status: string }>();

  if (!mailbox || mailbox.status !== "active") {
    await writeAuditLog(env, {
      action: "email.inbound.rejected",
      targetType: "mailbox",
      targetId: message.to.toLowerCase(),
      metadata: {
        reason: "mailbox_not_found",
        to_address: message.to,
        from_address: message.from,
      },
    });
    message.setReject("Mailbox not found.");
    return;
  }

  if (new Date(mailbox.expires_at).getTime() <= Date.now()) {
    await writeAuditLog(env, {
      action: "email.inbound.rejected",
      targetType: "mailbox",
      targetId: mailbox.id,
      metadata: {
        reason: "mailbox_expired",
        to_address: message.to,
        from_address: message.from,
      },
    });
    message.setReject("Mailbox has expired.");
    return;
  }

  const rawBuffer = await readRawEmail(message);
  const parsed = await new PostalMime().parse(rawBuffer);
  const messageId = generateId("msg");
  const expiresAt = mailbox.expires_at;
  const createdAt = new Date().toISOString();
  const keys = r2MessageKeys(mailbox.id, messageId);

  await env.MAIL_R2.put(keys.raw, rawBuffer, {
    httpMetadata: {
      contentType: "message/rfc822",
    },
  });

  if (parsed.text) {
    await env.MAIL_R2.put(keys.text, parsed.text, {
      httpMetadata: {
        contentType: "text/plain; charset=utf-8",
      },
    });
  }

  if (parsed.html) {
    await env.MAIL_R2.put(keys.html, parsed.html, {
      httpMetadata: {
        contentType: "text/html; charset=utf-8",
      },
    });
  }

  await env.DB.prepare(
    `
      INSERT INTO messages (
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
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      messageId,
      mailbox.id,
      toAddressString(parsed.from) ?? message.from,
      message.to,
      parsed.subject ?? null,
      parsed.text ? keys.text : null,
      parsed.html ? keys.html : null,
      keys.raw,
      rawBuffer.byteLength,
      createdAt,
      expiresAt,
      createdAt,
    )
    .run();

  for (const attachment of parsed.attachments ?? []) {
    const attachmentId = generateId("att");
    const safeFilename = attachment.filename || `${attachmentId}.bin`;
    const r2Key = `attachments/${mailbox.id}/${messageId}/${attachmentId}/${safeFilename}`;

    await env.MAIL_R2.put(r2Key, toAttachmentBody(attachment.content), {
      httpMetadata: {
        contentType: attachment.mimeType || "application/octet-stream",
      },
    });

    await env.DB.prepare(
      `
        INSERT INTO message_attachments (
          id,
          message_id,
          filename,
          content_type,
          size,
          r2_key,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        attachmentId,
        messageId,
        attachment.filename ?? null,
        attachment.mimeType ?? "application/octet-stream",
        attachment.content ? toAttachmentBody(attachment.content).byteLength : 0,
        r2Key,
        createdAt,
      )
      .run();
  }

  await env.MAIL_KV.put(
    `inbox:latest:${mailbox.id}`,
    JSON.stringify({
      message_id: messageId,
      subject: parsed.subject ?? null,
      received_at: createdAt,
    }),
    { expirationTtl: 60 * 60 * 24 },
  );

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM messages WHERE mailbox_id = ?",
  )
    .bind(mailbox.id)
    .first<{ total: number | string }>();

  await env.MAIL_KV.put(`inbox:count:${mailbox.id}`, String(Number(countRow?.total ?? 0)), {
    expirationTtl: 60 * 60 * 24,
  });

  await writeAuditLog(env, {
    action: "email.inbound.accepted",
    targetType: "message",
    targetId: messageId,
    metadata: {
      mailbox_id: mailbox.id,
      to_address: message.to,
      from_address: message.from,
      subject: parsed.subject ?? null,
      attachment_count: parsed.attachments?.length ?? 0,
    },
  });
}
