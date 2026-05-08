import { Hono } from "hono";

import { countAdmins } from "../lib/auth";
import { AppRouteError } from "../lib/errors";
import { jsonForScript, renderDocument } from "../lib/html";
import { translateErrorMessage, type Locale } from "../lib/i18n";
import { validateInboxAccessToken } from "../lib/inbox";
import { getUi, languageSwitcher } from "../lib/web-i18n";
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

function loginPageHtml(locale: Locale) {
  const ui = getUi(locale);
  return renderDocument({
    title: ui.login.title,
    lang: locale,
    body: `
      <div class="shell auth-shell">
        <section class="auth-card">
          ${languageSwitcher("/login", locale)}
          <div class="auth-header">
            <h1>${ui.login.heading}</h1>
            <p>${ui.login.subtitle}</p>
          </div>
          <div class="auth-body">
            <form id="login-form" class="field-grid">
              <div class="field">
                <label for="login">${ui.login.login}</label>
                <input id="login" name="login" class="input" autocomplete="username" />
              </div>
              <div class="field">
                <label for="password">${ui.login.password}</label>
                <input id="password" name="password" class="input" type="password" autocomplete="current-password" />
              </div>
              <div id="login-error" class="notice error hidden"></div>
              <div class="button-row">
                <button class="button primary" type="submit">${ui.login.submit}</button>
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
            errorNode.textContent = result?.error?.message ?? ${jsonForScript(ui.login.failed)};
            errorNode.classList.remove("hidden");
            return;
          }
          location.href = "/app";
        });
      </script>
    `,
  });
}

function setupPageHtml(locale: Locale) {
  const ui = getUi(locale);
  return renderDocument({
    title: ui.setup.title,
    lang: locale,
    body: `
      <div class="shell auth-shell">
        <section class="auth-card">
          ${languageSwitcher("/setup", locale)}
          <div class="auth-header">
            <h1>${ui.setup.heading}</h1>
            <p>${ui.setup.subtitle}</p>
          </div>
          <div class="auth-body">
            <form id="setup-form" class="field-grid">
              <div class="field">
                <label for="email">${ui.setup.email}</label>
                <input id="email" name="email" class="input" autocomplete="email" />
              </div>
              <div class="field">
                <label for="username">${ui.setup.username}</label>
                <input id="username" name="username" class="input" autocomplete="username" />
              </div>
              <div class="field">
                <label for="password">${ui.setup.password}</label>
                <input id="password" name="password" class="input" type="password" autocomplete="new-password" />
              </div>
              <div id="setup-error" class="notice error hidden"></div>
              <div class="button-row">
                <button class="button primary" type="submit">${ui.setup.submit}</button>
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
            errorNode.textContent = result?.error?.message ?? ${jsonForScript(ui.setup.failed)};
            errorNode.classList.remove("hidden");
            return;
          }
          const result = await response.json().catch(() => null);
          location.href = result?.next_path || "/app";
        });
      </script>
    `,
  });
}

