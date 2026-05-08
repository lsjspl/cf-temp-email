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

/**
 * Shared client runtime: toast, modal confirm, clipboard, button loading state.
 * Injected into every page that needs interactive feedback.
 */
function clientRuntimeScript(ui: unknown): string {
  return `
    const __UI__ = ${jsonForScript(ui)};

    // --- Toast --------------------------------------------------------------
    (function ensureToastStack() {
      if (document.getElementById("toast-stack")) return;
      const node = document.createElement("div");
      node.id = "toast-stack";
      node.className = "toast-stack";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      document.body.appendChild(node);
    })();

    window.toast = function toast(message, kind = "info", duration = 3800) {
      if (!message) return;
      const stack = document.getElementById("toast-stack");
      if (!stack) return;
      const node = document.createElement("div");
      node.className = "toast " + kind;
      const icon = kind === "ok" ? "✓" : kind === "error" ? "!" : kind === "warn" ? "⚠" : "i";
      node.innerHTML =
        '<span class="toast-icon">' + icon + '</span>' +
        '<div class="toast-body"></div>' +
        '<button class="toast-close" type="button" aria-label="close">×</button>';
      node.querySelector(".toast-body").textContent = message;
      stack.appendChild(node);
      const dismiss = () => {
        if (node.classList.contains("leaving")) return;
        node.classList.add("leaving");
        setTimeout(() => node.remove(), 180);
      };
      node.querySelector(".toast-close").addEventListener("click", dismiss);
      if (duration > 0) setTimeout(dismiss, duration);
      return dismiss;
    };

    // --- Modal confirm ------------------------------------------------------
    window.confirmModal = function confirmModal(options) {
      const opts = Object.assign({
        title: __UI__.common.confirm,
        body: "",
        confirmText: __UI__.common.confirm,
        cancelText: __UI__.common.cancel,
        tone: "default",
      }, options || {});
      return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop";
        backdrop.innerHTML =
          '<div class="modal-card ' + (opts.tone === "danger" ? "tone-danger" : "") + '" role="dialog" aria-modal="true">' +
            '<div class="modal-header"><h2></h2></div>' +
            '<div class="modal-body"></div>' +
            '<div class="modal-footer">' +
              '<button class="button ghost" data-action="cancel"></button>' +
              '<button class="button ' + (opts.tone === "danger" ? "danger" : "primary") + '" data-action="confirm"></button>' +
            '</div>' +
          '</div>';
        backdrop.querySelector(".modal-header h2").textContent = opts.title;
        if (typeof opts.body === "string") {
          backdrop.querySelector(".modal-body").textContent = opts.body;
        } else if (opts.body instanceof Node) {
          backdrop.querySelector(".modal-body").appendChild(opts.body);
        }
        backdrop.querySelector('[data-action="cancel"]').textContent = opts.cancelText;
        backdrop.querySelector('[data-action="confirm"]').textContent = opts.confirmText;
        document.body.appendChild(backdrop);
        const confirmBtn = backdrop.querySelector('[data-action="confirm"]');
        confirmBtn.focus();
        const cleanup = (value) => {
          document.removeEventListener("keydown", onKey);
          backdrop.remove();
          resolve(value);
        };
        const onKey = (event) => {
          if (event.key === "Escape") cleanup(false);
          if (event.key === "Enter" && document.activeElement !== backdrop.querySelector('[data-action="cancel"]')) cleanup(true);
        };
        document.addEventListener("keydown", onKey);
        backdrop.addEventListener("click", (event) => {
          if (event.target === backdrop) cleanup(false);
        });
        backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => cleanup(false));
        confirmBtn.addEventListener("click", () => cleanup(true));
      });
    };

    // --- Clipboard ----------------------------------------------------------
    window.copyToClipboard = async function copyToClipboard(text) {
      if (!text) return false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(String(text));
          return true;
        }
      } catch (error) { /* fall through to legacy */ }
      try {
        const area = document.createElement("textarea");
        area.value = String(text);
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        return ok;
      } catch (error) {
        return false;
      }
    };

    document.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-copy]");
      if (!target) return;
      event.preventDefault();
      const value = target.getAttribute("data-copy");
      const ok = await window.copyToClipboard(value);
      if (ok) {
        window.toast(__UI__.common.copied, "ok", 1800);
        const original = target.textContent;
        target.classList.add("copied");
        target.textContent = __UI__.common.copied;
        setTimeout(() => {
          target.classList.remove("copied");
          target.textContent = original;
        }, 1400);
      } else {
        window.toast(__UI__.common.copyFailed, "error");
      }
    });

    // Password show/hide
    document.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-password-toggle]");
      if (!toggle) return;
      const id = toggle.getAttribute("data-password-toggle");
      const input = document.getElementById(id);
      if (!input) return;
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      toggle.textContent = isHidden ? __UI__.common.hide : __UI__.common.show;
      toggle.setAttribute("aria-pressed", String(isHidden));
    });

    // --- Button loading state ----------------------------------------------
    window.withButtonLoading = async function withButtonLoading(button, loadingLabel, work) {
      if (!button) return work();
      const originalLabel = button.querySelector(".button-label")?.textContent ?? button.textContent;
      const labelNode = button.querySelector(".button-label");
      const wasDisabled = button.disabled;
      button.classList.add("is-loading");
      button.disabled = true;
      if (loadingLabel) {
        if (labelNode) labelNode.textContent = loadingLabel;
        else button.textContent = loadingLabel;
      }
      try {
        return await work();
      } finally {
        button.classList.remove("is-loading");
        button.disabled = wasDisabled;
        if (loadingLabel) {
          if (labelNode) labelNode.textContent = originalLabel;
          else button.textContent = originalLabel;
        }
      }
    };

    // Normalise button markup so spinner + label are present
    document.querySelectorAll(".button").forEach((btn) => {
      if (btn.querySelector(".spinner")) return;
      if (btn.tagName !== "BUTTON") return;
      const label = btn.textContent;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span class="button-label"></span>';
      btn.querySelector(".button-label").textContent = label;
    });
  `;
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
            <form id="login-form" class="field-grid" novalidate>
              <div class="field">
                <label for="login">${ui.login.login}</label>
                <input id="login" name="login" class="input" autocomplete="username" placeholder="${ui.login.loginPlaceholder}" required />
              </div>
              <div class="field">
                <label for="password">${ui.login.password}</label>
                <div class="password-wrap">
                  <input id="password" name="password" class="input" type="password" autocomplete="current-password" placeholder="${ui.login.passwordPlaceholder}" required />
                  <button type="button" class="password-toggle" data-password-toggle="password" aria-pressed="false">${ui.common.show}</button>
                </div>
              </div>
              <div id="login-error" class="notice error hidden" role="alert"></div>
              <div class="button-row">
                <button id="login-submit" class="button primary" type="submit">${ui.login.submit}</button>
              </div>
            </form>
          </div>
        </section>
      </div>
      <script>
        ${clientRuntimeScript(ui)}

        const form = document.getElementById("login-form");
        const errorNode = document.getElementById("login-error");
        const submitBtn = document.getElementById("login-submit");
        const loginInput = document.getElementById("login");
        const passwordInput = document.getElementById("password");

        function setError(message) {
          if (!message) {
            errorNode.classList.add("hidden");
            errorNode.textContent = "";
            return;
          }
          errorNode.textContent = message;
          errorNode.classList.remove("hidden");
        }

        [loginInput, passwordInput].forEach((input) => {
          input.addEventListener("input", () => {
            input.removeAttribute("aria-invalid");
            setError("");
          });
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setError("");

          const login = loginInput.value.trim();
          const password = passwordInput.value;

          if (!login || !password) {
            if (!login) loginInput.setAttribute("aria-invalid", "true");
            if (!password) passwordInput.setAttribute("aria-invalid", "true");
            setError(__UI__.login.missingFields);
            (login ? passwordInput : loginInput).focus();
            return;
          }

          await window.withButtonLoading(submitBtn, __UI__.login.submitting, async () => {
            try {
              const response = await fetch("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password }),
              });
              if (!response.ok) {
                const result = await response.json().catch(() => null);
                const message = result?.error?.message ?? __UI__.login.failed;
                setError(message);
                window.toast(message, "error");
                return;
              }
              window.toast("✓", "ok", 900);
              location.href = "/app";
            } catch (error) {
              setError(error.message || __UI__.login.failed);
              window.toast(error.message || __UI__.login.failed, "error");
            }
          });
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
            <form id="setup-form" class="field-grid" novalidate>
              <div class="field">
                <label for="email">${ui.setup.email}</label>
                <input id="email" name="email" class="input" autocomplete="email" type="email" placeholder="${ui.setup.emailPlaceholder}" required />
              </div>
              <div class="field">
                <label for="username">${ui.setup.username}</label>
                <input id="username" name="username" class="input" autocomplete="username" placeholder="${ui.setup.usernamePlaceholder}" required />
              </div>
              <div class="field">
                <label for="password">
                  <span>${ui.setup.password}</span>
                  <span class="field-hint">${ui.setup.passwordHint}</span>
                </label>
                <div class="password-wrap">
                  <input id="password" name="password" class="input" type="password" autocomplete="new-password" minlength="8" required />
                  <button type="button" class="password-toggle" data-password-toggle="password" aria-pressed="false">${ui.common.show}</button>
                </div>
              </div>
              <div id="setup-error" class="notice error hidden" role="alert"></div>
              <div class="button-row">
                <button id="setup-submit" class="button primary" type="submit">${ui.setup.submit}</button>
              </div>
            </form>
          </div>
        </section>
      </div>
      <script>
        ${clientRuntimeScript(ui)}

        const form = document.getElementById("setup-form");
        const errorNode = document.getElementById("setup-error");
        const submitBtn = document.getElementById("setup-submit");
        const emailInput = document.getElementById("email");
        const usernameInput = document.getElementById("username");
        const passwordInput = document.getElementById("password");

        function setError(message) {
          if (!message) {
            errorNode.classList.add("hidden");
            errorNode.textContent = "";
            return;
          }
          errorNode.textContent = message;
          errorNode.classList.remove("hidden");
        }

        [emailInput, usernameInput, passwordInput].forEach((input) => {
          input.addEventListener("input", () => {
            input.removeAttribute("aria-invalid");
            setError("");
          });
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setError("");

          const email = emailInput.value.trim();
          const username = usernameInput.value.trim();
          const password = passwordInput.value;

          if (!email || !username || !password) {
            if (!email) emailInput.setAttribute("aria-invalid", "true");
            if (!username) usernameInput.setAttribute("aria-invalid", "true");
            if (!password) passwordInput.setAttribute("aria-invalid", "true");
            setError(__UI__.setup.missingFields);
            return;
          }

          if (password.length < 8) {
            passwordInput.setAttribute("aria-invalid", "true");
            setError(__UI__.setup.passwordTooShort);
            passwordInput.focus();
            return;
          }

          await window.withButtonLoading(submitBtn, __UI__.setup.submitting, async () => {
            try {
              const response = await fetch("/setup/initialize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, username, password }),
              });
              if (!response.ok) {
                const result = await response.json().catch(() => null);
                const message = result?.error?.message ?? __UI__.setup.failed;
                setError(message);
                window.toast(message, "error");
                return;
              }
              const result = await response.json().catch(() => null);
              window.toast("✓", "ok", 900);
              location.href = result?.next_path || "/app";
            } catch (error) {
              setError(error.message || __UI__.setup.failed);
              window.toast(error.message || __UI__.setup.failed, "error");
            }
          });
        });
      </script>
    `,
  });
}

function dashboardPageHtml(user: { id: string; email: string; role: string }, locale: Locale) {
  const ui = getUi(locale);
  const roleLabel = user.role === "admin" ? ui.dashboard.admin : ui.dashboard.user;
  const zhActive = locale === "zh-CN";

  return renderDocument({
    title: ui.dashboard.title,
    lang: locale,
    body: `
      <div class="shell">
        <header class="page-header">
          <div class="page-title">
            <h1>${ui.dashboard.title}</h1>
            <p>
              <span class="tag ${user.role === "admin" ? "good" : ""}">${roleLabel}</span>
              <span class="mono" style="margin-left:8px;">${user.email}</span>
            </p>
          </div>
          <div class="button-row">
            <a class="button sm ${zhActive ? "primary" : "ghost"}" href="/app?lang=zh-CN" title="切换到中文">中文</a>
            <a class="button sm ${!zhActive ? "primary" : "ghost"}" href="/app?lang=en" title="Switch to English">EN</a>
            <button id="refresh-all" class="button" type="button" title="${ui.common.refresh}">${ui.common.refresh}</button>
            <button id="logout" class="button danger" type="button">${ui.common.logout}</button>
          </div>
        </header>
        <div class="dashboard-grid">
          <aside class="panel sidebar" role="navigation">
            <button class="nav-button active" type="button" data-panel="overview">${ui.dashboard.overview}</button>
            <button class="nav-button" type="button" data-panel="mailboxes">${ui.dashboard.mailboxes}</button>
            <button class="nav-button" type="button" data-panel="tokens">${ui.dashboard.tokens}</button>
            <button class="nav-button" type="button" data-panel="domains">${ui.dashboard.domains}</button>
            <button class="nav-button ${user.role === "admin" ? "" : "hidden"}" type="button" data-panel="users">${ui.dashboard.users}</button>
            <button class="nav-button ${user.role === "admin" ? "" : "hidden"}" type="button" data-panel="ops">${ui.dashboard.ops}</button>
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
                <form id="mailbox-form" class="field-grid" novalidate>
                  <div class="field">
                    <label for="mailbox-domain">${ui.dashboard.domain}</label>
                    <select id="mailbox-domain" class="select" name="domain_id" required></select>
                  </div>
                  <div class="field">
                    <label for="mailbox-prefix">
                      <span>${ui.dashboard.prefix}</span>
                      <span class="field-hint">${ui.dashboard.prefixHint}</span>
                    </label>
                    <input id="mailbox-prefix" class="input" name="prefix" placeholder="${ui.dashboard.prefixPlaceholder}" pattern="[a-z0-9][a-z0-9\\-_]{1,62}" />
                  </div>
                  <div class="field">
                    <label for="mailbox-ttl-preset">
                      <span>${ui.dashboard.ttlSeconds}</span>
                      <span class="field-hint">${ui.dashboard.ttlHint}</span>
                    </label>
                    <select id="mailbox-ttl-preset" class="select">
                      <option value="3600">${ui.dashboard.ttlPreset1h}</option>
                      <option value="21600">${ui.dashboard.ttlPreset6h}</option>
                      <option value="86400" selected>${ui.dashboard.ttlPreset1d}</option>
                      <option value="604800">${ui.dashboard.ttlPreset7d}</option>
                      <option value="custom">${ui.dashboard.ttlCustom}</option>
                    </select>
                    <input id="mailbox-ttl" class="input hidden" name="ttl_seconds" type="number" min="60" value="86400" />
                  </div>
                  <div id="mailbox-feedback" class="notice hidden" role="status"></div>
                  <div class="button-row">
                    <button id="mailbox-submit" class="button primary" type="submit">${ui.dashboard.createMailbox}</button>
                  </div>
                </form>
                <div class="panel subpanel">
                  <div class="panel-header">
                    <div>
                      <h3>${ui.dashboard.messagePeek}</h3>
                      <div class="meta">${ui.dashboard.messagePeekSubtitle}</div>
                    </div>
                  </div>
                  <select id="mailbox-picker" class="select" aria-label="${ui.common.selectMailbox}"></select>
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
                <form id="token-form" class="field-grid" novalidate>
                  <div class="field">
                    <label for="token-name">${ui.dashboard.name}</label>
                    <input id="token-name" class="input" name="name" placeholder="${ui.dashboard.namePlaceholder}" required />
                  </div>
                  <div id="token-feedback" class="notice hidden" role="status"></div>
                  <div class="button-row">
                    <button id="token-submit" class="button primary" type="submit">${ui.dashboard.createToken}</button>
                  </div>
                </form>
                <div id="token-secret-wrap" class="notice warn hidden" role="alert">
                  <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
                    <strong>${ui.dashboard.tokenSecretWarning}</strong>
                    <button type="button" class="button sm ghost" id="token-secret-copy" data-copy="">${ui.common.copy}</button>
                  </div>
                  <div id="token-secret" class="mono" style="margin-top:8px; user-select:all;"></div>
                </div>
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
                <form id="domain-form" class="field-grid" novalidate>
                  <div class="field">
                    <label for="domain-name">${ui.dashboard.domain}</label>
                    <input id="domain-name" class="input" name="domain" placeholder="${ui.dashboard.domainPlaceholder}" required />
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
                  <div id="domain-feedback" class="notice hidden" role="status"></div>
                  <div class="button-row">
                    <button id="domain-submit" class="button primary" type="submit">${ui.dashboard.addDomain}</button>
                  </div>
                </form>
                <form id="assign-form" class="field-grid" novalidate>
                  <div class="field">
                    <label for="assign-user">${ui.dashboard.assignUser}</label>
                    <select id="assign-user" class="select" name="user_id" required></select>
                  </div>
                  <div class="field">
                    <label for="assign-domain">${ui.dashboard.assignDomain}</label>
                    <select id="assign-domain" class="select" name="domain_id" required></select>
                  </div>
                  <div id="assign-feedback" class="notice hidden" role="status"></div>
                  <div class="button-row">
                    <button id="assign-submit" class="button primary" type="submit">${ui.dashboard.assignDomainAction}</button>
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
                <form id="user-form" class="field-grid" novalidate>
                  <div class="field">
                    <label for="user-email">${ui.dashboard.email}</label>
                    <input id="user-email" class="input" name="email" type="email" required />
                  </div>
                  <div class="field">
                    <label for="user-username">${ui.dashboard.username}</label>
                    <input id="user-username" class="input" name="username" required />
                  </div>
                  <div class="field">
                    <label for="user-password">${ui.dashboard.password}</label>
                    <div class="password-wrap">
                      <input id="user-password" class="input" name="password" type="password" minlength="8" required />
                      <button type="button" class="password-toggle" data-password-toggle="user-password" aria-pressed="false">${ui.common.show}</button>
                    </div>
                  </div>
                  <div class="field">
                    <label for="user-role">${ui.dashboard.role}</label>
                    <select id="user-role" class="select" name="role">
                      <option value="user">${ui.dashboard.statusLabels.user}</option>
                      <option value="admin">${ui.dashboard.statusLabels.admin}</option>
                    </select>
                  </div>
                  <div id="user-feedback" class="notice hidden" role="status"></div>
                  <div class="button-row">
                    <button id="user-submit" class="button primary" type="submit">${ui.dashboard.createUser}</button>
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
              <form id="cloudflare-config-form" class="field-grid" style="margin-top:16px;" novalidate>
                <div class="field">
                  <label for="cloudflare-api-token">
                    <span>${ui.dashboard.cloudflareToken}</span>
                    <span class="field-hint">${ui.dashboard.cloudflareTokenHint}</span>
                  </label>
                  <div class="password-wrap">
                    <input id="cloudflare-api-token" class="input" name="api_token" type="password" autocomplete="off" />
                    <button type="button" class="password-toggle" data-password-toggle="cloudflare-api-token" aria-pressed="false">${ui.common.show}</button>
                  </div>
                </div>
                <div id="cloudflare-feedback" class="notice hidden" role="status"></div>
                <div class="button-row">
                  <button id="cloudflare-save" class="button primary" type="submit">${ui.dashboard.saveToken}</button>
                  <button id="cloudflare-clear" class="button danger" type="button">${ui.dashboard.clearToken}</button>
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
        ${clientRuntimeScript(ui)}

        const CURRENT_USER = ${jsonForScript(user)};
        const UI = __UI__;
        const state = {
          users: [],
          userDomains: [],
          allDomains: [],
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
          tokenSecretWrap: document.getElementById("token-secret-wrap"),
          tokenSecretCopy: document.getElementById("token-secret-copy"),
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

        function escapeAttr(value) {
          return escapeHtml(value);
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
          node.className = "notice " + (kind === "error" ? "error" : kind === "warn" ? "warn" : "ok");
          if (kind !== "error") {
            setTimeout(() => {
              if (node.textContent === message) clearFeedback(id);
            }, 4500);
          }
        }

        function clearFeedback(id) {
          const node = document.getElementById(id);
          if (!node) return;
          node.className = "notice hidden";
          node.textContent = "";
        }

        async function request(path, options = {}) {
          const response = await fetch(path, options);
          if (response.status === 401) {
            window.toast(UI.common.sessionExpired, "error");
            setTimeout(() => { location.href = "/login"; }, 800);
            throw new Error(UI.common.sessionExpired);
          }
          const isJson = response.headers.get("content-type")?.includes("application/json");
          const result = isJson ? await response.json() : null;
          if (!response.ok) {
            const error = new Error(result?.error?.message || UI.common.requestFailed);
            error.payload = result;
            throw error;
          }
          return result;
        }

        function renderEmpty(colspan, message, hint) {
          return '<tr><td colspan="' + colspan + '" class="empty-cell">' +
            '<div class="empty-state">' +
              '<div class="empty-icon">📭</div>' +
              '<div>' + escapeHtml(message || UI.common.noData) + '</div>' +
              (hint ? '<div class="meta" style="margin:0;">' + escapeHtml(hint) + '</div>' : "") +
            '</div>' +
          '</td></tr>';
        }

        function renderTable(headers, rows, emptyHint) {
          return '<table><thead><tr>' +
            headers.map((item) => '<th>' + escapeHtml(item) + '</th>').join("") +
            '</tr></thead><tbody>' +
            (rows.length
              ? rows.map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join("") + '</tr>').join("")
              : renderEmpty(headers.length, UI.common.noData, emptyHint ?? UI.common.noDataHint)) +
            '</tbody></table>';
        }

        function renderMetrics() {
          const cards = CURRENT_USER.role === "admin"
            ? [
                { label: UI.dashboard.metricUsers, value: state.users.length },
                { label: UI.dashboard.metricDomains, value: state.allDomains.length },
                { label: UI.dashboard.allMailboxes, value: state.adminMailboxes.length },
                { label: UI.dashboard.allMessages, value: state.adminMessages.length },
              ]
            : [
                { label: UI.dashboard.metricMyDomains, value: state.userDomains.length },
                { label: UI.dashboard.metricMyTokens, value: state.tokens.length },
                { label: UI.dashboard.metricMyMailboxes, value: state.mailboxes.length },
                { label: UI.dashboard.metricMailboxMessages, value: state.mailboxMessages.length },
              ];

          selectors.metrics.innerHTML = cards.map((item) =>
            '<div class="metric"><span class="meta">' + escapeHtml(item.label) + '</span><strong>' + item.value + '</strong></div>'
          ).join("");
        }

        function copyableMono(value) {
          if (!value) return "-";
          return '<span class="copy-group">' +
            '<span class="mono">' + escapeHtml(value) + '</span>' +
            '<button type="button" class="copy-btn" data-copy="' + escapeAttr(value) + '" title="' + escapeAttr(UI.common.copy) + '">' + escapeHtml(UI.common.copy) + '</button>' +
          '</span>';
        }

        function renderMailboxes() {
          selectors.mailboxList.innerHTML = renderTable(
            [UI.dashboard.email, UI.dashboard.status, UI.inbox.expires, UI.dashboard.accessLink],
            state.mailboxes.map((item) => [
              copyableMono(item.email_address),
              formatTag(item.status),
              escapeHtml(item.expires_at),
              item.encrypted_access_url
                ? '<span class="copy-group"><a class="button sm ghost" href="' + escapeAttr(item.encrypted_access_url) + '" target="_blank" rel="noreferrer">' + escapeHtml(UI.common.open) + '</a>' +
                  '<button type="button" class="copy-btn" data-copy="' + escapeAttr(item.encrypted_access_url) + '">' + escapeHtml(UI.common.copy) + '</button></span>'
                : "-",
            ]),
          );

          const mailboxDomain = document.getElementById("mailbox-domain");
          if (state.userDomains.length === 0) {
            mailboxDomain.innerHTML = '<option value="">' + escapeHtml(UI.dashboard.noDomainsAvailable) + '</option>';
            mailboxDomain.disabled = true;
            document.getElementById("mailbox-submit").disabled = true;
          } else {
            mailboxDomain.innerHTML = state.userDomains.map((domain) =>
              '<option value="' + escapeAttr(domain.id) + '">' + escapeHtml(domain.domain) + '</option>'
            ).join("");
            mailboxDomain.disabled = false;
            document.getElementById("mailbox-submit").disabled = false;
          }

          selectors.mailboxPicker.innerHTML =
            '<option value="">' + escapeHtml(UI.common.selectMailbox) + '</option>' +
            state.mailboxes.map((item) =>
              '<option value="' + escapeAttr(item.id) + '">' + escapeHtml(item.email_address) + '</option>'
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
              item.status === "revoked"
                ? '<span class="muted">' + escapeHtml(translateLabel("revoked")) + '</span>'
                : '<button class="button sm danger" type="button" data-revoke-token="' + escapeAttr(item.id) + '" data-token-name="' + escapeAttr(item.name) + '">' + escapeHtml(UI.dashboard.revoke) + '</button>',
            ]),
          );
        }

        function renderDomainList() {
          const visibleDomains = CURRENT_USER.role === "admin" ? state.allDomains : state.userDomains;
          selectors.domainList.innerHTML = renderTable(
            [UI.dashboard.domain, UI.dashboard.type, UI.dashboard.status, UI.dashboard.assigned, UI.dashboard.actions],
            visibleDomains.map((item) => [
              copyableMono(item.domain),
              formatTag(item.type),
              formatTag(item.status),
              String(item.assigned_user_count ?? 0),
              CURRENT_USER.role === "admin"
                ? '<div class="inline-actions">' +
                    (item.status !== "active"
                      ? '<button class="button sm" type="button" data-verify-domain="' + escapeAttr(item.id) + '" data-domain-name="' + escapeAttr(item.domain) + '">' + escapeHtml(UI.dashboard.markActive) + '</button>'
                      : "") +
                    '<button class="button sm" type="button" data-configure-domain="' + escapeAttr(item.id) + '" data-domain-name="' + escapeAttr(item.domain) + '">' + escapeHtml(UI.dashboard.configureCloudflare) + '</button>' +
                  '</div>'
                : "-",
            ]),
          );

          const assignDomain = document.getElementById("assign-domain");
          if (assignDomain) {
            const activeDomains = state.allDomains.filter((item) => item.status === "active");
            if (activeDomains.length === 0) {
              assignDomain.innerHTML = '<option value="">' + escapeHtml(UI.dashboard.noActiveDomains) + '</option>';
              assignDomain.disabled = true;
            } else {
              assignDomain.innerHTML = activeDomains.map((item) => '<option value="' + escapeAttr(item.id) + '">' + escapeHtml(item.domain) + '</option>').join("");
              assignDomain.disabled = false;
            }
          }
        }

        function renderUsers() {
          const assignUser = document.getElementById("assign-user");
          if (assignUser) {
            if (state.users.length === 0) {
              assignUser.innerHTML = '<option value="">' + escapeHtml(UI.dashboard.noUsersAvailable) + '</option>';
              assignUser.disabled = true;
            } else {
              assignUser.innerHTML = state.users
                .map((item) => '<option value="' + escapeAttr(item.id) + '">' + escapeHtml(item.email) + '</option>')
                .join("");
              assignUser.disabled = false;
            }
          }

          selectors.userList.innerHTML = renderTable(
            [UI.dashboard.email, UI.dashboard.role, UI.dashboard.status, UI.dashboard.lastLogin, UI.dashboard.actions],
            state.users.map((item) => {
              const isSelf = item.id === CURRENT_USER.id;
              const toggleLabel = item.status === "active" ? UI.dashboard.disable : UI.dashboard.enable;
              const deleteBtn = isSelf
                ? '<span class="pill-chip" title="' + escapeAttr(UI.dashboard.userActionsHint) + '">—</span>'
                : '<button class="button sm danger" type="button" data-delete-user="' + escapeAttr(item.id) + '" data-user-email="' + escapeAttr(item.email) + '">' + escapeHtml(UI.dashboard.delete) + '</button>';
              const toggleBtn = isSelf
                ? ""
                : '<button class="button sm" type="button" data-toggle-user="' + escapeAttr(item.id) + '" data-next-status="' + escapeAttr(item.status === "active" ? "disabled" : "active") + '" data-user-email="' + escapeAttr(item.email) + '">' + escapeHtml(toggleLabel) + '</button>';
              return [
                escapeHtml(item.email) + (isSelf ? ' <span class="pill-chip">' + escapeHtml(UI.dashboard.youBadge) + '</span>' : ''),
                formatTag(item.role),
                formatTag(item.status),
                escapeHtml(item.last_login_at || "-"),
                '<div class="inline-actions">' + toggleBtn + deleteBtn + '</div>',
              ];
            }),
          );
        }

        function renderMailboxMessages() {
          if (state.mailboxes.length === 0) {
            selectors.mailboxMessages.innerHTML = '<div class="notice">' + escapeHtml(UI.dashboard.selectMailboxFirst) + '</div>';
            return;
          }
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
              copyableMono(item.email_address),
              escapeHtml(item.user_email || "-"),
              escapeHtml(item.domain || "-"),
              formatTag(item.status),
              escapeHtml(item.expires_at || "-"),
            ]),
          );

          selectors.adminMessageList.innerHTML = renderTable(
            [UI.dashboard.to, UI.dashboard.from, UI.dashboard.subject, UI.dashboard.received, UI.dashboard.size, UI.dashboard.owner],
            state.adminMessages.map((item) => [
              copyableMono(item.to_address),
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
                : '<button class="button sm danger" type="button" data-admin-revoke-token="' + escapeAttr(item.id) + '" data-token-name="' + escapeAttr(item.name) + '">' + escapeHtml(UI.dashboard.revoke) + '</button>',
            ]),
          );

          selectors.auditList.innerHTML = renderTable(
            [UI.dashboard.time, UI.dashboard.action, UI.dashboard.actor, UI.dashboard.target, UI.dashboard.metadata],
            state.audits.map((item) => [
              escapeHtml(item.created_at),
              '<span class="pill-chip">' + escapeHtml(item.action) + '</span>',
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
          try {
            const result = await request("/user/mailboxes/" + mailboxId + "/messages");
            state.mailboxMessages = result.messages;
          } catch (error) {
            state.mailboxMessages = [];
          }
          renderMailboxMessages();
        }

        async function loadData(options = {}) {
          try {
            const [domains, tokens, mailboxes] = await Promise.all([
              request("/user/domains"),
              request("/user/api-tokens"),
              request("/user/mailboxes"),
            ]);
            state.userDomains = domains.domains;
            state.tokens = tokens.tokens;
            state.mailboxes = mailboxes.mailboxes;
            state.allDomains = CURRENT_USER.role === "admin" ? state.allDomains : state.userDomains;

            if (CURRENT_USER.role === "admin") {
              const [users, adminDomains, adminMailboxes, adminMessages, adminTokens, audits, cloudflareStatus] = await Promise.all([
                request("/admin/users"),
                request("/admin/domains"),
                request("/admin/mailboxes"),
                request("/admin/messages"),
                request("/admin/api-tokens"),
                request("/admin/audit-logs"),
                request("/admin/cloudflare/status"),
              ]);
              state.users = users.users;
              state.allDomains = adminDomains.domains;
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

            if (options.showToast) {
              window.toast(UI.dashboard.dataLoaded, "ok", 1600);
            }
          } catch (error) {
            window.toast(error.message || UI.common.requestFailed, "error");
          }
        }

        // --- Navigation ---
        document.querySelectorAll(".nav-button").forEach((button) => {
          button.addEventListener("click", () => {
            document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            const panel = button.getAttribute("data-panel");
            document.querySelectorAll("main > section").forEach((section) => section.classList.add("hidden"));
            const target = document.getElementById("panel-" + panel);
            target.classList.remove("hidden");
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        });

        // --- Refresh ---
        document.getElementById("refresh-all").addEventListener("click", (event) => {
          window.withButtonLoading(event.currentTarget, UI.common.refreshing, () => loadData({ showToast: true }));
        });

        // --- Logout ---
        document.getElementById("logout").addEventListener("click", async () => {
          const ok = await window.confirmModal({
            title: UI.common.logoutConfirmTitle,
            body: UI.common.logoutConfirmBody,
            confirmText: UI.common.logoutConfirm,
            cancelText: UI.common.cancel,
            tone: "danger",
          });
          if (!ok) return;
          try {
            await request("/auth/logout", { method: "POST" });
          } catch (error) { /* ignore */ }
          location.href = "/login";
        });

        // --- TTL preset toggle ---
        const ttlPreset = document.getElementById("mailbox-ttl-preset");
        const ttlInput = document.getElementById("mailbox-ttl");
        ttlPreset.addEventListener("change", () => {
          if (ttlPreset.value === "custom") {
            ttlInput.classList.remove("hidden");
            ttlInput.focus();
            ttlInput.select();
          } else {
            ttlInput.classList.add("hidden");
            ttlInput.value = ttlPreset.value;
          }
        });

        // --- Mailbox picker ---
        selectors.mailboxPicker.addEventListener("change", (event) => {
          loadMailboxMessages(event.target.value);
        });

        // --- Revoke user token ---
        selectors.tokenList.addEventListener("click", async (event) => {
          const target = event.target.closest("[data-revoke-token]");
          if (!target) return;
          const name = target.getAttribute("data-token-name") || "";
          const ok = await window.confirmModal({
            title: UI.dashboard.confirmRevokeTokenTitle,
            body: UI.dashboard.confirmRevokeTokenBody + (name ? "\\n\\n" + name : ""),
            confirmText: UI.dashboard.revoke,
            tone: "danger",
          });
          if (!ok) return;
          await window.withButtonLoading(target, UI.dashboard.revoke, async () => {
            try {
              await request("/user/api-tokens/" + target.getAttribute("data-revoke-token"), { method: "DELETE" });
              window.toast(UI.dashboard.tokenRevoked, "ok");
              await loadData();
            } catch (error) {
              window.toast(error.message, "error");
            }
          });
        });

        // --- Admin revoke token ---
        selectors.adminTokenList?.addEventListener("click", async (event) => {
          const target = event.target.closest("[data-admin-revoke-token]");
          if (!target) return;
          const name = target.getAttribute("data-token-name") || "";
          const ok = await window.confirmModal({
            title: UI.dashboard.confirmRevokeTokenTitle,
            body: UI.dashboard.confirmRevokeTokenBody + (name ? "\\n\\n" + name : ""),
            confirmText: UI.dashboard.revoke,
            tone: "danger",
          });
          if (!ok) return;
          await window.withButtonLoading(target, UI.dashboard.revoke, async () => {
            try {
              await request("/admin/api-tokens/" + target.getAttribute("data-admin-revoke-token") + "/revoke", {
                method: "POST",
              });
              window.toast(UI.dashboard.tokenRevoked, "ok");
              await loadData();
            } catch (error) {
              window.toast(error.message, "error");
            }
          });
        });

        // --- Domain actions ---
        selectors.domainList.addEventListener("click", async (event) => {
          const verifyTarget = event.target.closest("[data-verify-domain]");
          if (verifyTarget) {
            const domain = verifyTarget.getAttribute("data-domain-name") || "";
            const ok = await window.confirmModal({
              title: UI.dashboard.confirmMarkActiveTitle,
              body: UI.dashboard.confirmMarkActiveBody + (domain ? "\\n\\n" + domain : ""),
              confirmText: UI.dashboard.markActive,
            });
            if (!ok) return;
            await window.withButtonLoading(verifyTarget, UI.dashboard.markActive, async () => {
              try {
                await request("/admin/domains/" + verifyTarget.getAttribute("data-verify-domain") + "/verify", { method: "POST" });
                window.toast(UI.dashboard.domainVerified, "ok");
                await loadData();
              } catch (error) {
                window.toast(error.message, "error");
              }
            });
            return;
          }

          const configureTarget = event.target.closest("[data-configure-domain]");
          if (configureTarget) {
            const domain = configureTarget.getAttribute("data-domain-name") || "";
            const ok = await window.confirmModal({
              title: UI.dashboard.confirmConfigureCfTitle,
              body: UI.dashboard.confirmConfigureCfBody + (domain ? "\\n\\n" + domain : ""),
              confirmText: UI.dashboard.configureCloudflare,
            });
            if (!ok) return;
            await window.withButtonLoading(configureTarget, UI.dashboard.configureCloudflare, async () => {
              try {
                const result = await request(
                  "/admin/domains/" + configureTarget.getAttribute("data-configure-domain") + "/configure-cloudflare",
                  { method: "POST" },
                );
                window.toast(UI.dashboard.cloudflareConfigured, "ok");
                showFeedback("domain-feedback", UI.dashboard.cloudflareConfigured);
                selectors.opsStatus.innerHTML = '<span class="mono">' + escapeHtml(JSON.stringify(result.cloudflare)) + '</span>';
              } catch (error) {
                const steps = error.payload?.manual_steps;
                const msg = steps?.length ? error.message + " " + steps.join(" ") : error.message;
                window.toast(error.message, "error", 6000);
                showFeedback("domain-feedback", msg, "error");
              }
              await loadData();
            });
          }
        });

        // --- User actions (enable/disable/delete) ---
        selectors.userList.addEventListener("click", async (event) => {
          const toggle = event.target.closest("[data-toggle-user]");
          if (toggle) {
            const nextStatus = toggle.getAttribute("data-next-status");
            const email = toggle.getAttribute("data-user-email") || "";
            const isDisable = nextStatus === "disabled";
            const ok = await window.confirmModal({
              title: isDisable ? UI.dashboard.confirmDisableUserTitle : UI.dashboard.confirmEnableUserTitle,
              body: (isDisable ? UI.dashboard.confirmDisableUserBody : UI.dashboard.confirmEnableUserBody) + (email ? "\\n\\n" + email : ""),
              confirmText: isDisable ? UI.dashboard.disable : UI.dashboard.enable,
              tone: isDisable ? "danger" : "default",
            });
            if (!ok) return;
            await window.withButtonLoading(toggle, isDisable ? UI.dashboard.disable : UI.dashboard.enable, async () => {
              try {
                await request("/admin/users/" + toggle.getAttribute("data-toggle-user"), {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: nextStatus }),
                });
                window.toast(UI.dashboard.userUpdated, "ok");
                await loadData();
              } catch (error) {
                window.toast(error.message, "error");
              }
            });
            return;
          }

          const remove = event.target.closest("[data-delete-user]");
          if (remove) {
            const email = remove.getAttribute("data-user-email") || "";
            const ok = await window.confirmModal({
              title: UI.dashboard.confirmDeleteUserTitle,
              body: UI.dashboard.confirmDeleteUserBody + (email ? "\\n\\n" + email : ""),
              confirmText: UI.dashboard.delete,
              tone: "danger",
            });
            if (!ok) return;
            await window.withButtonLoading(remove, UI.dashboard.delete, async () => {
              try {
                await request("/admin/users/" + remove.getAttribute("data-delete-user"), { method: "DELETE" });
                window.toast(UI.dashboard.userDeleted, "ok");
                await loadData();
              } catch (error) {
                window.toast(error.message, "error");
              }
            });
          }
        });

        // --- Forms ---
        forms.mailbox?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("mailbox-feedback");
          const submitBtn = document.getElementById("mailbox-submit");
          const formData = new FormData(forms.mailbox);
          const ttlSeconds = ttlPreset.value === "custom" ? Number(formData.get("ttl_seconds") || 86400) : Number(ttlPreset.value);
          await window.withButtonLoading(submitBtn, UI.dashboard.creating, async () => {
            try {
              const result = await request("/user/mailboxes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  domain_id: formData.get("domain_id"),
                  prefix: formData.get("prefix"),
                  ttl_seconds: ttlSeconds,
                }),
              });
              const msg = result.email_address + " / " + UI.dashboard.mailboxCreated;
              showFeedback("mailbox-feedback", msg);
              window.toast(msg, "ok");
              forms.mailbox.reset();
              ttlPreset.value = "86400";
              ttlInput.classList.add("hidden");
              ttlInput.value = "86400";
              await loadData();
            } catch (error) {
              showFeedback("mailbox-feedback", error.message, "error");
              window.toast(error.message, "error");
            }
          });
        });

        forms.token?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("token-feedback");
          selectors.tokenSecretWrap.classList.add("hidden");
          const submitBtn = document.getElementById("token-submit");
          const formData = new FormData(forms.token);
          await window.withButtonLoading(submitBtn, UI.dashboard.creating, async () => {
            try {
              const result = await request("/user/api-tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: formData.get("name") }),
              });
              selectors.tokenSecret.textContent = result.value;
              selectors.tokenSecretCopy.setAttribute("data-copy", result.value);
              selectors.tokenSecretWrap.classList.remove("hidden");
              showFeedback("token-feedback", UI.dashboard.tokenCreated);
              window.toast(UI.dashboard.tokenCreated, "ok");
              forms.token.reset();
              await loadData();
            } catch (error) {
              showFeedback("token-feedback", error.message, "error");
              window.toast(error.message, "error");
            }
          });
        });

        forms.domain?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("domain-feedback");
          const submitBtn = document.getElementById("domain-submit");
          const formData = new FormData(forms.domain);
          await window.withButtonLoading(submitBtn, UI.dashboard.creating, async () => {
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
              window.toast(UI.dashboard.domainCreated, "ok");
              forms.domain.reset();
              await loadData();
            } catch (error) {
              showFeedback("domain-feedback", error.message, "error");
              window.toast(error.message, "error");
            }
          });
        });

        forms.assign?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("assign-feedback");
          const submitBtn = document.getElementById("assign-submit");
          const formData = new FormData(forms.assign);
          await window.withButtonLoading(submitBtn, UI.dashboard.creating, async () => {
            try {
              await request("/admin/users/" + formData.get("user_id") + "/domains", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain_id: formData.get("domain_id") }),
              });
              showFeedback("assign-feedback", UI.dashboard.domainAssigned);
              window.toast(UI.dashboard.domainAssigned, "ok");
              await loadData();
            } catch (error) {
              showFeedback("assign-feedback", error.message, "error");
              window.toast(error.message, "error");
            }
          });
        });

        forms.user?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("user-feedback");
          const submitBtn = document.getElementById("user-submit");
          const formData = new FormData(forms.user);
          await window.withButtonLoading(submitBtn, UI.dashboard.creating, async () => {
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
              window.toast(UI.dashboard.userCreated, "ok");
              forms.user.reset();
              await loadData();
            } catch (error) {
              showFeedback("user-feedback", error.message, "error");
              window.toast(error.message, "error");
            }
          });
        });

        forms.cloudflareConfig?.addEventListener("submit", async (event) => {
          event.preventDefault();
          clearFeedback("cloudflare-feedback");
          const submitBtn = document.getElementById("cloudflare-save");
          const formData = new FormData(forms.cloudflareConfig);
          await window.withButtonLoading(submitBtn, UI.common.loading, async () => {
            try {
              await request("/admin/cloudflare/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_token: formData.get("api_token") }),
              });
              showFeedback("cloudflare-feedback", UI.dashboard.cloudflareTokenSaved);
              window.toast(UI.dashboard.cloudflareTokenSaved, "ok");
              forms.cloudflareConfig.reset();
              await loadData();
            } catch (error) {
              showFeedback("cloudflare-feedback", error.message, "error");
              window.toast(error.message, "error");
            }
          });
        });

        document.getElementById("cloudflare-clear")?.addEventListener("click", async (event) => {
          const button = event.currentTarget;
          const ok = await window.confirmModal({
            title: UI.dashboard.confirmClearCloudflareTitle,
            body: UI.dashboard.confirmClearCloudflareBody,
            confirmText: UI.dashboard.clearToken,
            tone: "danger",
          });
          if (!ok) return;
          await window.withButtonLoading(button, UI.common.loading, async () => {
            try {
              await request("/admin/cloudflare/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_token: "" }),
              });
              showFeedback("cloudflare-feedback", UI.dashboard.cloudflareTokenCleared);
              window.toast(UI.dashboard.cloudflareTokenCleared, "ok");
              forms.cloudflareConfig?.reset();
              await loadData();
            } catch (error) {
              showFeedback("cloudflare-feedback", error.message, "error");
              window.toast(error.message, "error");
            }
          });
        });

        // Keyboard: press "r" to refresh dashboard when not typing
        document.addEventListener("keydown", (event) => {
          if (event.key === "r" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const tag = document.activeElement?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            event.preventDefault();
            loadData({ showToast: true });
          }
        });

        loadData();
      </script>
    `,
  });
}

function inboxStatePageHtml(title: string, message: string, locale: Locale, currentPath: string) {
  const ui = getUi(locale);
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
          <div class="button-row">
            <a class="button ghost" href="/">${ui.common.close}</a>
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
            <h1 style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <span class="mono" id="inbox-address">${emailAddress}</span>
              <button type="button" class="button sm ghost" data-copy="${emailAddress}" title="${ui.inbox.copyAddress}">${ui.common.copy}</button>
            </h1>
            <p>
              <span class="live-dot" aria-hidden="true"></span>
              <span class="pill-chip">${ui.inbox.liveLabel}</span>
              <span class="meta" style="margin-left:8px;">${ui.inbox.expires}: <span id="expires-at">${expiresAt}</span></span>
              <span class="meta" id="expires-countdown" style="margin-left:8px;"></span>
            </p>
          </div>
          <div class="button-row">
            <button id="refresh-inbox" class="button" type="button">${ui.inbox.refresh}</button>
          </div>
        </header>
        <div id="inbox-banner" class="inbox-banner hidden" role="status"></div>
        <div id="inbox-error" class="notice error hidden" role="alert"></div>
        <div class="inbox-layout">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>${ui.inbox.messages} <span id="message-count" class="pill-chip">0</span></h2>
                <div class="meta">${ui.inbox.autoRefresh}</div>
              </div>
            </div>
            <div class="search-wrap">
              <input id="message-search" class="input" type="search" placeholder="${ui.inbox.searchMessages}" autocomplete="off" />
            </div>
            <div id="message-list" class="message-list" role="listbox" aria-label="${ui.inbox.messages}"></div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 id="message-subject">${ui.inbox.noMessageSelected}</h2>
                <div id="message-meta" class="meta">${ui.inbox.noMessageHint}</div>
              </div>
            </div>
            <div id="message-view" class="message-body">
              <div class="notice">${ui.inbox.waiting}</div>
            </div>
          </section>
        </div>
      </div>
      <script>
        ${clientRuntimeScript(ui)}

        const INBOX_TOKEN = ${jsonForScript(token)};
        const EXPIRES_AT_RAW = ${jsonForScript(expiresAt)};
        const UI = __UI__;
        let currentMessageId = null;
        let allMessages = [];
        let searchQuery = "";
        const banner = document.getElementById("inbox-banner");
        const countdown = document.getElementById("expires-countdown");

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

        function formatRemaining(ms) {
          if (ms <= 0) return "0s";
          const totalSeconds = Math.floor(ms / 1000);
          const days = Math.floor(totalSeconds / 86400);
          const hours = Math.floor((totalSeconds % 86400) / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;
          if (days > 0) return days + "d " + hours + "h";
          if (hours > 0) return hours + "h " + minutes + "m";
          if (minutes > 0) return minutes + "m " + seconds + "s";
          return seconds + "s";
        }

        function updateExpiryBanner() {
          if (!EXPIRES_AT_RAW) return;
          const expiry = Date.parse(EXPIRES_AT_RAW);
          if (Number.isNaN(expiry)) return;
          const now = Date.now();
          const diff = expiry - now;
          if (diff <= 0) {
            countdown.textContent = "";
            banner.className = "inbox-banner bad";
            banner.textContent = UI.inbox.expiredNotice;
            banner.classList.remove("hidden");
            return;
          }
          countdown.textContent = "(" + UI.inbox.expiresIn + " " + formatRemaining(diff) + ")";
          if (diff < 15 * 60 * 1000) {
            banner.className = "inbox-banner warn";
            banner.textContent = UI.inbox.expiresSoon + " · " + UI.inbox.expiresIn + " " + formatRemaining(diff);
            banner.classList.remove("hidden");
          } else {
            banner.classList.add("hidden");
          }
        }

        function filterMessages() {
          const q = searchQuery.trim().toLowerCase();
          if (!q) return allMessages;
          return allMessages.filter((item) => {
            const subject = (item.subject || "").toLowerCase();
            const sender = (item.from_address || "").toLowerCase();
            return subject.includes(q) || sender.includes(q);
          });
        }

        function renderList() {
          const node = document.getElementById("message-list");
          const filtered = filterMessages();
          document.getElementById("message-count").textContent = String(allMessages.length);

          if (!allMessages.length) {
            node.innerHTML = '<div class="notice"><div class="empty-state">' +
              '<div class="empty-icon">📭</div>' +
              '<div>' + escapeHtml(UI.inbox.noMessages) + '</div>' +
              '<div class="meta" style="margin:0;">' + escapeHtml(UI.inbox.noMessagesHint) + '</div>' +
            '</div></div>';
            return;
          }

          if (!filtered.length) {
            node.innerHTML = '<div class="notice">' + escapeHtml(UI.inbox.searchNoResults) + '</div>';
            return;
          }

          node.innerHTML = filtered.map((item) =>
            '<button class="message-item ' + (item.id === currentMessageId ? "active" : "") + '" data-message-id="' + escapeHtml(item.id) + '" role="option" aria-selected="' + (item.id === currentMessageId) + '">' +
              '<div><strong>' + escapeHtml(item.subject || UI.common.untitled) + '</strong></div>' +
              '<div class="meta">' + escapeHtml(item.from_address || "-") + '</div>' +
              '<div class="meta">' + escapeHtml(item.received_at) + ' · ' + escapeHtml(item.size || 0) + ' ' + UI.inbox.bytes + ' · ' + escapeHtml(item.attachment_count) + ' ' + UI.inbox.attachments + '</div>' +
            '</button>'
          ).join("");
        }

        function renderMessage(result) {
          document.getElementById("message-subject").textContent = result.message.subject || UI.common.untitled;
          document.getElementById("message-meta").textContent =
            (result.message.from_address || "-") + " → " + result.message.to_address + " · " + result.message.received_at;

          const htmlBlock = result.message.html_body
            ? '<div class="panel subpanel"><div class="meta" style="margin-bottom:10px;">' + escapeHtml(UI.inbox.htmlPreview) + '</div><iframe class="mail-html" sandbox srcdoc="' + String(result.message.html_body).replace(/"/g, "&quot;") + '"></iframe></div>'
            : "";
          const textBlock = result.message.text_body
            ? '<div class="panel subpanel"><div class="meta" style="margin-bottom:10px;">' + escapeHtml(UI.inbox.textBody) + '</div><pre class="notice" style="white-space:pre-wrap; margin:0;">' + escapeHtml(result.message.text_body) + '</pre></div>'
            : "";
          const attachments = result.message.attachments?.length
            ? '<div class="attachments">' + result.message.attachments.map((item) =>
                '<a class="attachment-link mono" href="/inbox/' + encodeURIComponent(INBOX_TOKEN) + '/attachments/' + encodeURIComponent(item.id) + '" download>' +
                  escapeHtml(item.filename || item.id) +
                '</a>'
              ).join("") + '</div>'
            : '<div class="notice">' + escapeHtml(UI.inbox.noAttachments) + '</div>';

          document.getElementById("message-view").innerHTML =
            '<div class="panel subpanel">' +
              '<div class="meta">' + escapeHtml(UI.inbox.rawSize) + ' · ' + escapeHtml(result.message.size || 0) + ' ' + escapeHtml(UI.inbox.bytes) + '</div>' +
            '</div>' +
            textBlock +
            htmlBlock +
            attachments;
        }

        async function loadMessages(options = {}) {
          clearInboxError();
          const result = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages");
          const previousCount = allMessages.length;
          allMessages = result.messages || [];
          renderList();

          if (!currentMessageId && allMessages.length) {
            currentMessageId = allMessages[0].id;
          }
          if (currentMessageId) {
            try {
              const detail = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages/" + currentMessageId);
              renderMessage(detail);
              renderList();
            } catch (error) { /* ignore */ }
          }

          if (!options.silent && allMessages.length > previousCount && previousCount > 0) {
            window.toast("+" + (allMessages.length - previousCount) + " ✉", "ok", 2200);
          }
        }

        document.getElementById("message-list").addEventListener("click", async (event) => {
          const button = event.target.closest("[data-message-id]");
          if (!button) return;
          currentMessageId = button.getAttribute("data-message-id");
          renderList();
          try {
            const detail = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages/" + currentMessageId);
            renderMessage(detail);
          } catch (error) {
            showInboxError(error.message);
          }
        });

        document.getElementById("refresh-inbox").addEventListener("click", (event) => {
          window.withButtonLoading(event.currentTarget, UI.inbox.refreshing, async () => {
            try {
              await loadMessages({ silent: false });
            } catch (error) {
              showInboxError(error.message);
            }
          });
        });

        document.getElementById("message-search").addEventListener("input", (event) => {
          searchQuery = event.target.value;
          renderList();
        });

        // Keyboard: j/k to navigate messages, / to focus search
        document.addEventListener("keydown", (event) => {
          const tag = document.activeElement?.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") return;
          if (event.key === "/") {
            event.preventDefault();
            document.getElementById("message-search").focus();
            return;
          }
          if (event.key !== "j" && event.key !== "k") return;
          const filtered = filterMessages();
          if (!filtered.length) return;
          const idx = filtered.findIndex((m) => m.id === currentMessageId);
          let next = idx;
          if (event.key === "j") next = (idx + 1) % filtered.length;
          if (event.key === "k") next = (idx - 1 + filtered.length) % filtered.length;
          const target = filtered[next];
          if (!target) return;
          const btn = document.querySelector('[data-message-id="' + target.id + '"]');
          if (btn) btn.click();
        });

        setInterval(() => { loadMessages({ silent: false }).catch(() => {}); }, 30000);
        setInterval(updateExpiryBanner, 1000);
        updateExpiryBanner();

        loadMessages({ silent: true }).catch((error) => showInboxError(error.message));
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
