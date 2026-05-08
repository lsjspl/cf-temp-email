import { Hono } from "hono";

import { countAdmins } from "../lib/auth";
import { jsonForScript, renderDocument } from "../lib/html";
import { AppRouteError } from "../lib/errors";
import { validateInboxAccessToken } from "../lib/inbox";
import type { AppSchema } from "../types/app";

const webApp = new Hono<AppSchema>();

function redirect(location: string, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
    },
  });
}

function loginPageHtml() {
  return renderDocument({
    title: "Temp Mail Login",
    body: `
      <div class="shell auth-shell">
        <section class="auth-card">
          <div class="auth-header">
            <h1>Temp Mail Console</h1>
            <p>Sessions, domains, mailboxes, and messages in one place.</p>
          </div>
          <div class="auth-body">
            <form id="login-form" class="field-grid">
              <div class="field">
                <label for="login">Email or username</label>
                <input id="login" name="login" class="input" autocomplete="username" />
              </div>
              <div class="field">
                <label for="password">Password</label>
                <input id="password" name="password" class="input" type="password" autocomplete="current-password" />
              </div>
              <div id="login-error" class="notice error hidden"></div>
              <div class="button-row">
                <button class="button primary" type="submit">Sign in</button>
              </div>
            </form>
          </div>
        </section>
      </div>
      <script>
        const form = document.getElementById("login-form");
        const errorNode = document.getElementById("login-error");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          errorNode.classList.add("hidden");
          const formData = new FormData(form);
          const payload = {
            login: formData.get("login"),
            password: formData.get("password"),
          };
          const response = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => null);
            errorNode.textContent = result?.error?.message ?? "Login failed";
            errorNode.classList.remove("hidden");
            return;
          }
          location.href = "/app";
        });
      </script>
    `,
  });
}

function setupPageHtml() {
  return renderDocument({
    title: "Initialize Temp Mail",
    body: `
      <div class="shell auth-shell">
        <section class="auth-card">
          <div class="auth-header">
            <h1>Initialize System</h1>
            <p>Create the first administrator. Setup closes after that.</p>
          </div>
          <div class="auth-body">
            <form id="setup-form" class="field-grid">
              <div class="field">
                <label for="email">Admin email</label>
                <input id="email" name="email" class="input" autocomplete="email" />
              </div>
              <div class="field">
                <label for="username">Username</label>
                <input id="username" name="username" class="input" autocomplete="username" />
              </div>
              <div class="field">
                <label for="password">Password</label>
                <input id="password" name="password" class="input" type="password" autocomplete="new-password" />
              </div>
              <div id="setup-error" class="notice error hidden"></div>
              <div class="button-row">
                <button class="button primary" type="submit">Initialize</button>
              </div>
            </form>
          </div>
        </section>
      </div>
      <script>
        const form = document.getElementById("setup-form");
        const errorNode = document.getElementById("setup-error");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          errorNode.classList.add("hidden");
          const formData = new FormData(form);
          const payload = {
            email: formData.get("email"),
            username: formData.get("username"),
            password: formData.get("password"),
          };
          const response = await fetch("/setup/initialize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => null);
            errorNode.textContent = result?.error?.message ?? "Initialization failed";
            errorNode.classList.remove("hidden");
            return;
          }
          location.href = "/app";
        });
      </script>
    `,
  });
}