function dashboardPageHtml(user: { email: string; role: string }, locale: Locale) {
  const ui = getUi(locale);
  const roleLabel = user.role === "admin" ? ui.dashboard.admin : ui.dashboard.user;

  return renderDocument({
    title: ui.dashboard.title,
    lang: locale,
    body: `
      <div class="shell">
        <header class="page-header">
          <div class="page-title">
            <h1>${ui.dashboard.title}</h1>
            <p>${roleLabel} / ${user.email}</p>
          </div>
          <div class="button-row">
            <a class="button" href="/app?lang=zh-CN">中文</a>
            <a class="button" href="/app?lang=en">English</a>
            <button id="refresh-all" class="button">${ui.common.refresh}</button>
            <button id="logout" class="button danger">${ui.common.logout}</button>
          </div>
        </header>
        <div class="dashboard-grid">
          <aside class="panel sidebar">
            <button class="nav-button active" data-panel="overview">${ui.dashboard.overview}</button>
            <button class="nav-button" data-panel="mailboxes">${ui.dashboard.mailboxes}</button>
            <button class="nav-button" data-panel="tokens">${ui.dashboard.tokens}</button>
            <button class="nav-button" data-panel="domains">${ui.dashboard.domains}</button>
            <button class="nav-button ${user.role === "admin" ? "" : "hidden"}" data-panel="users">${ui.dashboard.users}</button>
            <button class="nav-button ${user.role === "admin" ? "" : "hidden"}" data-panel="ops">${ui.dashboard.ops}</button>
          </aside>
          <main class="content-column">
            <section id="panel-overview" class="panel">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.overview}</h2>
                  <div class="meta">${ui.dashboard.currentSummary}</div>
                </div>
              </div>
              <div id="metrics" class="metric-grid"></div>
            </section>

            <section id="panel-mailboxes" class="panel hidden">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.mailboxesTitle}</h2>
                  <div class="meta">${ui.dashboard.mailboxesSubtitle}</div>
                </div>
              </div>
              <div class="split-grid">
                <form id="mailbox-form" class="field-grid">
                  <div class="field">
                    <label for="mailbox-domain">${ui.dashboard.domain}</label>
                    <select id="mailbox-domain" class="select" name="domain_id"></select>
                  </div>
                  <div class="field">
                    <label for="mailbox-prefix">${ui.dashboard.prefix}</label>
                    <input id="mailbox-prefix" class="input" name="prefix" />
                  </div>
                  <div class="field">
                    <label for="mailbox-ttl">${ui.dashboard.ttlSeconds}</label>
                    <input id="mailbox-ttl" class="input" name="ttl_seconds" type="number" value="86400" />
                  </div>
                  <div id="mailbox-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">${ui.dashboard.createMailbox}</button>
                  </div>
                </form>
                <div class="panel" style="padding:16px; background:rgba(255,255,255,0.025);">
                  <div class="panel-header">
                    <div>
                      <h3>${ui.dashboard.messagePeek}</h3>
                      <div class="meta">${ui.dashboard.messagePeekSubtitle}</div>
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
                  <h2>${ui.dashboard.tokensTitle}</h2>
                  <div class="meta">${ui.dashboard.tokensSubtitle}</div>
                </div>
              </div>
              <div class="split-grid">
                <form id="token-form" class="field-grid">
                  <div class="field">
                    <label for="token-name">${ui.dashboard.name}</label>
                    <input id="token-name" class="input" name="name" />
                  </div>
                  <div id="token-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">${ui.dashboard.createToken}</button>
                  </div>
                </form>
                <div id="token-secret" class="notice hidden mono"></div>
              </div>
              <div id="token-list" class="table-wrap" style="margin-top:16px;"></div>
            </section>

            <section id="panel-domains" class="panel hidden">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.domainsTitle}</h2>
                  <div class="meta">${ui.dashboard.domainsSubtitle}</div>
                </div>
              </div>
              <div class="split-grid ${user.role === "admin" ? "" : "hidden"}">
                <form id="domain-form" class="field-grid">
                  <div class="field">
                    <label for="domain-name">${ui.dashboard.domain}</label>
                    <input id="domain-name" class="input" name="domain" />
                  </div>
                  <div class="field">
                    <label for="domain-type">${ui.dashboard.type}</label>
                    <select id="domain-type" class="select" name="type">
                      <option value="subdomain">${ui.dashboard.statusLabels.subdomain}</option>
                      <option value="root">${ui.dashboard.statusLabels.root}</option>
                    </select>
                  </div>
                  <div class="field">
                    <label for="domain-status">${ui.dashboard.status}</label>
                    <select id="domain-status" class="select" name="status">
                      <option value="pending">${ui.dashboard.statusLabels.pending}</option>
                      <option value="active">${ui.dashboard.statusLabels.active}</option>
                    </select>
                  </div>
                  <div id="domain-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">${ui.dashboard.addDomain}</button>
                  </div>
                </form>
                <form id="assign-form" class="field-grid">
                  <div class="field">
                    <label for="assign-user">${ui.dashboard.assignUser}</label>
                    <select id="assign-user" class="select" name="user_id"></select>
                  </div>
                  <div class="field">
                    <label for="assign-domain">${ui.dashboard.assignDomain}</label>
                    <select id="assign-domain" class="select" name="domain_id"></select>
                  </div>
                  <div id="assign-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">${ui.dashboard.assignDomainAction}</button>
                  </div>
                </form>
              </div>
              <div id="domain-list" class="table-wrap" style="margin-top:16px;"></div>
            </section>

            <section id="panel-users" class="panel hidden ${user.role === "admin" ? "" : "hidden"}">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.usersTitle}</h2>
                  <div class="meta">${ui.dashboard.usersSubtitle}</div>
                </div>
              </div>
              <div class="split-grid">
                <form id="user-form" class="field-grid">
                  <div class="field">
                    <label for="user-email">${ui.dashboard.email}</label>
                    <input id="user-email" class="input" name="email" />
                  </div>
                  <div class="field">
                    <label for="user-username">${ui.dashboard.username}</label>
                    <input id="user-username" class="input" name="username" />
                  </div>
                  <div class="field">
                    <label for="user-password">${ui.dashboard.password}</label>
                    <input id="user-password" class="input" name="password" type="password" />
                  </div>
                  <div class="field">
                    <label for="user-role">${ui.dashboard.role}</label>
                    <select id="user-role" class="select" name="role">
                      <option value="user">${ui.dashboard.statusLabels.user}</option>
                      <option value="admin">${ui.dashboard.statusLabels.admin}</option>
                    </select>
                  </div>
                  <div id="user-feedback" class="notice hidden"></div>
                  <div class="button-row">
                    <button class="button primary" type="submit">${ui.dashboard.createUser}</button>
                  </div>
                </form>
                <div class="notice">${ui.dashboard.userActionsHint}</div>
              </div>
              <div id="user-list" class="table-wrap" style="margin-top:16px;"></div>
            </section>

            <section id="panel-ops" class="panel hidden ${user.role === "admin" ? "" : "hidden"}">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.ops}</h2>
                  <div class="meta">${ui.dashboard.operationsSubtitle}</div>
                </div>
              </div>
              <div class="card-grid">
                <div class="metric">
                  <span class="meta">${ui.dashboard.cloudflareRuntime}</span>
                  <strong id="cf-runtime-state">-</strong>
                </div>
                <div class="metric">
                  <span class="meta">${ui.dashboard.allMailboxes}</span>
                  <strong id="ops-mailboxes">-</strong>
                </div>
                <div class="metric">
                  <span class="meta">${ui.dashboard.allMessages}</span>
                  <strong id="ops-messages">-</strong>
                </div>
                <div class="metric">
                  <span class="meta">${ui.dashboard.auditLogs}</span>
                  <strong id="ops-audits">-</strong>
                </div>
                <div class="metric">
                  <span class="meta">${ui.dashboard.allTokens}</span>
                  <strong id="ops-tokens">-</strong>
                </div>
              </div>
              <form id="cloudflare-config-form" class="field-grid" style="margin-top:16px;">
                <div class="field">
                  <label for="cloudflare-api-token">${ui.dashboard.cloudflareToken}</label>
                  <input id="cloudflare-api-token" class="input" name="api_token" type="password" autocomplete="off" />
                </div>
                <div id="cloudflare-feedback" class="notice hidden"></div>
                <div class="button-row">
                  <button class="button primary" type="submit">${ui.dashboard.saveToken}</button>
                  <button id="cloudflare-clear" class="button" type="button">${ui.dashboard.clearToken}</button>
                </div>
              </form>
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
        const UI = ${jsonForScript(ui)};
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
          cloudflareConfig: document.getElementById("cloudflare-config-form"),
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
          if (["active", "ok", true, "admin", "ready"].includes(value)) return "good";
          if (["pending"].includes(value)) return "warn";
          if (["disabled", "failed", "revoked", false, "missing", "incomplete"].includes(value)) return "bad";
          return "";
        }

        function translateLabel(value) {
          const key = String(value ?? "");
          return UI.dashboard.statusLabels[key] || key;
        }

        function formatTag(value) {
          return '<span class="tag ' + tagClass(value) + '">' + escapeHtml(translateLabel(value)) + '</span>';
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
            const error = new Error(result?.error?.message || UI.common.requestFailed);
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
              : '<tr><td colspan="' + headers.length + '"><span class="muted">' + escapeHtml(UI.common.noData) + '</span></td></tr>') +
            '</tbody></table>';
        }

        function renderMetrics() {
          const cards = CURRENT_USER.role === "admin"
            ? [
                { label: UI.dashboard.metricUsers, value: state.users.length },
                { label: UI.dashboard.metricDomains, value: state.domains.length },
                { label: UI.dashboard.allMailboxes, value: state.adminMailboxes.length },
                { label: UI.dashboard.allMessages, value: state.adminMessages.length },
              ]
            : [
                { label: UI.dashboard.metricMyDomains, value: state.domains.length },
                { label: UI.dashboard.metricMyTokens, value: state.tokens.length },
                { label: UI.dashboard.metricMyMailboxes, value: state.mailboxes.length },
                { label: UI.dashboard.metricMailboxMessages, value: state.mailboxMessages.length },
              ];

          selectors.metrics.innerHTML = cards.map((item) =>
            '<div class="metric"><span class="meta">' + escapeHtml(item.label) + '</span><strong>' + item.value + '</strong></div>'
          ).join("");
        }

        function renderMailboxes() {
          selectors.mailboxList.innerHTML = renderTable(
            [UI.dashboard.email, UI.dashboard.status, UI.inbox.expires, UI.dashboard.accessLink],
            state.mailboxes.map((item) => [
              '<span class="mono">' + escapeHtml(item.email_address) + '</span>',
              formatTag(item.status),
              escapeHtml(item.expires_at),
              item.encrypted_access_url
                ? '<a class="mono" href="' + item.encrypted_access_url + '" target="_blank" rel="noreferrer">' + escapeHtml(UI.common.open) + '</a>'
                : "-",
            ]),
          );

          document.getElementById("mailbox-domain").innerHTML = state.domains.map((domain) =>
            '<option value="' + escapeHtml(domain.id) + '">' + escapeHtml(domain.domain) + '</option>'
          ).join("");

          selectors.mailboxPicker.innerHTML =
            '<option value="">' + escapeHtml(UI.common.selectMailbox) + '</option>' +
            state.mailboxes.map((item) =>
              '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.email_address) + '</option>'
            ).join("");
        }

        function renderTokenList() {
          selectors.tokenList.innerHTML = renderTable(
            [UI.dashboard.name, UI.dashboard.prefix, UI.dashboard.status, UI.dashboard.lastUsed, UI.dashboard.actions],
            state.tokens.map((item) => [
              escapeHtml(item.name),
              '<span class="mono">' + escapeHtml(item.token_prefix) + '</span>',
              formatTag(item.status),
              escapeHtml(item.last_used_at || "-"),
              '<button class="button danger" data-revoke-token="' + escapeHtml(item.id) + '">' + escapeHtml(UI.dashboard.revoke) + '</button>',
            ]),
          );
        }

        function renderDomainList() {
          selectors.domainList.innerHTML = renderTable(
            [UI.dashboard.domain, UI.dashboard.type, UI.dashboard.status, UI.dashboard.assigned, UI.dashboard.actions],
            state.domains.map((item) => [
              '<span class="mono">' + escapeHtml(item.domain) + '</span>',
              formatTag(item.type),
              formatTag(item.status),
              String(item.assigned_user_count ?? 0),
              CURRENT_USER.role === "admin"
                ? '<div class="button-row">' +
                    '<button class="button" data-verify-domain="' + escapeHtml(item.id) + '">' + escapeHtml(UI.dashboard.markActive) + '</button>' +
                    '<button class="button" data-configure-domain="' + escapeHtml(item.id) + '">' + escapeHtml(UI.dashboard.configureCloudflare) + '</button>' +
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
            [UI.dashboard.email, UI.dashboard.role, UI.dashboard.status, UI.dashboard.lastLogin, UI.dashboard.actions],
            state.users.map((item) => [
              escapeHtml(item.email),
              formatTag(item.role),
              formatTag(item.status),
              escapeHtml(item.last_login_at || "-"),
              '<div class="button-row">' +
                '<button class="button" data-toggle-user="' + escapeHtml(item.id) + '" data-next-status="' + escapeHtml(item.status === "active" ? "disabled" : "active") + '">' +
                  escapeHtml(item.status === "active" ? UI.dashboard.disable : UI.dashboard.enable) +
                '</button>' +
                '<button class="button danger" data-delete-user="' + escapeHtml(item.id) + '">' + escapeHtml(UI.dashboard.delete) + '</button>' +
              '</div>',
            ]),
          );
        }

        function renderMailboxMessages() {
          selectors.mailboxMessages.innerHTML = renderTable(
            [UI.dashboard.from, UI.dashboard.subject, UI.dashboard.received, UI.dashboard.size, UI.dashboard.attachments],
            state.mailboxMessages.map((item) => [
              escapeHtml(item.from_address || "-"),
              escapeHtml(item.subject || UI.common.untitled),
              escapeHtml(item.received_at),
              escapeHtml(String(item.size ?? 0)),
              String(item.attachment_count || 0),
            ]),
          );
        }

        function renderOps() {
          const runtime = state.cloudflareStatus?.runtime || null;
          const integration = state.cloudflareStatus?.integration || null;
          const runtimeState = runtime?.has_api_token ? "ready" : "incomplete";

          document.getElementById("cf-runtime-state").textContent = translateLabel(runtimeState);
          document.getElementById("ops-mailboxes").textContent = String(state.adminMailboxes.length);
          document.getElementById("ops-messages").textContent = String(state.adminMessages.length);
          document.getElementById("ops-audits").textContent = String(state.audits.length);
          document.getElementById("ops-tokens").textContent = String(state.adminTokens.length);

          selectors.opsStatus.innerHTML = runtime
            ? '<div><strong>' + escapeHtml(UI.dashboard.runtimeTitle) + '</strong> ' +
                [
                  [UI.dashboard.apiTokenLabel, translateLabel(runtime.has_api_token ? "ready" : "missing"), runtime.has_api_token ? "ready" : "missing"],
                  [UI.dashboard.zoneScopeLabel, translateLabel(runtime.zone_scope || "all_accessible_zones"), runtime.zone_scope || "all_accessible_zones"],
                  [UI.dashboard.workerLabel, runtime.email_worker_name || "cf-temp-email", "ready"],
                ].map((item) =>
                  '<span class="tag ' + tagClass(item[2] === "missing" ? "failed" : item[2]) + '">' +
                    escapeHtml(item[0] + ": " + item[1]) +
                  '</span>'
                ).join(" ") +
              '</div>' +
              '<div style="margin-top:10px;"><strong>' + escapeHtml(UI.dashboard.lastIntegration) + '</strong> ' +
                (integration
                  ? [
                      formatTag(integration.status || "unknown"),
                      escapeHtml(UI.dashboard.domain + ": " + (integration.domain_id || "-")),
                      escapeHtml(UI.dashboard.zone + ": " + (integration.zone_name || "-")),
                      escapeHtml(UI.dashboard.updated + ": " + (integration.updated_at || "-")),
                    ].join(" ")
                  : '<span class="muted">' + escapeHtml(UI.dashboard.noIntegrationAttempts) + '</span>') +
              '</div>' +
              (integration?.last_error
                ? '<div class="mono" style="margin-top:10px;">' + escapeHtml(integration.last_error) + '</div>'
                : "") +
              (integration?.details_json
                ? '<div class="mono" style="margin-top:10px;">' + escapeHtml(integration.details_json) + '</div>'
                : "")
            : escapeHtml(UI.dashboard.cloudflareUnavailable);

          selectors.adminMailboxList.innerHTML = renderTable(
            [UI.dashboard.mailbox, UI.dashboard.owner, UI.dashboard.domain, UI.dashboard.status, UI.inbox.expires],
            state.adminMailboxes.map((item) => [
              '<span class="mono">' + escapeHtml(item.email_address) + '</span>',
              escapeHtml(item.user_email || "-"),
              escapeHtml(item.domain || "-"),
              formatTag(item.status),
              escapeHtml(item.expires_at || "-"),
            ]),
          );

          selectors.adminMessageList.innerHTML = renderTable(
            [UI.dashboard.to, UI.dashboard.from, UI.dashboard.subject, UI.dashboard.received, UI.dashboard.size, UI.dashboard.owner],
            state.adminMessages.map((item) => [
              '<span class="mono">' + escapeHtml(item.to_address || "-") + '</span>',
              escapeHtml(item.from_address || "-"),
              escapeHtml(item.subject || UI.common.untitled),
              escapeHtml(item.received_at || "-"),
              escapeHtml(String(item.size ?? 0)),
              escapeHtml(item.owner_email || "-"),
            ]),
          );

          selectors.adminTokenList.innerHTML = renderTable(
            [UI.dashboard.assignUser, UI.dashboard.name, UI.dashboard.prefix, UI.dashboard.status, UI.dashboard.lastUsed, UI.dashboard.revoked, UI.dashboard.action],
            state.adminTokens.map((item) => [
              escapeHtml(item.user_email || "-"),
              escapeHtml(item.name),
              '<span class="mono">' + escapeHtml(item.token_prefix) + '</span>',
              formatTag(item.status),
              escapeHtml(item.last_used_at || "-"),
              escapeHtml(item.revoked_at || "-"),
              item.status === "revoked"
                ? '<span class="muted">' + escapeHtml(translateLabel("revoked")) + '</span>'
                : '<button class="button danger" data-admin-revoke-token="' + escapeHtml(item.id) + '">' + escapeHtml(UI.dashboard.revoke) + '</button>',
            ]),
          );

          selectors.auditList.innerHTML = renderTable(
            [UI.dashboard.time, UI.dashboard.action, UI.dashboard.actor, UI.dashboard.target, UI.dashboard.metadata],
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

        document.getElementById("cloudflare-clear")?.addEventListener("click", async () => {
          try {
            await request("/admin/cloudflare/config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ api_token: "" }),
            });
            showFeedback("cloudflare-feedback", UI.dashboard.cloudflareTokenCleared);
            forms.cloudflareConfig?.reset();
            await loadData();
          } catch (error) {
            showFeedback("cloudflare-feedback", error.message, "error");
          }
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
              showFeedback("domain-feedback", UI.dashboard.cloudflareConfigured);
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
            showFeedback("mailbox-feedback", result.email_address + " / " + UI.dashboard.mailboxCreated);
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
            showFeedback("token-feedback", UI.dashboard.tokenCreated);
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
            showFeedback("domain-feedback", UI.dashboard.domainCreated);
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
            showFeedback("assign-feedback", UI.dashboard.domainAssigned);
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
            showFeedback("user-feedback", UI.dashboard.userCreated);
            forms.user.reset();
            await loadData();
          } catch (error) {
            showFeedback("user-feedback", error.message, "error");
          }
        });

        forms.cloudflareConfig?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("cloudflare-feedback");
          const formData = new FormData(forms.cloudflareConfig);
          try {
            await request("/admin/cloudflare/config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                api_token: formData.get("api_token"),
              }),
            });
            showFeedback("cloudflare-feedback", UI.dashboard.cloudflareTokenSaved);
            forms.cloudflareConfig.reset();
            await loadData();
          } catch (error) {
            showFeedback("cloudflare-feedback", error.message, "error");
          }
        });

        loadData().catch((error) => alert(error.message));
      </script>
    `,
  });
}

