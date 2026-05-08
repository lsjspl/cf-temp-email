import { Hono } from "hono";

import { countAdmins, createSession, initializeAdmin } from "../lib/auth";
import { getAuditContext, writeAuditLog } from "../lib/audit";
import { readJsonBody } from "../lib/request";
import type { AppSchema } from "../types/app";

const setupApp = new Hono<AppSchema>();

setupApp.get("/setup/status", async (c) => {
  const adminCount = await countAdmins(c.env);
  return c.json({
    requires_setup: adminCount === 0,
  });
});

setupApp.post("/setup/initialize", async (c) => {
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const admin = await initializeAdmin(c.env, payload);
  await createSession(c, admin);
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    action: "setup.initial_admin.created",
    targetType: "user",
    targetId: admin.id,
    metadata: {
      email: admin.email,
      role: admin.role,
    },
  });

  return c.json({
    user: admin,
  });
});

export default setupApp;