function dashboardPageHtml(user: { email: string; role: string }) {
  const roleLabel = user.role === "admin" ? "Admin" : "User";

  return renderDocument({
    title: "Temp Mail Console",
    body: `
      <div class="shell">
        <header class="page-header">
          <div class="page-title">
            <h1>Temp Mail Console</h1>
            <p>${roleLabel} · ${user.email}</p>
          </div>
          <div class="button-row">
            <button id="refresh-all" class="button">Refresh</button>
            <button id="logout" class="button danger">Logout</button>
          </div>
        </header>
        <div class="dashboard-grid">
          <aside class="panel sidebar">
            <button class="nav-button active" data-panel="overview">Overview</button>
            <button class="nav-button" data-panel="mailboxes">Mailboxes</button>
            <button class="nav-button" data-panel="tokens">API Tokens</button>
            <button class="nav-button" data-panel="domains">Domains</button>
            <button class="nav-button ${user.role === "admin" ? "" : "hidden"}" data-panel="users">Users</button>
            <button class="nav-button ${user.role === "admin" ? "" : "hidden"}" data-panel="ops">Ops</button>
          </aside>
          <main class="content-column">
            <section id="panel-overview" class="panel">
              <div class="panel-header">
                <div>
                  <h2>Overview</h2>
                  <div class="meta">Current resource summary.</div>
                </div>
              </div>
              <div id="metrics" class="metric-grid"></div>
            </section>

            <section id="panel-mailboxes" class="panel hidden">
              <div class="panel-header">
                <div>
                  <h2>Mailboxes</h2>
                  <div class="meta">Create mailboxes and inspect recent messages.</div>
                </div>
              </div>
              <div class="split-grid">
                <form id="mailbox-form" class="field-grid">
                  <div class="field">
                    <label for="mailbox-domain">Domain</label>
                    <select id="mailbox-domain" class="select" name="domain_id"></select>
                  </div>
                  <div class="field">
                    <label for="mailbox-prefix">Prefix</label>
                    <input id="mailbox-prefix" class="input" name="prefix" />
                  </div>
                  <div class="field">
                    <label for="mailbox-ttl">TTL seconds</label>
                    <input id="mailbox-ttl" class="input" name="ttl_seconds" type="number" value="86400" />
                  </div>
                  <div id="mailbox-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">Create mailbox</button>
                  </div>
                </form>
                <div class="panel" style="padding:16px; background:rgba(255,255,255,0.025);">
                  <div class="panel-header">
                    <div>
                      <h3>Message Peek</h3>
                      <div class="meta">Read messages for the selected mailbox.</div>
                    </div>
                  </div>
                  <select id="mailbox-picker" class="select"></select>
                  <div id="mailbox-messages" class="table-wrap" style="margin-top:12px;"></div>
                </div>
              </div>
              <div id="mailbox-list" class="table-wrap" style="margin-top:16px;"></div>
            </section>

            <section id="panel-tokens" class="panel hidden">
              <div class="panel-header">
                <div>
                  <h2>API Tokens</h2>
                  <div class="meta">Token values are shown once.</div>
                </div>
              </div>
              <div class="split-grid">
                <form id="token-form" class="field-grid">
                  <div class="field">
                    <label for="token-name">Name</label>
                    <input id="token-name" class="input" name="name" />
                  </div>
                  <div id="token-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">Create token</button>
                  </div>
                </form>
                <div id="token-secret" class="notice hidden mono"></div>
              </div>
              <div id="token-list" class="table-wrap" style="margin-top:16px;"></div>
            </section>

            <section id="panel-domains" class="panel hidden">
              <div class="panel-header">
                <div>
                  <h2>Domains</h2>
                  <div class="meta">Assign active domains before mailbox creation.</div>
                </div>
              </div>
              <div class="split-grid ${user.role === "admin" ? "" : "hidden"}">
                <form id="domain-form" class="field-grid">
                  <div class="field">
                    <label for="domain-name">Domain</label>
                    <input id="domain-name" class="input" name="domain" />
                  </div>
                  <div class="field">
                    <label for="domain-type">Type</label>
                    <select id="domain-type" class="select" name="type">
                      <option value="subdomain">subdomain</option>
                      <option value="root">root</option>
                    </select>
                  </div>
                  <div class="field">
                    <label for="domain-status">Status</label>
                    <select id="domain-status" class="select" name="status">
                      <option value="pending">pending</option>
                      <option value="active">active</option>
                    </select>
                  </div>
                  <div id="domain-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">Add domain</button>
                  </div>
                </form>
                <form id="assign-form" class="field-grid">
                  <div class="field">
                    <label for="assign-user">User</label>
                    <select id="assign-user" class="select" name="user_id"></select>
                  </div>
                  <div class="field">
                    <label for="assign-domain">Domain</label>
                    <select id="assign-domain" class="select" name="domain_id"></select>
                  </div>
                  <div id="assign-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">Assign domain</button>
                  </div>
                </form>
              </div>
              <div id="domain-list" class="table-wrap" style="margin-top:16px;"></div>
            </section>

            <section id="panel-users" class="panel hidden ${user.role === "admin" ? "" : "hidden"}">
              <div class="panel-header">
                <div>
                  <h2>Users</h2>
                  <div class="meta">Create and manage system users.</div>
                </div>
              </div>
              <div class="split-grid">
                <form id="user-form" class="field-grid">
                  <div class="field">
                    <label for="user-email">Email</label>
                    <input id="user-email" class="input" name="email" />
                  </div>
                  <div class="field">
                    <label for="user-username">Username</label>
                    <input id="user-username" class="input" name="username" />
                  </div>
                  <div class="field">
                    <label for="user-password">Password</label>
                    <input id="user-password" class="input" name="password" type="password" />
                  </div>
                  <div class="field">
                    <label for="user-role">Role</label>
                    <select id="user-role" class="select" name="role">
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div id="user-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">Create user</button>
                  </div>
                </form>
                <div class="notice">
                  Status and deletion actions are available in the user table.
                </div>
              </div>
              <div id="user-list" class="table-wrap" style="margin-top:16px;"></div>
            </section>

            <section id="panel-ops" class="panel hidden ${user.role === "admin" ? "" : "hidden"}">
              <div class="panel-header">
                <div>
                  <h2>Operations</h2>
                  <div class="meta">Cloudflare status and audit visibility.</div>
                </div>
              </div>
              <div class="card-grid">
                <div class="metric">
                  <span class="meta">Cloudflare Runtime</span>
                  <strong id="cf-runtime-state">-</strong>
                </div>
                <div class="metric">
                  <span class="meta">All Mailboxes</span>
                  <strong id="ops-mailboxes">-</strong>
                </div>
                <div class="metric">
                  <span class="meta">All Messages</span>
                  <strong id="ops-messages">-</strong>
                </div>
              <div class="metric">
                <span class="meta">Audit Logs</span>
                <strong id="ops-audits">-</strong>
              </div>
              <div class="metric">
                <span class="meta">All Tokens</span>
                <strong id="ops-tokens">-</strong>
              </div>
            </div>
              <div id="ops-status" class="notice" style="margin-top:16px;"></div>
              <div id="admin-mailbox-list" class="table-wrap" style="margin-top:16px;"></div>
              <div id="admin-message-list" class="table-wrap" style="margin-top:16px;"></div>
              <div id="admin-token-list" class="table-wrap" style="margin-top:16px;"></div>
              <div id="audit-list" class="table-wrap" style="margin-top:16px;"></div>
            </section>
          </main>
        </div>
      </div>
      <script>
        const CURRENT_USER = ${jsonForScript(user)};
        const state = {
          users: [],
          domains: [],
          tokens: [],
          mailboxes: [],
          mailboxMessages: [],
          adminMailboxes: [],
          adminMessages: [],
          adminTokens: [],
          audits: [],
          cloudflareStatus: null,
        };

        const selectors = {
          metrics: document.getElementById("metrics"),
          mailboxList: document.getElementById("mailbox-list"),
          mailboxPicker: document.getElementById("mailbox-picker"),
          mailboxMessages: document.getElementById("mailbox-messages"),
          tokenList: document.getElementById("token-list"),
          tokenSecret: document.getElementById("token-secret"),
          domainList: document.getElementById("domain-list"),
          userList: document.getElementById("user-list"),
          adminMailboxList: document.getElementById("admin-mailbox-list"),
          adminMessageList: document.getElementById("admin-message-list"),
          adminTokenList: document.getElementById("admin-token-list"),
          auditList: document.getElementById("audit-list"),
          opsStatus: document.getElementById("ops-status"),
        };

        const forms = {
          mailbox: document.getElementById("mailbox-form"),
          token: document.getElementById("token-form"),
          domain: document.getElementById("domain-form"),
          assign: document.getElementById("assign-form"),
          user: document.getElementById("user-form"),
        };

        function escapeHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function tagClass(value) {
          if (["active", "ok", true, "admin"].includes(value)) return "good";
          if (["pending"].includes(value)) return "warn";
          if (["disabled", "failed", "revoked", false].includes(value)) return "bad";
          return "";
        }

        function formatTag(value) {
          return '<span class="tag ' + tagClass(value) + '">' + escapeHtml(value) + '</span>';
        }

        function showFeedback(id, message, kind = "ok") {
          const node = document.getElementById(id);
          if (!node) return;
          node.textContent = message;
          node.className = "notice " + (kind === "error" ? "error" : "ok");
        }

        function clearFeedback(id) {
          const node = document.getElementById(id);
          if (!node) return;
          node.className = "notice hidden";
          node.textContent = "";
        }

        async function request(path, options = {}) {
          const response = await fetch(path, options);
          const isJson = response.headers.get("content-type")?.includes("application/json");
          const result = isJson ? await response.json() : null;
          if (!response.ok) {
            const error = new Error(result?.error?.message || "Request failed");
            error.payload = result;
            throw error;
          }
          return result;
        }

        function renderTable(headers, rows) {
          return '<table><thead><tr>' +
            headers.map((item) => '<th>' + escapeHtml(item) + '</th>').join("") +
            '</tr></thead><tbody>' +
            (rows.length
              ? rows.map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join("") + '</tr>').join("")
              : '<tr><td colspan="' + headers.length + '"><span class="muted">No data</span></td></tr>') +
            '</tbody></table>';
        }

        function renderMetrics() {
          const cards = CURRENT_USER.role === "admin"
            ? [
                { label: "Users", value: state.users.length },
                { label: "Domains", value: state.domains.length },
                { label: "All Mailboxes", value: state.adminMailboxes.length },
                { label: "All Messages", value: state.adminMessages.length },
              ]
            : [
                { label: "My Domains", value: state.domains.length },
                { label: "My Tokens", value: state.tokens.length },
                { label: "My Mailboxes", value: state.mailboxes.length },
                { label: "Mailbox Messages", value: state.mailboxMessages.length },
              ];

          selectors.metrics.innerHTML = cards.map((item) =>
            '<div class="metric"><span class="meta">' + escapeHtml(item.label) + '</span><strong>' + item.value + '</strong></div>'
          ).join("");
        }

        function renderMailboxes() {
          selectors.mailboxList.innerHTML = renderTable(
            ["Email", "Status", "Expires", "Access Link"],
            state.mailboxes.map((item) => [
              '<span class="mono">' + escapeHtml(item.email_address) + '</span>',
              formatTag(item.status),
              escapeHtml(item.expires_at),
              item.encrypted_access_url
                ? '<a class="mono" href="' + item.encrypted_access_url + '" target="_blank" rel="noreferrer">open</a>'
                : "-",
            ]),
          );

          document.getElementById("mailbox-domain").innerHTML = state.domains.map((domain) =>
            '<option value="' + escapeHtml(domain.id) + '">' + escapeHtml(domain.domain) + '</option>'
          ).join("");

          selectors.mailboxPicker.innerHTML = '<option value="">Select mailbox</option>' + state.mailboxes.map((item) =>
            '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.email_address) + '</option>'
          ).join("");
        }

        function renderTokenList() {
          selectors.tokenList.innerHTML = renderTable(
            ["Name", "Prefix", "Status", "Last Used", ""],
            state.tokens.map((item) => [
              escapeHtml(item.name),
              '<span class="mono">' + escapeHtml(item.token_prefix) + '</span>',
              formatTag(item.status),
              escapeHtml(item.last_used_at || "-"),
              '<button class="button danger" data-revoke-token="' + escapeHtml(item.id) + '">Revoke</button>',
            ]),
          );
        }

        function renderDomainList() {
          selectors.domainList.innerHTML = renderTable(
            ["Domain", "Type", "Status", "Assigned", "Actions"],
            state.domains.map((item) => [
              '<span class="mono">' + escapeHtml(item.domain) + '</span>',
              escapeHtml(item.type),
              formatTag(item.status),
              String(item.assigned_user_count ?? 0),
              CURRENT_USER.role === "admin"
                ? '<div class="button-row">' +
                    '<button class="button" data-verify-domain="' + escapeHtml(item.id) + '">Mark active</button>' +
                    '<button class="button" data-configure-domain="' + escapeHtml(item.id) + '">Configure CF</button>' +
                  '</div>'
                : "-",
            ]),
          );

          const assignDomain = document.getElementById("assign-domain");
          if (assignDomain) {
            assignDomain.innerHTML = state.domains
              .filter((item) => item.status === "active")
              .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.domain) + '</option>')
              .join("");
          }
        }

        function renderUsers() {
          const assignUser = document.getElementById("assign-user");
          if (assignUser) {
            assignUser.innerHTML = state.users
              .map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.email) + '</option>')
              .join("");
          }

          selectors.userList.innerHTML = renderTable(
            ["Email", "Role", "Status", "Last Login", "Actions"],
            state.users.map((item) => [
              escapeHtml(item.email),
              formatTag(item.role),
              formatTag(item.status),
              escapeHtml(item.last_login_at || "-"),
              '<div class="button-row">' +
                '<button class="button" data-toggle-user="' + escapeHtml(item.id) + '" data-next-status="' + escapeHtml(item.status === "active" ? "disabled" : "active") + '">' + escapeHtml(item.status === "active" ? "Disable" : "Enable") + '</button>' +
                '<button class="button danger" data-delete-user="' + escapeHtml(item.id) + '">Delete</button>' +
              '</div>',
            ]),
          );
        }

        function renderMailboxMessages() {
          selectors.mailboxMessages.innerHTML = renderTable(
            ["From", "Subject", "Received", "Size", "Attachments"],
            state.mailboxMessages.map((item) => [
              escapeHtml(item.from_address || "-"),
              escapeHtml(item.subject || "(no subject)"),
              escapeHtml(item.received_at),
              escapeHtml(String(item.size ?? 0)),
              String(item.attachment_count || 0),
            ]),
          );
        }

        function renderOps() {
          const runtime = state.cloudflareStatus?.runtime || null;
          const integration = state.cloudflareStatus?.integration || null;
          document.getElementById("cf-runtime-state").textContent =
            runtime?.has_api_token ? "ready" : "incomplete";
          document.getElementById("ops-mailboxes").textContent = String(state.adminMailboxes.length);
          document.getElementById("ops-messages").textContent = String(state.adminMessages.length);
          document.getElementById("ops-audits").textContent = String(state.audits.length);
          document.getElementById("ops-tokens").textContent = String(state.adminTokens.length);
          selectors.opsStatus.innerHTML = runtime
            ? '<div><strong>Runtime</strong> ' +
                [
                  ["API token", runtime.has_api_token ? "ready" : "missing"],
                  ["Account", runtime.account_id_configured ? "configured" : "missing"],
                  ["Zone ID", runtime.zone_id_configured ? "configured" : "missing"],
                  ["Zone name", runtime.zone_name || "missing"],
                  ["Worker", runtime.email_worker_name || "cf-temp-email"],
                ].map((item) =>
                  '<span class="tag ' + tagClass(item[1] === "missing" ? "failed" : item[1]) + '">' +
                    escapeHtml(item[0] + ": " + item[1]) +
                  '</span>'
                ).join(" ") +
              '</div>' +
              '<div style="margin-top:10px;"><strong>Last integration</strong> ' +
                (integration
                  ? [
                      formatTag(integration.status || "unknown"),
                      escapeHtml("domain " + (integration.domain_id || "-")),
                      escapeHtml("zone " + (integration.zone_name || "-")),
                      escapeHtml("updated " + (integration.updated_at || "-")),
                    ].join(" ")
                  : '<span class="muted">No Cloudflare integration attempts yet.</span>') +
              '</div>' +
              (integration?.last_error
                ? '<div class="mono" style="margin-top:10px;">' + escapeHtml(integration.last_error) + '</div>'
                : "") +
              (integration?.details_json
                ? '<div class="mono" style="margin-top:10px;">' + escapeHtml(integration.details_json) + '</div>'
                : "")
            : "Cloudflare status unavailable";
          selectors.adminMailboxList.innerHTML = renderTable(
            ["Mailbox", "Owner", "Domain", "Status", "Expires"],
            state.adminMailboxes.map((item) => [
              '<span class="mono">' + escapeHtml(item.email_address) + '</span>',
              escapeHtml(item.user_email || "-"),
              escapeHtml(item.domain || "-"),
              formatTag(item.status),
              escapeHtml(item.expires_at || "-"),
            ]),
          );
          selectors.adminMessageList.innerHTML = renderTable(
            ["To", "From", "Subject", "Received", "Size", "Owner"],
            state.adminMessages.map((item) => [
              '<span class="mono">' + escapeHtml(item.to_address || "-") + '</span>',
              escapeHtml(item.from_address || "-"),
              escapeHtml(item.subject || "(no subject)"),
              escapeHtml(item.received_at || "-"),
              escapeHtml(String(item.size ?? 0)),
              escapeHtml(item.owner_email || "-"),
            ]),
          );
          selectors.adminTokenList.innerHTML = renderTable(
            ["User", "Name", "Prefix", "Status", "Last Used", "Revoked", "Action"],
            state.adminTokens.map((item) => [
              escapeHtml(item.user_email || "-"),
              escapeHtml(item.name),
              '<span class="mono">' + escapeHtml(item.token_prefix) + '</span>',
              formatTag(item.status),
              escapeHtml(item.last_used_at || "-"),
              escapeHtml(item.revoked_at || "-"),
              item.status === "revoked"
                ? '<span class="muted">Revoked</span>'
                : '<button class="button danger" data-admin-revoke-token="' + escapeHtml(item.id) + '">Revoke</button>',
            ]),
          );
          selectors.auditList.innerHTML = renderTable(
            ["Time", "Action", "Actor", "Target", "Metadata"],
            state.audits.map((item) => [
              escapeHtml(item.created_at),
              escapeHtml(item.action),
              escapeHtml(item.actor_user_id || "-"),
              escapeHtml([item.target_type, item.target_id].filter(Boolean).join(": ") || "-"),
              '<span class="mono">' + escapeHtml(item.metadata_json || "-") + '</span>',
            ]),
          );
        }

        async function loadMailboxMessages(mailboxId) {
          if (!mailboxId) {
            state.mailboxMessages = [];
            renderMailboxMessages();
            return;
          }
          const result = await request("/user/mailboxes/" + mailboxId + "/messages");
          state.mailboxMessages = result.messages;
          renderMailboxMessages();
        }

        async function loadData() {
          const [domains, tokens, mailboxes] = await Promise.all([
            request("/user/domains"),
            request("/user/api-tokens"),
            request("/user/mailboxes"),
          ]);
          state.domains = domains.domains;
          state.tokens = tokens.tokens;
          state.mailboxes = mailboxes.mailboxes;

          if (CURRENT_USER.role === "admin") {
            const [users, adminMailboxes, adminMessages, adminTokens, audits, cloudflareStatus] = await Promise.all([
              request("/admin/users"),
              request("/admin/mailboxes"),
              request("/admin/messages"),
              request("/admin/api-tokens"),
              request("/admin/audit-logs"),
              request("/admin/cloudflare/status"),
            ]);
            state.users = users.users;
            state.adminMailboxes = adminMailboxes.mailboxes;
            state.adminMessages = adminMessages.messages;
            state.adminTokens = adminTokens.tokens;
            state.audits = audits.audit_logs;
            state.cloudflareStatus = cloudflareStatus;
          }

          renderMetrics();
          renderMailboxes();
          renderTokenList();
          renderDomainList();
          renderUsers();
          renderOps();
          await loadMailboxMessages(state.mailboxes[0]?.id || "");
        }

        document.querySelectorAll(".nav-button").forEach((button) => {
          button.addEventListener("click", () => {
            document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            const panel = button.getAttribute("data-panel");
            document.querySelectorAll("main > section").forEach((section) => section.classList.add("hidden"));
            document.getElementById("panel-" + panel).classList.remove("hidden");
          });
        });

        document.getElementById("refresh-all").addEventListener("click", () => {
          loadData().catch((error) => alert(error.message));
        });

        document.getElementById("logout").addEventListener("click", async () => {
          await request("/auth/logout", { method: "POST" });
          location.href = "/login";
        });

        selectors.mailboxPicker.addEventListener("change", (event) => {
          loadMailboxMessages(event.target.value).catch((error) => alert(error.message));
        });

        selectors.tokenList.addEventListener("click", async (event) => {
          const target = event.target.closest("[data-revoke-token]");
          if (!target) return;
          await request("/user/api-tokens/" + target.getAttribute("data-revoke-token"), { method: "DELETE" });
          await loadData();
        });

        selectors.adminTokenList?.addEventListener("click", async (event) => {
          const target = event.target.closest("[data-admin-revoke-token]");
          if (!target) return;
          await request("/admin/api-tokens/" + target.getAttribute("data-admin-revoke-token") + "/revoke", {
            method: "POST",
          });
          await loadData();
        });

        selectors.domainList.addEventListener("click", async (event) => {
          const verifyTarget = event.target.closest("[data-verify-domain]");
          if (verifyTarget) {
            await request("/admin/domains/" + verifyTarget.getAttribute("data-verify-domain") + "/verify", { method: "POST" });
            await loadData();
            return;
          }

          const configureTarget = event.target.closest("[data-configure-domain]");
          if (configureTarget) {
            try {
              const result = await request(
                "/admin/domains/" + configureTarget.getAttribute("data-configure-domain") + "/configure-cloudflare",
                { method: "POST" },
              );
              showFeedback("domain-feedback", "Cloudflare configured");
              selectors.opsStatus.innerHTML = '<span class="mono">' + escapeHtml(JSON.stringify(result.cloudflare)) + '</span>';
            } catch (error) {
              const steps = error.payload?.manual_steps;
              showFeedback(
                "domain-feedback",
                steps?.length ? error.message + " " + steps.join(" ") : error.message,
                "error",
              );
            }
            await loadData();
          }
        });

        selectors.userList.addEventListener("click", async (event) => {
          const toggle = event.target.closest("[data-toggle-user]");
          if (toggle) {
            await request("/admin/users/" + toggle.getAttribute("data-toggle-user"), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: toggle.getAttribute("data-next-status") }),
            });
            await loadData();
            return;
          }

          const remove = event.target.closest("[data-delete-user]");
          if (remove) {
            await request("/admin/users/" + remove.getAttribute("data-delete-user"), { method: "DELETE" });
            await loadData();
          }
        });

        forms.mailbox?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("mailbox-feedback");
          const formData = new FormData(forms.mailbox);
          try {
            const result = await request("/user/mailboxes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                domain_id: formData.get("domain_id"),
                prefix: formData.get("prefix"),
                ttl_seconds: Number(formData.get("ttl_seconds") || 86400),
              }),
            });
            showFeedback("mailbox-feedback", result.email_address + " created");
            forms.mailbox.reset();
            await loadData();
          } catch (error) {
            showFeedback("mailbox-feedback", error.message, "error");
          }
        });

        forms.token?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("token-feedback");
          selectors.tokenSecret.classList.add("hidden");
          const formData = new FormData(forms.token);
          try {
            const result = await request("/user/api-tokens", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: formData.get("name") }),
            });
            selectors.tokenSecret.textContent = result.value;
            selectors.tokenSecret.className = "notice ok mono";
            showFeedback("token-feedback", "Token created");
            forms.token.reset();
            await loadData();
          } catch (error) {
            showFeedback("token-feedback", error.message, "error");
          }
        });

        forms.domain?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("domain-feedback");
          const formData = new FormData(forms.domain);
          try {
            await request("/admin/domains", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                domain: formData.get("domain"),
                type: formData.get("type"),
                status: formData.get("status"),
              }),
            });
            showFeedback("domain-feedback", "Domain created");
            forms.domain.reset();
            await loadData();
          } catch (error) {
            showFeedback("domain-feedback", error.message, "error");
          }
        });

        forms.assign?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("assign-feedback");
          const formData = new FormData(forms.assign);
          try {
            await request("/admin/users/" + formData.get("user_id") + "/domains", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domain_id: formData.get("domain_id") }),
            });
            showFeedback("assign-feedback", "Domain assigned");
            await loadData();
          } catch (error) {
            showFeedback("assign-feedback", error.message, "error");
          }
        });

        forms.user?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("user-feedback");
          const formData = new FormData(forms.user);
          try {
            await request("/admin/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: formData.get("email"),
                username: formData.get("username"),
                password: formData.get("password"),
                role: formData.get("role"),
              }),
            });
            showFeedback("user-feedback", "User created");
            forms.user.reset();
            await loadData();
          } catch (error) {
            showFeedback("user-feedback", error.message, "error");
          }
        });

        loadData().catch((error) => alert(error.message));
      </script>
    `,
  });
}