function inboxStatePageHtml(title: string, message: string, locale: Locale, currentPath: string) {
  return renderDocument({
    title,
    lang: locale,
    body: `
      <div class="inbox-shell">
        ${languageSwitcher(currentPath, locale)}
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

function inboxPageHtml(mailbox: Record<string, unknown>, token: string, locale: Locale) {
  const ui = getUi(locale);
  const emailAddress = String(mailbox.email_address ?? "");
  const expiresAt = String(mailbox.expires_at ?? "");

  return renderDocument({
    title: locale === "en" ? `Inbox ${emailAddress}` : `收件箱 ${emailAddress}`,
    lang: locale,
    body: `
      <div class="inbox-shell">
        ${languageSwitcher(`/inbox/${encodeURIComponent(token)}`, locale)}
        <header class="page-header">
          <div class="page-title">
            <h1>${emailAddress}</h1>
            <p>${ui.inbox.expires} / ${expiresAt}</p>
          </div>
          <div class="button-row">
            <button id="refresh-inbox" class="button">${ui.inbox.refresh}</button>
          </div>
        </header>
        <div id="inbox-error" class="notice error hidden"></div>
        <div class="inbox-layout">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>${ui.inbox.messages}</h2>
                <div class="meta">${ui.inbox.autoRefresh}</div>
              </div>
            </div>
            <div id="message-list" class="message-list"></div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 id="message-subject">${ui.inbox.noMessageSelected}</h2>
                <div id="message-meta" class="meta"></div>
              </div>
            </div>
            <div id="message-view" class="message-body">
              <div class="notice">${ui.inbox.waiting}</div>
            </div>
          </section>
        </div>
      </div>
      <script>
        const INBOX_TOKEN = ${jsonForScript(token)};
        const UI = ${jsonForScript(ui)};
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
            throw new Error(result?.error?.message || UI.common.requestFailed);
          }
          return result;
        }

        function renderList(messages) {
          const node = document.getElementById("message-list");
          if (!messages.length) {
            node.innerHTML = '<div class="notice">' + UI.inbox.noMessages + '</div>';
            return;
          }

          node.innerHTML = messages.map((item) =>
            '<button class="message-item ' + (item.id === currentMessageId ? "active" : "") + '" data-message-id="' + escapeHtml(item.id) + '">' +
              '<div><strong>' + escapeHtml(item.subject || UI.common.untitled) + '</strong></div>' +
              '<div class="meta">' + escapeHtml(item.from_address || "-") + '</div>' +
              '<div class="meta">' + escapeHtml(item.received_at) + ' / ' + escapeHtml(item.size || 0) + ' ' + UI.inbox.bytes + ' / ' + escapeHtml(item.attachment_count) + ' ' + UI.inbox.attachments + '</div>' +
            '</button>'
          ).join("");
        }

        function renderMessage(result) {
          document.getElementById("message-subject").textContent = result.message.subject || UI.common.untitled;
          document.getElementById("message-meta").textContent =
            (result.message.from_address || "-") + " -> " + result.message.to_address + " / " + result.message.received_at;

          const htmlBlock = result.message.html_body
            ? '<div class="panel" style="padding:14px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid rgba(255,255,255,0.06);"><div class="meta" style="margin-bottom:10px;">' + escapeHtml(UI.inbox.htmlPreview) + '</div><iframe class="mail-html" sandbox srcdoc="' + String(result.message.html_body).replace(/"/g, "&quot;") + '"></iframe></div>'
            : "";
          const textBlock = result.message.text_body
            ? '<div class="panel" style="padding:14px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid rgba(255,255,255,0.06);"><div class="meta" style="margin-bottom:10px;">' + escapeHtml(UI.inbox.textBody) + '</div><pre class="notice" style="white-space:pre-wrap; margin:0;">' + escapeHtml(result.message.text_body) + '</pre></div>'
            : "";
          const attachments = result.message.attachments?.length
            ? '<div class="attachments">' + result.message.attachments.map((item) =>
                '<a class="attachment-link mono" href="/inbox/' + encodeURIComponent(INBOX_TOKEN) + '/attachments/' + encodeURIComponent(item.id) + '">' +
                  escapeHtml(item.filename || item.id) +
                '</a>'
              ).join("") + '</div>'
            : '<div class="notice">' + UI.inbox.noAttachments + '</div>';

          document.getElementById("message-view").innerHTML =
            '<div class="panel" style="padding:14px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid rgba(255,255,255,0.06);">' +
              '<div class="meta">' + UI.inbox.rawSize + ' / ' + escapeHtml(result.message.size || 0) + ' ' + UI.inbox.bytes + '</div>' +
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
  return c.html(loginPageHtml(c.get("locale") ?? "zh-CN"));
});

webApp.get("/setup", async (c) => {
  const adminCount = await countAdmins(c.env);
  if (adminCount > 0) {
    return redirect(c.get("authUser") ? "/app" : "/login");
  }
  return c.html(setupPageHtml(c.get("locale") ?? "zh-CN"));
});

webApp.get("/app", async (c) => {
  const user = c.get("authUser");
  if (!user) {
    return redirect("/login");
  }
  return c.html(dashboardPageHtml(user, c.get("locale") ?? "zh-CN"));
});

webApp.get("/inbox/:encryptedToken", async (c) => {
  const encryptedToken = c.req.param("encryptedToken");
  try {
    const { mailbox } = await validateInboxAccessToken(c.env, encryptedToken, {
      ip: c.get("requestIp") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    });
    return c.html(inboxPageHtml(mailbox, encryptedToken, c.get("locale") ?? "zh-CN"));
  } catch (error) {
    if (!(error instanceof AppRouteError)) {
      throw error;
    }
    const locale = c.get("locale") ?? "zh-CN";
    const ui = getUi(locale);
    const translatedMessage = translateErrorMessage(locale, error.message);
    const title =
      error.code === "MAILBOX_EXPIRED"
        ? ui.inbox.inboxExpired
        : error.code === "NOT_FOUND"
          ? ui.inbox.inboxUnavailable
          : ui.inbox.inboxAccessFailed;
    return c.html(
      inboxStatePageHtml(title, translatedMessage, locale, `/inbox/${encodeURIComponent(encryptedToken)}`),
      error.status,
    );
  }
});

export default webApp;
