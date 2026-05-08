import type { AppEnv } from "../types/env";
import { writeAuditLog } from "./audit";

interface ExpiredMessageRow {
  id: string;
  mailbox_id: string;
  raw_r2_key: string;
  text_r2_key: string | null;
  html_r2_key: string | null;
}

interface ExpiredAttachmentRow {
  id: string;
  message_id: string;
  r2_key: string;
}

interface ExpiredMailboxRow {
  id: string;
}

async function deleteR2Keys(env: AppEnv, keys: Array<string | null | undefined>) {
  for (const key of keys) {
    if (!key) {
      continue;
    }
    await env.MAIL_R2.delete(key);
  }
}

export async function runCleanup(env: AppEnv): Promise<{
  deleted_mailboxes: number;
  deleted_messages: number;
  deleted_links: number;
}> {
  const now = new Date().toISOString();

  const expiredMessages = await env.DB.prepare(
    `
      SELECT id, mailbox_id, raw_r2_key, text_r2_key, html_r2_key
      FROM messages
      WHERE expires_at <= ?
    `,
  )
    .bind(now)
    .all<ExpiredMessageRow>();

  for (const message of expiredMessages.results) {
    const attachments = await env.DB.prepare(
      `
        SELECT id, message_id, r2_key
        FROM message_attachments
        WHERE message_id = ?
      `,
    )
      .bind(message.id)
      .all<ExpiredAttachmentRow>();

    await deleteR2Keys(env, [
      message.raw_r2_key,
      message.text_r2_key,
      message.html_r2_key,
      ...attachments.results.map((attachment) => attachment.r2_key),
    ]);

    await env.DB.prepare("DELETE FROM message_attachments WHERE message_id = ?")
      .bind(message.id)
      .run();
    await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(message.id).run();
    await env.MAIL_KV.delete(`inbox:latest:${message.mailbox_id}`);
  }

  const expiredLinks = await env.DB.prepare(
    `
      SELECT id, mailbox_id
      FROM mailbox_access_links
      WHERE expires_at <= ?
    `,
  )
    .bind(now)
    .all<{ id: string; mailbox_id: string }>();

  for (const link of expiredLinks.results) {
    await env.DB.prepare("DELETE FROM mailbox_access_links WHERE id = ?").bind(link.id).run();
  }

  const expiredMailboxes = await env.DB.prepare(
    `
      SELECT id
      FROM mailboxes
      WHERE expires_at <= ?
    `,
  )
    .bind(now)
    .all<ExpiredMailboxRow>();

  for (const mailbox of expiredMailboxes.results) {
    await env.MAIL_KV.delete(`inbox:latest:${mailbox.id}`);
    await env.MAIL_KV.delete(`inbox:count:${mailbox.id}`);
    await env.DB.prepare("DELETE FROM mailbox_access_links WHERE mailbox_id = ?")
      .bind(mailbox.id)
      .run();
    await env.DB.prepare("DELETE FROM mailboxes WHERE id = ?").bind(mailbox.id).run();
  }

  return {
    deleted_mailboxes: expiredMailboxes.results.length,
    deleted_messages: expiredMessages.results.length,
    deleted_links: expiredLinks.results.length,
  };
}