function inboxStatePageHtml(title: string, message: string) {
  return renderDocument({
    title,
    body: `
      <div class="inbox-shell">
        <section class="panel" style="max-width:640px; margin:48px auto;">
          <div class="panel-header">
            <div>
              <h1>${title}</h1>
              <div class="meta">${message}</div>
            </div>
          </div>
        </section>
      </div>
    `,
  });
}

function inboxPageHtml(mailbox: Record<string, unknown>, token: string) {
  const emailAddress = String(mailbox.email_address ?? "");
  const expiresAt = String(mailbox.expires_at ?? "");

  return renderDocument({
    title: `Inbox ${emailAddress}`,
    body: `
      <div class="inbox-shell">
        <header class="page-header">
          <div class="page-title">
            <h1>${emailAddress}</h1>
            <p>Expires · ${expiresAt}</p>
          </div>
          <div class="button-row">
            <button id="refresh-inbox" class="button">Refresh</button>
          </div>
        </header>
        <div id="inbox-error" class="notice error hidden"></div>
        <div class="inbox-layout">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>Messages</h2>
                <div class="meta">Auto refresh every 30 seconds.</div>
              </div>
            </div>
            <div id="message-list" class="message-list"></div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 id="message-subject">No message selected</h2>
                <div id="message-meta" class="meta"></div>
              </div>
            </div>
            <div id="message-view" class="message-body">
              <div class="notice">Waiting for mail.</div>
            </div>
          </section>
        </div>
      </div>
      <script>
        const INBOX_TOKEN = ${jsonForScript(token)};
        let currentMessageId = null;

        function escapeHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function showInboxError(message) {
          const node = document.getElementById("inbox-error");
          node.textContent = message;
          node.classList.remove("hidden");
        }

        function clearInboxError() {
          const node = document.getElementById("inbox-error");
          node.textContent = "";
          node.classList.add("hidden");
        }

        async function request(path) {
          const response = await fetch(path);
          const result = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(result?.error?.message || "Request failed");
          }
          return result;
        }

        function renderList(messages) {
          const node = document.getElementById("message-list");
          if (!messages.length) {
            node.innerHTML = '<div class="notice">No messages yet.</div>';
            return;
          }

          node.innerHTML = messages.map((item) =>
            '<button class="message-item ' + (item.id === currentMessageId ? 'active' : '') + '" data-message-id="' + escapeHtml(item.id) + '">' +
              '<div><strong>' + escapeHtml(item.subject || "(no subject)") + '</strong></div>' +
              '<div class="meta">' + escapeHtml(item.from_address || "-") + '</div>' +
              '<div class="meta">' + escapeHtml(item.received_at) + ' · ' + escapeHtml(item.size || 0) + ' bytes · ' + escapeHtml(item.attachment_count) + ' attachments</div>' +
            '</button>'
          ).join("");
        }

        function renderMessage(result) {
          document.getElementById("message-subject").textContent = result.message.subject || "(no subject)";
          document.getElementById("message-meta").textContent =
            (result.message.from_address || "-") + " -> " + result.message.to_address + " · " + result.message.received_at;

          const htmlBlock = result.message.html_body
            ? '<iframe class="mail-html" sandbox srcdoc="' + String(result.message.html_body).replace(/"/g, "&quot;") + '"></iframe>'
            : "";
          const textBlock = result.message.text_body
            ? '<pre class="notice" style="white-space:pre-wrap; margin:0;">' + escapeHtml(result.message.text_body) + '</pre>'
            : "";
          const attachments = result.message.attachments?.length
            ? '<div class="attachments">' + result.message.attachments.map((item) =>
                '<a class="attachment-link mono" href="/inbox/' + encodeURIComponent(INBOX_TOKEN) + '/attachments/' + encodeURIComponent(item.id) + '">' +
                  escapeHtml(item.filename || item.id) +
                '</a>'
              ).join("") + '</div>'
            : '<div class="notice">No attachments</div>';

          document.getElementById("message-view").innerHTML =
            '<div class="panel" style="padding:14px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid rgba(255,255,255,0.06);">' +
              '<div class="meta">Raw size · ' + escapeHtml(result.message.size || 0) + ' bytes</div>' +
            '</div>' +
            textBlock +
            htmlBlock +
            attachments;
        }

        async function loadMessages() {
          clearInboxError();
          const result = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages");
          const messages = result.messages || [];
          renderList(messages);
          if (!currentMessageId && messages.length) {
            currentMessageId = messages[0].id;
          }
          if (currentMessageId) {
            const detail = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages/" + currentMessageId);
            renderMessage(detail);
            renderList(messages);
          }
        }

        document.getElementById("message-list").addEventListener("click", async (event) => {
          const button = event.target.closest("[data-message-id]");
          if (!button) return;
          currentMessageId = button.getAttribute("data-message-id");
          const detail = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages/" + currentMessageId);
          renderMessage(detail);
          const result = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages");
          renderList(result.messages || []);
        });

        document.getElementById("refresh-inbox").addEventListener("click", () => {
          loadMessages().catch((error) => showInboxError(error.message));
        });

        setInterval(() => {
          loadMessages().catch(() => {});
        }, 30000);

        loadMessages().catch((error) => showInboxError(error.message));
      </script>
    `,
  });
}

