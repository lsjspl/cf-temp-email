import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, promises as fs, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, "..");
const port = 8791 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const devVarsPath = path.join(cwd, ".dev.vars");
const smokeLogPath = path.join(cwd, "smoke-run.log");
const smokeStatePath = path.join(
  cwd,
  ".wrangler-smoke-state",
  `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
);
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function randomSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStep(message) {
  const line = `[smoke] ${message}`;
  console.log(line);
  appendFileSync(smokeLogPath, `${line}\n`, "utf8");
}

function parseCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const [cookiePart] = setCookieHeader.split(";");
  return cookiePart;
}

function sanitizeHtmlPreview(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/<link\b([^>]*?)rel\s*=\s*["']?(?:preload|prefetch)["']?([^>]*)>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, "");
}

async function runSql(sql, filename) {
  await fs.mkdir(smokeStatePath, { recursive: true });
  const sqlPath = path.join(smokeStatePath, filename);
  await fs.writeFile(sqlPath, `${sql}\n`, "utf8");
  return runCommand(npxCommand, [
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    smokeStatePath,
    "--file",
    sqlPath,
  ]);
}

async function stopChildProcess(child) {
  if (!child?.pid) {
    return;
  }

  if (process.platform === "win32") {
    await runCommand("taskkill", ["/pid", String(child.pid), "/t", "/f"]).catch(() => {});
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5000),
  ]);
}

async function writeDevVars() {
  const existing = await fs.readFile(devVarsPath, "utf8").catch(() => null);
  await fs.writeFile(
    devVarsPath,
    [
      "CLOUDFLARE_API_TOKEN=",
      "CLOUDFLARE_EMAIL_WORKER_NAME=cf-temp-email",
      "",
    ].join("\n"),
    "utf8",
  );
  return existing;
}

async function restoreDevVars(previous) {
  if (previous === null) {
    await fs.rm(devVarsPath, { force: true });
    return;
  }
  await fs.writeFile(devVarsPath, previous, "utf8");
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      ...options,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed\n${stdout}\n${stderr}`));
    });
  });
}

