import { Hono } from "hono";

import { authenticateLogin, countAdmins, createSession, destroySession, getAuthUser } from "../lib/auth";
import { getAuditContext, writeAuditLog } from "../lib/audit";
import { AppRouteError } from "../lib/errors";
import { readJsonBody, requireString } from "../lib/request";
import type { AppSchema } from "../types/app";

const authApp = new Hono<AppSchema>();

authApp.post("/auth/login", async (c) => {
  const payload = await readJsonBody<Record<string, unknown>>(c);
  const login = requireString(payload.login ?? payload.email ?? payload.username, "login");
  const password = requireString(payload.password, "password");
  let user;
  try {
    user = await authenticateLogin(c.env, login, password);
  } catch (error) {
    const routeError =
      error instanceof AppRouteError ? error : new AppRouteError(500, "INTERNAL_ERROR", "Login failed.");
    await writeAuditLog(c.env, {
      ...getAuditContext(c),
      action: "auth.login.failed",
      targetType: "auth",
      targetId: login,
      metadata: {
        login,
        error_code: routeError.code,
      },
    });
    throw error;
  }

  await createSession(c, user);
  await writeAuditLog(c.env, {
    ...getAuditContext(c),
    action: "auth.login.succeeded",
    targetType: "user",
    targetId: user.id,
    metadata: {
      login,
    },
  });

  return c.json({
    user,
  });
});

authApp.post("/auth/logout", async (c) => {
  const authContext = getAuditContext(c);
  await destroySession(c);
  await writeAuditLog(c.env, {
    ...authContext,
    action: "auth.logout",
    targetType: "session",
    targetId: authContext.sessionId,
  });
  return c.json({
    success: true,
  });
});

authApp.get("/auth/me", async (c) => {
  const adminCount = await countAdmins(c.env);
  return c.json({
    user: getAuthUser(c) ?? null,
    requires_setup: adminCount === 0,
  });
});

export default authApp;
