import { Hono } from "hono";

import { requireApiTokenId, requireAuthUser } from "../lib/auth";
import { getAuditContext, writeAuditLog } from "../lib/audit";
import { createMailbox, listMailboxMessages, listUserMailboxes } from "../lib/mailboxes";
import { readJsonBody } from "../lib/request";
import type { AppSchema } from "../types/app";

const externalApiApp = new Hono<AppSchema>();

externalApiApp.post("/api/v1/mailboxes", async (c) => {
  const user = requireAuthUser(c);
  const tokenId = requireApiTokenId(c);
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const mailbox = await createMailbox(c.env, c.req.url, user.id, payload, tokenId);

  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    action: "api.mailbox.created",
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

externalApiApp.get("/api/v1/mailboxes", async (c) => {
  const user = requireAuthUser(c);
  return c.json({
    mailboxes: await listUserMailboxes(c.env, c.req.url, user.id),
  });
});

externalApiApp.get("/api/v1/mailboxes/:id/messages", async (c) => {
  const user = requireAuthUser(c);
  return c.json({
    messages: await listMailboxMessages(c.env, user.id, c.req.param("id")),
  });
});

export default externalApiApp;