webApp.get("/", async (c) => {
  const user = c.get("authUser");
  const adminCount = await countAdmins(c.env);

  if (adminCount === 0) {
    return redirect("/setup");
  }

  if (user) {
    return redirect("/app");
  }

  return redirect("/login");
});

webApp.get("/login", async (c) => {
  if (c.get("authUser")) {
    return redirect("/app");
  }
  return c.html(loginPageHtml());
});

webApp.get("/setup", async (c) => {
  const adminCount = await countAdmins(c.env);
  if (adminCount > 0) {
    return redirect(c.get("authUser") ? "/app" : "/login");
  }
  return c.html(setupPageHtml());
});

webApp.get("/app", async (c) => {
  const user = c.get("authUser");
  if (!user) {
    return redirect("/login");
  }
  return c.html(dashboardPageHtml(user));
});

webApp.get("/inbox/:encryptedToken", async (c) => {
  const encryptedToken = c.req.param("encryptedToken");
  try {
    const { mailbox } = await validateInboxAccessToken(c.env, encryptedToken, {
      ip: c.get("requestIp") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    });
    return c.html(inboxPageHtml(mailbox, encryptedToken));
  } catch (error) {
    if (!(error instanceof AppRouteError)) {
      throw error;
    }

    const title =
      error.code === "MAILBOX_EXPIRED"
        ? "Inbox expired"
        : error.code === "NOT_FOUND"
          ? "Inbox unavailable"
          : "Inbox access failed";
    return c.html(inboxStatePageHtml(title, error.message), error.status);
  }
});

export default webApp;