async function startDevServer() {
  const child = spawn(
    npxCommand,
    [
      "wrangler",
      "dev",
      "--port",
      String(port),
      "--persist-to",
      smokeStatePath,
      "--test-scheduled",
    ],
    {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    },
  );

  let combined = "";
  child.stdout.on("data", (chunk) => {
    combined += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    combined += chunk.toString();
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev exited early with code ${child.exitCode}\n${combined}`);
    }

    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status > 0) {
        return child;
      }
    } catch {
      // Keep polling until Wrangler starts accepting requests.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for wrangler dev\n${combined}`);
}

async function request(pathname, options = {}, jar, ip = "198.51.100.10") {
  const headers = new Headers(options.headers ?? {});
  headers.set("CF-Connecting-IP", ip);
  if (jar.cookie) {
    headers.set("Cookie", jar.cookie);
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    ...options,
    headers,
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    jar.cookie = parseCookie(setCookie);
  }
  return response;
}

async function requestJson(pathname, options, jar, ip) {
  const response = await request(pathname, options, jar, ip);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

async function main() {
  writeFileSync(smokeLogPath, "", "utf8");
  const previousDevVars = await writeDevVars();
  let server;

  try {
    logStep(`apply local migrations in ${smokeStatePath}`);
    await runCommand(npxCommand, [
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--persist-to",
      smokeStatePath,
    ]);
    logStep(`start wrangler dev on ${baseUrl}`);
    server = await startDevServer();

    const suffix = randomSuffix();
    const adminJar = {};
    const userJar = {};
    const adminEmail = `admin-${suffix}@example.com`;
    const adminPassword = "AdminPass123!";
    const userEmail = `user-${suffix}@example.com`;
    const userPassword = "UserPass123!";
    const domainName = `tmp-${suffix}.example.com`;

    logStep("initialize first admin");
    let result = await requestJson(
      "/setup/initialize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail,
          username: `admin_${suffix}`,
          password: adminPassword,
        }),
      },
      adminJar,
      "198.51.100.11",
    );
    assert.equal(result.response.status, 200);

    logStep("create and manage admin users");
    result = await requestJson(
      "/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          username: `user_${suffix}`,
          password: userPassword,
          role: "user",
        }),
      },
      adminJar,
      "198.51.100.11",
    );
    assert.equal(result.response.status, 201);
    const userId = result.body.user.id;

    logStep("create and assign domain");
    result = await requestJson(
      "/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `delete-${suffix}@example.com`,
          username: `delete_${suffix}`,
          password: "DeletePass123!",
          role: "user",
        }),
      },
      adminJar,
      "198.51.100.11",
    );
    const deleteUserId = result.body.user.id;

    result = await requestJson(
      `/admin/users/${deleteUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      },
      adminJar,
      "198.51.100.11",
    );
    assert.equal(result.response.status, 200);

    result = await requestJson(
      `/admin/users/${deleteUserId}`,
      { method: "DELETE" },
      adminJar,
      "198.51.100.11",
    );
    assert.equal(result.response.status, 200);

    result = await requestJson(
      "/admin/domains",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domainName,
          type: "subdomain",
          status: "active",
        }),
      },
      adminJar,
      "198.51.100.11",
    );
    assert.equal(result.response.status, 201);
    const domainId = result.body.domain.id;

    result = await requestJson(
      `/admin/users/${userId}/domains`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain_id: domainId }),
      },
      adminJar,
      "198.51.100.11",
    );
    assert.equal(result.response.status, 200);

    logStep("exercise login rate limit");
    for (let attempt = 0; attempt < 6; attempt += 1) {
      result = await requestJson(
        "/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            login: userEmail,
            password: "WrongPassword123!",
          }),
        },
        {},
        "198.51.100.12",
      );
    }
    assert.equal(result.response.status, 429);
    assert.equal(result.body.error.code, "RATE_LIMITED");

    logStep("create session and API tokens");
    result = await requestJson(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: userEmail,
          password: userPassword,
        }),
      },
      userJar,
      "198.51.100.13",
    );
    assert.equal(result.response.status, 200);

    result = await requestJson(
      "/user/api-tokens",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "primary-token" }),
      },
      userJar,
      "198.51.100.13",
    );
    const primaryToken = result.body.value;

    result = await requestJson(
      "/user/api-tokens",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "secondary-token" }),
      },
      userJar,
      "198.51.100.13",
    );
    const secondaryToken = result.body.value;
    const secondaryTokenId = result.body.token.id;

    result = await requestJson(
      "/user/api-tokens",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "revoked-token" }),
      },
      userJar,
      "198.51.100.13",
    );
    const revokedTokenId = result.body.token.id;

    result = await requestJson(
      `/user/api-tokens/${revokedTokenId}`,
      { method: "DELETE" },
      userJar,
      "198.51.100.13",
    );
    assert.equal(result.response.status, 200);

    logStep("exercise API token rate limit");
    let lastMailbox = null;
    for (let index = 0; index < 121; index += 1) {
      result = await requestJson(
        "/api/v1/mailboxes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${primaryToken}`,
          },
          body: JSON.stringify({
            domain_id: domainId,
            prefix: `load${suffix}${index}`,
            ttl_seconds: 3600,
          }),
        },
        {},
        "198.51.100.14",
      );
      if (index < 120) {
        assert.equal(result.response.status, 201);
        lastMailbox = result.body;
      }
    }
    assert.equal(result.response.status, 429);
    assert.equal(result.body.error.code, "RATE_LIMITED");
    assert.ok(lastMailbox);

    result = await requestJson(
      "/api/v1/mailboxes",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secondaryToken}`,
        },
      },
      {},
      "198.51.100.15",
    );
    assert.equal(result.response.status, 200);

    const encryptedToken = new URL(lastMailbox.encrypted_access_url).pathname.split("/").pop();
    assert.ok(encryptedToken);

    logStep("insert partial message fixture");
    await runSql(
      [
        "INSERT INTO messages (id, mailbox_id, from_address, to_address, subject, text_r2_key, html_r2_key, raw_r2_key, size, received_at, expires_at, created_at)",
        `VALUES ('msg_partial_${suffix}', '${lastMailbox.id}', 'sender@example.com', '${lastMailbox.email_address}', 'Partial body', 'missing-text', 'missing-html', 'raw/${lastMailbox.id}/msg_partial_${suffix}.eml', 64, datetime('now'), datetime('now', '+1 hour'), datetime('now'));`,
      ].join(" "),
      `fixture-message-${suffix}.sql`,
    );

    result = await requestJson(
      `/inbox/${encryptedToken}/messages/msg_partial_${suffix}`,
      { method: "GET" },
      {},
      "198.51.100.16",
    );
    assert.equal(result.response.status, 200);
    assert.equal(result.body.message.text_body, null);
    assert.equal(result.body.message.html_body, null);

    let htmlResponse = await request(`/inbox/not-a-real-link-${suffix}`, { method: "GET" }, {}, "198.51.100.21");
    assert.equal(htmlResponse.status, 404);
    assert.ok((htmlResponse.headers.get("content-type") || "").includes("text/html"));
    assert.ok((await htmlResponse.text()).includes("Inbox unavailable"));

    logStep("exercise inbox rate limit");
    for (let index = 0; index < 121; index += 1) {
      result = await requestJson(
        `/inbox/${encryptedToken}/messages`,
        { method: "GET" },
        {},
        "198.51.100.17",
      );
      if (index < 120) {
        assert.equal(result.response.status, 200);
      }
    }
    assert.equal(result.response.status, 429);
    assert.equal(result.body.error.code, "RATE_LIMITED");

    logStep("verify Cloudflare failure path and admin token revoke");
    result = await requestJson(
      `/inbox/${encryptedToken}/attachments/att_missing`,
      { method: "GET" },
      {},
      "198.51.100.18",
    );
    assert.equal(result.response.status, 404);

    result = await requestJson(
      `/admin/domains/${domainId}/configure-cloudflare`,
      { method: "POST" },
      adminJar,
      "198.51.100.11",
    );
    assert.equal(result.response.status, 503);
    assert.equal(result.body.error.code, "CLOUDFLARE_NOT_CONFIGURED");
    assert.ok(Array.isArray(result.body.manual_steps));

    result = await requestJson(
      `/admin/api-tokens/${secondaryTokenId}/revoke`,
      { method: "POST" },
      adminJar,
      "198.51.100.11",
    );
    assert.equal(result.response.status, 200);

    logStep("insert expired mailbox and trigger scheduled cleanup");
    await runSql(
      [
        "INSERT INTO mailboxes (id, user_id, domain_id, email_address, local_part, status, access_secret_hash, created_by_token_id, expires_at, created_at)",
        `VALUES ('mb_expired_${suffix}', '${userId}', '${domainId}', 'expired-${suffix}@${domainName}', 'expired-${suffix}', 'expired', 'hash', NULL, datetime('now', '-2 hour'), datetime('now', '-2 hour'));`,
      ].join(" "),
      `fixture-mailbox-${suffix}.sql`,
    );

    let scheduledResponse = await request("/__scheduled", { method: "GET" }, {}, "198.51.100.19");
    assert.equal(scheduledResponse.status, 200);

    logStep("verify audit log and admin visibility endpoints");
    result = await requestJson("/admin/audit-logs", { method: "GET" }, adminJar, "198.51.100.11");
    assert.equal(result.response.status, 200);
    const actions = new Set(result.body.audit_logs.map((item) => item.action));
    assert.ok(actions.has("admin.user.created"));
    assert.ok(actions.has("admin.user.updated"));
    assert.ok(actions.has("admin.user.deleted"));
    assert.ok(actions.has("user.api_token.created"));
    assert.ok(actions.has("user.api_token.revoked"));
    assert.ok(actions.has("admin.api_token.revoked"));
    assert.ok(actions.has("admin.domain.cloudflare_configuration_failed"));
    assert.ok(actions.has("system.cleanup.completed"));
    assert.ok(actions.has("auth.login.failed"));

    result = await requestJson("/admin/api-tokens", { method: "GET" }, adminJar, "198.51.100.11");
    assert.equal(result.response.status, 200);
    assert.ok(result.body.tokens.length >= 2);

    result = await requestJson("/admin/cloudflare/status", { method: "GET" }, adminJar, "198.51.100.11");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.integration.status, "failed");
    assert.ok(result.body.integration.last_error);

    const secretRows = await runSql(
      "SELECT key, value FROM system_settings WHERE key IN ('system:secret:session', 'system:secret:link') ORDER BY key;",
      `verify-secrets-${suffix}.sql`,
    );
    assert.ok(secretRows.stdout.includes("system:secret:link"));
    assert.ok(secretRows.stdout.includes("system:secret:session"));

    const sanitized = sanitizeHtmlPreview(
      '<div onclick="evil()"><script>alert(1)</script><a href="javascript:alert(1)">x</a><form>bad</form><p>ok</p></div>',
    );
    assert.ok(!sanitized.includes("<script"));
    assert.ok(!sanitized.includes("onclick="));
    assert.ok(!sanitized.includes("javascript:"));
    assert.ok(sanitized.includes("<p>ok</p>"));

    logStep("Smoke tests passed.");
  } finally {
    if (server) {
      await stopChildProcess(server);
    }
    await fs.rm(smokeStatePath, { recursive: true, force: true }).catch(() => {});
    await restoreDevVars(previousDevVars);
  }
}

main().catch((error) => {
  console.error(error);
  appendFileSync(smokeLogPath, `${error?.stack ?? String(error)}\n`, "utf8");
  process.exitCode = 1;
});
