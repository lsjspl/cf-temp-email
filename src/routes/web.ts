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
      // 错误类型使用 role="alert" 确保屏幕阅读器立即播报
      if (kind === "error") {
        stack.setAttribute("role", "alert");
        stack.setAttribute("aria-live", "assertive");
      } else {
        stack.setAttribute("role", "status");
        stack.setAttribute("aria-live", "polite");
      }
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
        const card = backdrop.querySelector(".modal-card");
        const confirmBtn = backdrop.querySelector('[data-action="confirm"]');
        confirmBtn.focus();
        const cleanup = (value) => {
          document.removeEventListener("keydown", onKey);
          document.removeEventListener("keydown", trapFocus);
          backdrop.remove();
          resolve(value);
        };
        // Focus trap: keep Tab within the modal
        const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const trapFocus = (event) => {
          if (event.key !== "Tab") return;
          const focusable = Array.from(card.querySelectorAll(focusableSelector));
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey) {
            if (document.activeElement === first) { event.preventDefault(); last.focus(); }
          } else {
            if (document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        };
        const onKey = (event) => {
          if (event.key === "Escape") cleanup(false);
          if (event.key === "Enter" && document.activeElement !== backdrop.querySelector('[data-action="cancel"]')) cleanup(true);
        };
        document.addEventListener("keydown", onKey);
        document.addEventListener("keydown", trapFocus);
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

    // --- Time formatting helpers -------------------------------------------
    window.formatLocalTime = function formatLocalTime(isoString) {
      if (!isoString) return "-";
      try {
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return isoString;
        return d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      } catch (e) { return isoString; }
    };

    window.formatRelativeTime = function formatRelativeTime(isoString) {
      if (!isoString) return "";
      try {
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return "";
        const diff = Date.now() - d.getTime();
        const absDiff = Math.abs(diff);
        const isFuture = diff < 0;
        if (absDiff < 60000) return isFuture ? "即将" : "刚刚";
        if (absDiff < 3600000) { const m = Math.floor(absDiff / 60000); return isFuture ? m + "m later" : m + "m ago"; }
        if (absDiff < 86400000) { const h = Math.floor(absDiff / 3600000); return isFuture ? h + "h later" : h + "h ago"; }
        const days = Math.floor(absDiff / 86400000);
        return isFuture ? days + "d later" : days + "d ago";
      } catch (e) { return ""; }
    };

    window.formatTimeCell = function formatTimeCell(isoString) {
      if (!isoString) return "-";
      const local = window.formatLocalTime(isoString);
      const rel = window.formatRelativeTime(isoString);
      if (!rel) return local;
      return '<span class="time-relative"><span class="time-abs">' + local + '</span><span class="time-rel">' + rel + '</span></span>';
    };
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
                return;
              }
              location.href = "/app";
            } catch (error) {
              setError(error.message || __UI__.login.failed);
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
              <div class="field">
                <label for="confirm-password">${ui.setup.confirmPassword}</label>
                <div class="password-wrap">
                  <input id="confirm-password" name="confirm_password" class="input" type="password" autocomplete="new-password" minlength="8" placeholder="${ui.setup.confirmPasswordPlaceholder}" required />
                  <button type="button" class="password-toggle" data-password-toggle="confirm-password" aria-pressed="false">${ui.common.show}</button>
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
        const confirmPasswordInput = document.getElementById("confirm-password");

        function setError(message) {
          if (!message) {
            errorNode.classList.add("hidden");
            errorNode.textContent = "";
            return;
          }
          errorNode.textContent = message;
          errorNode.classList.remove("hidden");
        }

        [emailInput, usernameInput, passwordInput, confirmPasswordInput].forEach((input) => {
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
          const confirmPassword = confirmPasswordInput.value;

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

          if (password !== confirmPassword) {
            confirmPasswordInput.setAttribute("aria-invalid", "true");
            setError(__UI__.setup.passwordMismatch);
            confirmPasswordInput.focus();
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
                return;
              }
              const result = await response.json().catch(() => null);
              location.href = result?.next_path || "/app";
            } catch (error) {
              setError(error.message || __UI__.setup.failed);
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
          <aside class="panel sidebar" role="navigation" aria-label="Dashboard navigation">
            <button class="nav-button active" type="button" data-panel="overview" aria-current="page">${ui.dashboard.overview}</button>
            <button class="nav-button" type="button" data-panel="domains">${ui.dashboard.domains}</button>
            <button class="nav-button" type="button" data-panel="mailboxes">${ui.dashboard.mailboxes}</button>
            <button class="nav-button" type="button" data-panel="tokens">${ui.dashboard.tokens}</button>
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
              <div class="toolbar-row">
                <div class="search-wrap" style="flex:1; margin-bottom:0;">
                  <input id="mailbox-search" class="input" type="search" placeholder="${ui.common.search}..." autocomplete="off" />
                </div>
                <button id="mailbox-add-btn" class="button primary" type="button">${ui.dashboard.createMailbox}</button>
              </div>
              <div id="mailbox-feedback" class="notice hidden" role="status" style="margin-top:12px;"></div>
              <div id="mailbox-list" class="table-wrap" style="margin-top:12px;"></div>
            </section>

            <section id="panel-tokens" class="panel hidden">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.tokensTitle}</h2>
                  <div class="meta">${ui.dashboard.tokensSubtitle}</div>
                </div>
              </div>
              <div class="toolbar-row">
                <div class="search-wrap" style="flex:1; margin-bottom:0;">
                  <input id="token-search" class="input" type="search" placeholder="${ui.common.search}..." autocomplete="off" />
                </div>
                <button id="token-add-btn" class="button primary" type="button">${ui.dashboard.createToken}</button>
              </div>
              <div id="token-feedback" class="notice hidden" role="status" style="margin-top:12px;"></div>
              <div id="token-list" class="table-wrap" style="margin-top:12px;"></div>
            </section>

            <section id="panel-domains" class="panel hidden">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.domainsTitle}</h2>
                  <div class="meta">${ui.dashboard.domainsSubtitle}</div>
                </div>
              </div>
              <div class="toolbar-row ${user.role === "admin" ? "" : "hidden"}">
                <div class="search-wrap" style="flex:1; margin-bottom:0;">
                  <input id="domain-search" class="input" type="search" placeholder="${ui.common.search}..." autocomplete="off" />
                </div>
                <button id="domain-add-btn" class="button primary" type="button">${ui.dashboard.addDomain}</button>
              </div>
              <div id="domain-feedback" class="notice hidden" role="status" style="margin-top:12px;"></div>
              <div id="domain-list" class="table-wrap" style="margin-top:12px;"></div>
            </section>

            <section id="panel-users" class="panel hidden ${user.role === "admin" ? "" : "hidden"}">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.usersTitle}</h2>
                  <div class="meta">${ui.dashboard.usersSubtitle}</div>
                </div>
              </div>
              <div class="toolbar-row">
                <div class="search-wrap" style="flex:1; margin-bottom:0;">
                  <input id="user-search" class="input" type="search" placeholder="${ui.common.search}..." autocomplete="off" />
                </div>
                <button id="user-add-btn" class="button primary" type="button">${ui.dashboard.createUser}</button>
              </div>
              <div id="user-feedback" class="notice hidden" role="status" style="margin-top:12px;"></div>
              <div id="user-list" class="table-wrap" style="margin-top:12px;"></div>
            </section>

            <section id="panel-ops" class="panel hidden ${user.role === "admin" ? "" : "hidden"}">
              <div class="panel-header">
                <div>
                  <h2>${ui.dashboard.ops}</h2>
                  <div class="meta">${ui.dashboard.operationsSubtitle}</div>
                </div>
              </div>
              <div class="card-grid" style="margin-bottom:16px;">
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
              <div class="ops-tabs" role="tablist">
                <button class="ops-tab active" type="button" data-ops-tab="cloudflare" role="tab" aria-selected="true">${ui.dashboard.opsTabCloudflare}</button>
                <button class="ops-tab" type="button" data-ops-tab="mailboxes" role="tab" aria-selected="false">${ui.dashboard.opsTabMailboxes}</button>
                <button class="ops-tab" type="button" data-ops-tab="messages" role="tab" aria-selected="false">${ui.dashboard.opsTabMessages}</button>
                <button class="ops-tab" type="button" data-ops-tab="tokens" role="tab" aria-selected="false">${ui.dashboard.opsTabTokens}</button>
                <button class="ops-tab" type="button" data-ops-tab="audit" role="tab" aria-selected="false">${ui.dashboard.opsTabAudit}</button>
              </div>
              <div id="ops-tab-cloudflare" class="ops-tab-content active" role="tabpanel">
                <form id="cloudflare-config-form" class="field-grid" novalidate>
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
              </div>
              <div id="ops-tab-mailboxes" class="ops-tab-content" role="tabpanel">
                <div id="admin-mailbox-list" class="table-wrap"></div>
              </div>
              <div id="ops-tab-messages" class="ops-tab-content" role="tabpanel">
                <div id="admin-message-list" class="table-wrap"></div>
              </div>
              <div id="ops-tab-tokens" class="ops-tab-content" role="tabpanel">
                <div id="admin-token-list" class="table-wrap"></div>
              </div>
              <div id="ops-tab-audit" class="ops-tab-content" role="tabpanel">
                <div id="audit-list" class="table-wrap"></div>
              </div>
            </section>
          </main>
        </div>
        <div class="shortcut-bar">
          <span style="font-weight:600;">⌨</span>
          <span class="shortcut-item"><span class="kbd">r</span> ${ui.dashboard.shortcutRefresh}</span>
        </div>
      </div>
      <script>
        ${clientRuntimeScript(ui)}

        const CURRENT_USER = ${jsonForScript(user)};
        const UI = __UI__;
        const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
        const DEFAULT_PAGE_SIZE = 20;
        const AUDIT_DEFAULT_PAGE_SIZE = 50;
        const FULL_PAGE_SIZE = 200;

        // 按需加载：追踪已加载的面板
        const loadedPanels = new Set(["overview"]);
        let currentPanel = "overview";

        function createPagination(pageSize) {
          return { page: 1, pageSize: pageSize || DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 };
        }

        const state = {
          users: [],
          usersAll: [],
          userDomains: [],
          userDomainsAll: [],
          allDomains: [],
          allDomainsAll: [],
          tokens: [],
          mailboxes: [],
          mailboxesAll: [],
          mailboxMessages: [],
          mailboxMessagesMailboxId: "",
          adminMailboxes: [],
          adminMessages: [],
          adminTokens: [],
          audits: [],
          cloudflareStatus: null,
          pagination: {
            users: createPagination(),
            userDomains: createPagination(),
            allDomains: createPagination(),
            tokens: createPagination(),
            mailboxes: createPagination(),
            mailboxMessages: createPagination(),
            adminMailboxes: createPagination(),
            adminMessages: createPagination(),
            adminTokens: createPagination(),
            audits: createPagination(AUDIT_DEFAULT_PAGE_SIZE),
          },
        };

        const selectors = {
          metrics: document.getElementById("metrics"),
          mailboxList: document.getElementById("mailbox-list"),
          tokenList: document.getElementById("token-list"),
          domainList: document.getElementById("domain-list"),
          userList: document.getElementById("user-list"),
          adminMailboxList: document.getElementById("admin-mailbox-list"),
          adminMessageList: document.getElementById("admin-message-list"),
          adminTokenList: document.getElementById("admin-token-list"),
          auditList: document.getElementById("audit-list"),
          opsStatus: document.getElementById("ops-status"),
        };

        const forms = {
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
            // 弹窗提示而非直接跳转，避免丢失未保存内容
            const ok = await window.confirmModal({
              title: UI.common.sessionExpired,
              body: UI.common.sessionExpired,
              confirmText: UI.common.confirm,
              cancelText: UI.common.cancel,
              tone: "danger",
            });
            if (ok) location.href = "/login";
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

        function formatPaginationSummary(meta) {
          return UI.common.pagination.summary
            .replace("{page}", String(meta.page))
            .replace("{totalPages}", String(Math.max(1, meta.totalPages || 1)))
            .replace("{total}", String(meta.total || 0));
        }

        function renderPagination(key) {
          const meta = state.pagination[key];
          if (!meta) return "";
          const totalPages = Math.max(1, meta.totalPages || 1);
          const page = Math.min(Math.max(1, meta.page || 1), totalPages);
          const disabledPrev = page <= 1 ? " disabled" : "";
          const disabledNext = page >= totalPages ? " disabled" : "";

          const sizeOptions = PAGE_SIZE_OPTIONS
            .map((size) => '<option value="' + size + '"' + (size === meta.pageSize ? " selected" : "") + '>' + size + '</option>')
            .join("");

          return '<div class="pagination">' +
            '<div class="pagination-summary">' + escapeHtml(formatPaginationSummary({
              page,
              totalPages,
              total: meta.total,
            })) + '</div>' +
            '<div class="pagination-controls">' +
              '<label class="pagination-summary" style="margin-right:4px;">' + escapeHtml(UI.common.pagination.pageSize) + '</label>' +
              '<select class="page-size-select" data-page-size="' + escapeAttr(key) + '">' + sizeOptions + '</select>' +
              '<button type="button" class="button sm ghost" data-page-action="first" data-page-key="' + escapeAttr(key) + '"' + disabledPrev + '>' + escapeHtml(UI.common.pagination.first) + '</button>' +
              '<button type="button" class="button sm ghost" data-page-action="prev" data-page-key="' + escapeAttr(key) + '"' + disabledPrev + '>' + escapeHtml(UI.common.pagination.prev) + '</button>' +
              '<input type="number" min="1" max="' + totalPages + '" value="' + page + '" class="page-jump" data-page-jump="' + escapeAttr(key) + '" aria-label="' + escapeAttr(UI.common.pagination.jumpTo) + '" />' +
              '<button type="button" class="button sm ghost" data-page-action="next" data-page-key="' + escapeAttr(key) + '"' + disabledNext + '>' + escapeHtml(UI.common.pagination.next) + '</button>' +
              '<button type="button" class="button sm ghost" data-page-action="last" data-page-key="' + escapeAttr(key) + '"' + disabledNext + '>' + escapeHtml(UI.common.pagination.last) + '</button>' +
            '</div>' +
          '</div>';
        }

        function renderTableWithPagination(paginationKey, headers, rows, emptyHint) {
          return renderTable(headers, rows, emptyHint) + renderPagination(paginationKey);
        }

        function renderMetrics() {
          const cards = CURRENT_USER.role === "admin"
            ? [
                { label: UI.dashboard.metricUsers, value: state.pagination.users.total || state.users.length },
                { label: UI.dashboard.metricDomains, value: state.pagination.allDomains.total || state.allDomains.length },
                { label: UI.dashboard.allMailboxes, value: state.pagination.adminMailboxes.total || state.adminMailboxes.length },
                { label: UI.dashboard.allMessages, value: state.pagination.adminMessages.total || state.adminMessages.length },
              ]
            : [
                { label: UI.dashboard.metricMyDomains, value: state.pagination.userDomains.total || state.userDomains.length },
                { label: UI.dashboard.metricMyTokens, value: state.pagination.tokens.total || state.tokens.length },
                { label: UI.dashboard.metricMyMailboxes, value: state.pagination.mailboxes.total || state.mailboxes.length },
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

        function timeCell(isoString) {
          return window.formatTimeCell(isoString);
        }

        function expiresCell(isoString) {
          if (!isoString) return "-";
          const local = window.formatLocalTime(isoString);
          const rel = window.formatRelativeTime(isoString);
          return '<span class="time-relative"><span class="time-abs">' + escapeHtml(local) + '</span><span class="time-rel">' + escapeHtml(rel) + '</span></span>';
        }

        function renderMailboxes() {
          selectors.mailboxList.innerHTML = renderTableWithPagination(
            "mailboxes",
            [UI.dashboard.email, UI.dashboard.status, UI.inbox.expires, UI.dashboard.accessLink],
            state.mailboxes.map((item) => [
              copyableMono(item.email_address),
              formatTag(item.status),
              expiresCell(item.expires_at),
              item.encrypted_access_url
                ? '<span class="copy-group"><a class="button sm ghost" href="' + escapeAttr(item.encrypted_access_url) + '" target="_blank" rel="noreferrer">' + escapeHtml(UI.common.open) + '</a>' +
                  '<button type="button" class="copy-btn" data-copy="' + escapeAttr(item.encrypted_access_url) + '">' + escapeHtml(UI.common.copy) + '</button></span>'
                : "-",
            ]),
          );
        }

        function renderTokenList() {
          selectors.tokenList.innerHTML = renderTableWithPagination(
            "tokens",
            [UI.dashboard.name, UI.dashboard.prefix, UI.dashboard.status, UI.dashboard.lastUsed, UI.dashboard.actions],
            state.tokens.map((item) => [
              escapeHtml(item.name),
              '<span class="mono">' + escapeHtml(item.token_prefix) + '</span>',
              formatTag(item.status),
              timeCell(item.last_used_at),
              item.status === "revoked"
                ? '<span class="muted">' + escapeHtml(translateLabel("revoked")) + '</span>'
                : '<button class="button sm danger" type="button" data-revoke-token="' + escapeAttr(item.id) + '" data-token-name="' + escapeAttr(item.name) + '">' + escapeHtml(UI.dashboard.revoke) + '</button>',
            ]),
          );
        }

        function renderDomainList() {
          const paginationKey = CURRENT_USER.role === "admin" ? "allDomains" : "userDomains";
          const visibleDomains = CURRENT_USER.role === "admin" ? state.allDomains : state.userDomains;
          selectors.domainList.innerHTML = renderTableWithPagination(
            paginationKey,
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
        }

        function renderUsers() {
          selectors.userList.innerHTML = renderTableWithPagination(
            "users",
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
              const assignBtn = CURRENT_USER.role === "admin"
                ? '<button class="button sm" type="button" data-assign-domain-user="' + escapeAttr(item.id) + '" data-user-email="' + escapeAttr(item.email) + '">' + escapeHtml(UI.dashboard.assignDomainAction) + '</button>'
                : "";
              return [
                escapeHtml(item.email) + (isSelf ? ' <span class="pill-chip">' + escapeHtml(UI.dashboard.youBadge) + '</span>' : ''),
                formatTag(item.role),
                formatTag(item.status),
                timeCell(item.last_login_at),
                '<div class="inline-actions">' + assignBtn + toggleBtn + deleteBtn + '</div>',
              ];
            }),
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

          selectors.adminMailboxList.innerHTML = renderTableWithPagination(
            "adminMailboxes",
            [UI.dashboard.mailbox, UI.dashboard.owner, UI.dashboard.domain, UI.dashboard.status, UI.inbox.expires],
            state.adminMailboxes.map((item) => [
              copyableMono(item.email_address),
              escapeHtml(item.user_email || "-"),
              escapeHtml(item.domain || "-"),
              formatTag(item.status),
              expiresCell(item.expires_at),
            ]),
          );

          selectors.adminMessageList.innerHTML = renderTableWithPagination(
            "adminMessages",
            [UI.dashboard.to, UI.dashboard.from, UI.dashboard.subject, UI.dashboard.received, UI.dashboard.size, UI.dashboard.owner],
            state.adminMessages.map((item) => [
              copyableMono(item.to_address),
              escapeHtml(item.from_address || "-"),
              escapeHtml(item.subject || UI.common.untitled),
              timeCell(item.received_at),
              escapeHtml(String(item.size ?? 0)),
              escapeHtml(item.owner_email || "-"),
            ]),
          );

          selectors.adminTokenList.innerHTML = renderTableWithPagination(
            "adminTokens",
            [UI.dashboard.assignUser, UI.dashboard.name, UI.dashboard.prefix, UI.dashboard.status, UI.dashboard.lastUsed, UI.dashboard.revoked, UI.dashboard.action],
            state.adminTokens.map((item) => [
              escapeHtml(item.user_email || "-"),
              escapeHtml(item.name),
              '<span class="mono">' + escapeHtml(item.token_prefix) + '</span>',
              formatTag(item.status),
              timeCell(item.last_used_at),
              timeCell(item.revoked_at),
              item.status === "revoked"
                ? '<span class="muted">' + escapeHtml(translateLabel("revoked")) + '</span>'
                : '<button class="button sm danger" type="button" data-admin-revoke-token="' + escapeAttr(item.id) + '" data-token-name="' + escapeAttr(item.name) + '">' + escapeHtml(UI.dashboard.revoke) + '</button>',
            ]),
          );

          selectors.auditList.innerHTML = renderTableWithPagination(
            "audits",
            [UI.dashboard.time, UI.dashboard.action, UI.dashboard.actor, UI.dashboard.target, UI.dashboard.metadata],
            state.audits.map((item) => [
              timeCell(item.created_at),
              '<span class="pill-chip">' + escapeHtml(item.action) + '</span>',
              escapeHtml(item.actor_user_id || "-"),
              escapeHtml([item.target_type, item.target_id].filter(Boolean).join(": ") || "-"),
              '<span class="mono">' + escapeHtml(item.metadata_json || "-") + '</span>',
            ]),
          );
        }

        function buildQuery(key) {
          const meta = state.pagination[key];
          if (!meta) return "";
          const params = new URLSearchParams();
          params.set("page", String(meta.page));
          params.set("page_size", String(meta.pageSize));
          return "?" + params.toString();
        }

        function applyPaginationMeta(key, payload) {
          const meta = state.pagination[key];
          if (!meta || !payload) return;
          meta.page = payload.page ?? meta.page;
          meta.pageSize = payload.page_size ?? meta.pageSize;
          meta.total = payload.total ?? meta.total;
          meta.totalPages = Math.max(1, payload.total_pages ?? 1);
        }

        async function reloadUserDomains() {
          const result = await request("/user/domains" + buildQuery("userDomains"));
          state.userDomains = result.domains;
          applyPaginationMeta("userDomains", result.pagination);
          if (CURRENT_USER.role !== "admin") {
            state.allDomains = state.userDomains;
          }
          try {
            const all = await request("/user/domains?page=1&page_size=" + FULL_PAGE_SIZE);
            state.userDomainsAll = all.domains || [];
          } catch (error) {
            state.userDomainsAll = [];
          }
          renderDomainList();
          renderMailboxes();
          renderMetrics();
        }

        async function reloadTokens() {
          const result = await request("/user/api-tokens" + buildQuery("tokens"));
          state.tokens = result.tokens;
          applyPaginationMeta("tokens", result.pagination);
          renderTokenList();
          renderMetrics();
        }

        async function reloadMailboxes() {
          const result = await request("/user/mailboxes" + buildQuery("mailboxes"));
          state.mailboxes = result.mailboxes;
          applyPaginationMeta("mailboxes", result.pagination);
          try {
            const all = await request("/user/mailboxes?page=1&page_size=" + FULL_PAGE_SIZE);
            state.mailboxesAll = all.mailboxes || [];
          } catch (error) {
            state.mailboxesAll = [];
          }
          renderMailboxes();
          renderMetrics();
        }

        async function reloadAdminUsers() {
          const result = await request("/admin/users" + buildQuery("users"));
          state.users = result.users;
          applyPaginationMeta("users", result.pagination);
          try {
            const all = await request("/admin/users?page=1&page_size=" + FULL_PAGE_SIZE);
            state.usersAll = all.users || [];
          } catch (error) {
            state.usersAll = [];
          }
          renderUsers();
          renderMetrics();
        }

        async function reloadAdminDomains() {
          const result = await request("/admin/domains" + buildQuery("allDomains"));
          state.allDomains = result.domains;
          applyPaginationMeta("allDomains", result.pagination);
          try {
            const all = await request("/admin/domains?page=1&page_size=" + FULL_PAGE_SIZE);
            state.allDomainsAll = all.domains || [];
          } catch (error) {
            state.allDomainsAll = [];
          }
          renderDomainList();
          renderMetrics();
        }

        async function reloadAdminMailboxes() {
          const result = await request("/admin/mailboxes" + buildQuery("adminMailboxes"));
          state.adminMailboxes = result.mailboxes;
          applyPaginationMeta("adminMailboxes", result.pagination);
          renderOps();
          renderMetrics();
        }

        async function reloadAdminMessages() {
          const result = await request("/admin/messages" + buildQuery("adminMessages"));
          state.adminMessages = result.messages;
          applyPaginationMeta("adminMessages", result.pagination);
          renderOps();
          renderMetrics();
        }

        async function reloadAdminTokens() {
          const result = await request("/admin/api-tokens" + buildQuery("adminTokens"));
          state.adminTokens = result.tokens;
          applyPaginationMeta("adminTokens", result.pagination);
          renderOps();
          renderMetrics();
        }

        async function reloadAudits() {
          const result = await request("/admin/audit-logs" + buildQuery("audits"));
          state.audits = result.audit_logs;
          applyPaginationMeta("audits", result.pagination);
          renderOps();
        }

        const listReloaders = {
          userDomains: reloadUserDomains,
          allDomains: reloadAdminDomains,
          tokens: reloadTokens,
          mailboxes: reloadMailboxes,
          users: reloadAdminUsers,
          adminMailboxes: reloadAdminMailboxes,
          adminMessages: reloadAdminMessages,
          adminTokens: reloadAdminTokens,
          audits: reloadAudits,
        };

        async function loadData(options = {}) {
          try {
            // 按需加载：只加载当前面板需要的数据
            await loadPanelData(currentPanel);

            if (options.showToast) {
              window.toast(UI.dashboard.dataLoaded, "ok", 1600);
            }
          } catch (error) {
            window.toast(error.message || UI.common.requestFailed, "error");
          }
        }

        async function loadPanelData(panel) {
          switch (panel) {
            case "overview":
              await Promise.all([
                reloadUserDomains(),
                reloadTokens(),
                reloadMailboxes(),
                ...(CURRENT_USER.role === "admin" ? [
                  reloadAdminUsers(),
                  reloadAdminDomains(),
                  reloadAdminMailboxes(),
                  reloadAdminMessages(),
                ] : []),
              ]);
              renderMetrics();
              break;
            case "mailboxes":
              await Promise.all([reloadUserDomains(), reloadMailboxes()]);
              break;
            case "tokens":
              await reloadTokens();
              break;
            case "domains":
              if (CURRENT_USER.role === "admin") {
                await Promise.all([reloadAdminDomains(), reloadAdminUsers()]);
              } else {
                await reloadUserDomains();
              }
              break;
            case "users":
              if (CURRENT_USER.role === "admin") await reloadAdminUsers();
              break;
            case "ops":
              if (CURRENT_USER.role === "admin") {
                await Promise.all([
                  reloadAdminMailboxes(),
                  reloadAdminMessages(),
                  reloadAdminTokens(),
                  reloadAudits(),
                  request("/admin/cloudflare/status").then((payload) => {
                    state.cloudflareStatus = payload;
                  }).catch(() => {}),
                ]);
                renderOps();
              }
              break;
          }
        }

        async function loadAllData(options = {}) {
          try {
            await Promise.all([
              reloadUserDomains(),
              reloadTokens(),
              reloadMailboxes(),
            ]);

            if (CURRENT_USER.role === "admin") {
              await Promise.all([
                reloadAdminUsers(),
                reloadAdminDomains(),
                reloadAdminMailboxes(),
                reloadAdminMessages(),
                reloadAdminTokens(),
                reloadAudits(),
                request("/admin/cloudflare/status").then((payload) => {
                  state.cloudflareStatus = payload;
                }).catch(() => {}),
              ]);
            }

            renderMetrics();
            renderMailboxes();
            renderTokenList();
            renderDomainList();
            renderUsers();
            renderOps();

            if (options.showToast) {
              window.toast(UI.dashboard.dataLoaded, "ok", 1600);
            }
          } catch (error) {
            window.toast(error.message || UI.common.requestFailed, "error");
          }
        }

        // --- Navigation ---
        document.querySelectorAll(".nav-button").forEach((button) => {
          button.addEventListener("click", async () => {
            document.querySelectorAll(".nav-button").forEach((item) => {
              item.classList.remove("active");
              item.removeAttribute("aria-current");
            });
            button.classList.add("active");
            button.setAttribute("aria-current", "page");
            const panel = button.getAttribute("data-panel");
            currentPanel = panel;
            document.querySelectorAll("main > section").forEach((section) => section.classList.add("hidden"));
            const target = document.getElementById("panel-" + panel);
            target.classList.remove("hidden");
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            // 按需加载：首次切换到面板时加载数据
            if (!loadedPanels.has(panel)) {
              loadedPanels.add(panel);
              await loadPanelData(panel);
            }
          });
        });

        // --- Refresh ---
        document.getElementById("refresh-all").addEventListener("click", (event) => {
          window.withButtonLoading(event.currentTarget, UI.common.refreshing, () => loadAllData({ showToast: true }));
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

        // --- TTL preset toggle (used in mailbox modal) ---
        function handleTtlPresetChange(presetEl, inputEl) {
          if (presetEl.value === "custom") {
            inputEl.classList.remove("hidden");
            inputEl.focus();
          } else {
            inputEl.classList.add("hidden");
            inputEl.value = presetEl.value;
          }
        }

        // --- Mailbox add button (modal) ---
        document.getElementById("mailbox-add-btn")?.addEventListener("click", async () => {
          const domainOptionsSource = state.userDomainsAll.length ? state.userDomainsAll : state.userDomains;
          if (domainOptionsSource.length === 0) {
            window.toast(UI.dashboard.noDomainsAvailable, "warn");
            return;
          }
          const domainOptions = domainOptionsSource.map((d) =>
            '<option value="' + escapeAttr(d.id) + '">' + escapeHtml(d.domain) + '</option>'
          ).join("");
          const bodyNode = document.createElement("div");
          bodyNode.innerHTML =
            '<div class="field-grid">' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.domain) + '</label><select class="select" id="modal-mailbox-domain">' + domainOptions + '</select></div>' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.prefix) + ' <span class="field-hint">' + escapeHtml(UI.dashboard.prefixHint) + '</span></label><input class="input" id="modal-mailbox-prefix" placeholder="' + escapeAttr(UI.dashboard.prefixPlaceholder) + '" /></div>' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.ttlSeconds) + '</label><select class="select" id="modal-mailbox-ttl-preset"><option value="3600">' + escapeHtml(UI.dashboard.ttlPreset1h) + '</option><option value="21600">' + escapeHtml(UI.dashboard.ttlPreset6h) + '</option><option value="86400" selected>' + escapeHtml(UI.dashboard.ttlPreset1d) + '</option><option value="604800">' + escapeHtml(UI.dashboard.ttlPreset7d) + '</option><option value="custom">' + escapeHtml(UI.dashboard.ttlCustom) + '</option></select><input class="input hidden" id="modal-mailbox-ttl" type="number" min="60" value="86400" /></div>' +
            '</div>';
          // TTL toggle inside modal
          setTimeout(() => {
            const preset = document.getElementById("modal-mailbox-ttl-preset");
            const ttlInput = document.getElementById("modal-mailbox-ttl");
            if (preset && ttlInput) preset.addEventListener("change", () => handleTtlPresetChange(preset, ttlInput));
          }, 50);
          const ok = await window.confirmModal({
            title: UI.dashboard.createMailbox,
            body: bodyNode,
            confirmText: UI.dashboard.createMailbox,
            cancelText: UI.common.cancel,
          });
          if (!ok) return;
          const domainId = document.getElementById("modal-mailbox-domain")?.value;
          const prefix = document.getElementById("modal-mailbox-prefix")?.value?.trim();
          const presetVal = document.getElementById("modal-mailbox-ttl-preset")?.value;
          const ttlSeconds = presetVal === "custom" ? Number(document.getElementById("modal-mailbox-ttl")?.value || 86400) : Number(presetVal);
          try {
            const result = await request("/user/mailboxes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domain_id: domainId, prefix: prefix || undefined, ttl_seconds: ttlSeconds }),
            });
            window.toast(result.email_address + " " + UI.dashboard.mailboxCreated, "ok");
            await loadData();
          } catch (error) {
            showFeedback("mailbox-feedback", error.message, "error");
          }
        });

        // --- Mailbox search ---
        document.getElementById("mailbox-search")?.addEventListener("input", (event) => {
          const q = event.target.value.trim().toLowerCase();
          const rows = selectors.mailboxList?.querySelectorAll("tbody tr") || [];
          rows.forEach((row) => {
            const text = row.textContent.toLowerCase();
            row.style.display = q && !text.includes(q) ? "none" : "";
          });
        });

        // --- Pagination controls ---
        async function handlePaginationChange(key) {
          const reload = listReloaders[key];
          if (!reload) return;
          try {
            await reload();
          } catch (error) {
            window.toast(error.message || UI.common.requestFailed, "error");
          }
        }

        document.addEventListener("click", async (event) => {
          const target = event.target.closest("[data-page-action]");
          if (!target || target.disabled) return;
          const key = target.getAttribute("data-page-key");
          const action = target.getAttribute("data-page-action");
          const meta = state.pagination[key];
          if (!meta) return;
          const totalPages = Math.max(1, meta.totalPages || 1);
          let next = meta.page;
          if (action === "first") next = 1;
          else if (action === "prev") next = Math.max(1, meta.page - 1);
          else if (action === "next") next = Math.min(totalPages, meta.page + 1);
          else if (action === "last") next = totalPages;
          if (next === meta.page) return;
          meta.page = next;
          await handlePaginationChange(key);
        });

        document.addEventListener("change", async (event) => {
          const sizeTarget = event.target.closest("[data-page-size]");
          if (sizeTarget) {
            const key = sizeTarget.getAttribute("data-page-size");
            const meta = state.pagination[key];
            if (!meta) return;
            const nextSize = Number.parseInt(sizeTarget.value, 10);
            if (!Number.isInteger(nextSize) || nextSize <= 0) return;
            meta.pageSize = nextSize;
            meta.page = 1;
            await handlePaginationChange(key);
          }
        });

        document.addEventListener("keydown", async (event) => {
          if (event.key !== "Enter") return;
          const jumpTarget = event.target.closest("[data-page-jump]");
          if (!jumpTarget) return;
          event.preventDefault();
          const key = jumpTarget.getAttribute("data-page-jump");
          const meta = state.pagination[key];
          if (!meta) return;
          const totalPages = Math.max(1, meta.totalPages || 1);
          const target = Math.min(totalPages, Math.max(1, Number.parseInt(jumpTarget.value, 10) || 1));
          if (target === meta.page) return;
          meta.page = target;
          await handlePaginationChange(key);
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
        // (user toggle/delete/assign are handled in the combined userList click handler above)

        // --- Token add button (modal) ---
        document.getElementById("token-add-btn")?.addEventListener("click", async () => {
          const bodyNode = document.createElement("div");
          bodyNode.innerHTML =
            '<div class="field-grid">' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.name) + '</label><input class="input" id="modal-token-name" placeholder="' + escapeAttr(UI.dashboard.namePlaceholder) + '" /></div>' +
            '</div>';
          const ok = await window.confirmModal({
            title: UI.dashboard.createToken,
            body: bodyNode,
            confirmText: UI.dashboard.createToken,
            cancelText: UI.common.cancel,
          });
          if (!ok) return;
          const name = document.getElementById("modal-token-name")?.value?.trim();
          if (!name) { window.toast(UI.common.requestFailed, "error"); return; }
          try {
            const result = await request("/user/api-tokens", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            // 用模态弹窗强制展示 Token 明文
            const secretNode = document.createElement("div");
            secretNode.innerHTML = '<p style="margin:0 0 10px;">' + escapeHtml(UI.dashboard.tokenSecretWarning) + '</p>' +
              '<div class="mono" style="user-select:all; padding:10px; background:rgba(255,255,255,0.04); border-radius:6px; word-break:break-all;">' + escapeHtml(result.value) + '</div>';
            const copyBtn = document.createElement("button");
            copyBtn.className = "button sm ghost";
            copyBtn.textContent = UI.common.copy;
            copyBtn.style.marginTop = "10px";
            copyBtn.addEventListener("click", async () => {
              const copied = await window.copyToClipboard(result.value);
              if (copied) { copyBtn.textContent = UI.common.copied; window.toast(UI.common.copied, "ok", 1200); }
            });
            secretNode.appendChild(copyBtn);
            await window.confirmModal({
              title: UI.dashboard.tokenCreated,
              body: secretNode,
              confirmText: UI.common.close,
              cancelText: UI.common.copy,
            });
            window.toast(UI.dashboard.tokenCreated, "ok");
            await loadData();
          } catch (error) {
            showFeedback("token-feedback", error.message, "error");
          }
        });

        // --- Token search ---
        document.getElementById("token-search")?.addEventListener("input", (event) => {
          const q = event.target.value.trim().toLowerCase();
          const rows = selectors.tokenList?.querySelectorAll("tbody tr") || [];
          rows.forEach((row) => {
            const text = row.textContent.toLowerCase();
            row.style.display = q && !text.includes(q) ? "none" : "";
          });
        });

        // --- Domain add button (modal) ---
        document.getElementById("domain-add-btn")?.addEventListener("click", async () => {
          const bodyNode = document.createElement("div");
          bodyNode.innerHTML =
            '<div class="field-grid">' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.domain) + '</label><input class="input" id="modal-domain-name" placeholder="' + escapeAttr(UI.dashboard.domainPlaceholder) + '" /></div>' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.type) + '</label><select class="select" id="modal-domain-type"><option value="subdomain">' + escapeHtml(UI.dashboard.statusLabels.subdomain) + '</option><option value="root">' + escapeHtml(UI.dashboard.statusLabels.root) + '</option></select></div>' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.status) + '</label><select class="select" id="modal-domain-status"><option value="pending">' + escapeHtml(UI.dashboard.statusLabels.pending) + '</option><option value="active">' + escapeHtml(UI.dashboard.statusLabels.active) + '</option></select></div>' +
            '</div>';
          const ok = await window.confirmModal({
            title: UI.dashboard.addDomain,
            body: bodyNode,
            confirmText: UI.dashboard.addDomain,
            cancelText: UI.common.cancel,
          });
          if (!ok) return;
          const domain = document.getElementById("modal-domain-name")?.value?.trim();
          const type = document.getElementById("modal-domain-type")?.value;
          const status = document.getElementById("modal-domain-status")?.value;
          if (!domain) { window.toast(UI.common.requestFailed, "error"); return; }
          try {
            await request("/admin/domains", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domain, type, status }),
            });
            window.toast(UI.dashboard.domainCreated, "ok");
            await loadData();
          } catch (error) {
            showFeedback("domain-feedback", error.message, "error");
          }
        });

        // --- Domain search ---
        document.getElementById("domain-search")?.addEventListener("input", (event) => {
          const q = event.target.value.trim().toLowerCase();
          const rows = selectors.domainList?.querySelectorAll("tbody tr") || [];
          rows.forEach((row) => {
            const text = row.textContent.toLowerCase();
            row.style.display = q && !text.includes(q) ? "none" : "";
          });
        });

        // --- User add button (modal) ---
        document.getElementById("user-add-btn")?.addEventListener("click", async () => {
          const bodyNode = document.createElement("div");
          bodyNode.innerHTML =
            '<div class="field-grid">' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.email) + '</label><input class="input" id="modal-user-email" type="email" /></div>' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.username) + '</label><input class="input" id="modal-user-username" /></div>' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.password) + '</label><input class="input" id="modal-user-password" type="password" minlength="8" /></div>' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.confirmPassword) + '</label><input class="input" id="modal-user-confirm-password" type="password" minlength="8" /></div>' +
              '<div class="field"><label>' + escapeHtml(UI.dashboard.role) + '</label><select class="select" id="modal-user-role"><option value="user">' + escapeHtml(UI.dashboard.statusLabels.user) + '</option><option value="admin">' + escapeHtml(UI.dashboard.statusLabels.admin) + '</option></select></div>' +
            '</div>';
          const ok = await window.confirmModal({
            title: UI.dashboard.createUser,
            body: bodyNode,
            confirmText: UI.dashboard.createUser,
            cancelText: UI.common.cancel,
          });
          if (!ok) return;
          const email = document.getElementById("modal-user-email")?.value?.trim();
          const username = document.getElementById("modal-user-username")?.value?.trim();
          const password = document.getElementById("modal-user-password")?.value;
          const confirmPassword = document.getElementById("modal-user-confirm-password")?.value;
          const role = document.getElementById("modal-user-role")?.value;
          if (!email || !username || !password) { window.toast(UI.common.requestFailed, "error"); return; }
          if (password !== confirmPassword) { window.toast(UI.dashboard.passwordMismatch, "error"); return; }
          try {
            await request("/admin/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, username, password, role }),
            });
            window.toast(UI.dashboard.userCreated, "ok");
            await loadData();
          } catch (error) {
            showFeedback("user-feedback", error.message, "error");
          }
        });

        // --- User search ---
        document.getElementById("user-search")?.addEventListener("input", (event) => {
          const q = event.target.value.trim().toLowerCase();
          const rows = selectors.userList?.querySelectorAll("tbody tr") || [];
          rows.forEach((row) => {
            const text = row.textContent.toLowerCase();
            row.style.display = q && !text.includes(q) ? "none" : "";
          });
        });

        // --- Assign domain to user (from user list) ---
        selectors.userList.addEventListener("click", async (event) => {
          const assignBtn = event.target.closest("[data-assign-domain-user]");
          if (assignBtn) {
            const userId = assignBtn.getAttribute("data-assign-domain-user");
            const userEmail = assignBtn.getAttribute("data-user-email") || "";
            const adminDomainSource = state.allDomainsAll.length ? state.allDomainsAll : state.allDomains;
            const activeDomains = adminDomainSource.filter((d) => d.status === "active");
            if (activeDomains.length === 0) {
              window.toast(UI.dashboard.noActiveDomains, "warn");
              return;
            }
            const domainOptions = activeDomains.map((d) =>
              '<option value="' + escapeAttr(d.id) + '">' + escapeHtml(d.domain) + '</option>'
            ).join("");
            const bodyNode = document.createElement("div");
            bodyNode.innerHTML =
              '<div class="field-grid">' +
                '<div class="field"><label>' + escapeHtml(UI.dashboard.assignUser) + '</label><div class="mono">' + escapeHtml(userEmail) + '</div></div>' +
                '<div class="field"><label>' + escapeHtml(UI.dashboard.assignDomain) + '</label><select class="select" id="modal-assign-domain">' + domainOptions + '</select></div>' +
              '</div>';
            const ok = await window.confirmModal({
              title: UI.dashboard.assignDomainAction,
              body: bodyNode,
              confirmText: UI.dashboard.assignDomainAction,
              cancelText: UI.common.cancel,
            });
            if (!ok) return;
            const domainId = document.getElementById("modal-assign-domain")?.value;
            if (!domainId) return;
            try {
              await request("/admin/users/" + userId + "/domains", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain_id: domainId }),
              });
              window.toast(UI.dashboard.domainAssigned, "ok");
              await loadData();
            } catch (error) {
              window.toast(error.message, "error");
            }
            return;
          }

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
            loadAllData({ showToast: true });
          }
        });

        // --- Ops sub-tabs ---
        document.querySelectorAll(".ops-tab").forEach((tab) => {
          tab.addEventListener("click", () => {
            document.querySelectorAll(".ops-tab").forEach((t) => {
              t.classList.remove("active");
              t.setAttribute("aria-selected", "false");
            });
            tab.classList.add("active");
            tab.setAttribute("aria-selected", "true");
            const target = tab.getAttribute("data-ops-tab");
            document.querySelectorAll(".ops-tab-content").forEach((c) => c.classList.remove("active"));
            const panel = document.getElementById("ops-tab-" + target);
            if (panel) panel.classList.add("active");
          });
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
              <input id="message-search" class="input" type="search" placeholder="${ui.inbox.searchMessages} ${ui.inbox.searchCurrentPageOnly}" autocomplete="off" />
            </div>
            <div id="message-list" class="message-list" role="listbox" aria-label="${ui.inbox.messages}"></div>
            <div id="message-pagination"></div>
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
        <div class="shortcut-bar">
          <span style="font-weight:600;">${ui.dashboard.shortcutHint}:</span>
          <span class="shortcut-item"><span class="kbd">j</span>/<span class="kbd">k</span> ${ui.dashboard.shortcutNav}</span>
          <span class="shortcut-item"><span class="kbd">/</span> ${ui.dashboard.shortcutSearch}</span>
        </div>
      </div>
      <script>
        ${clientRuntimeScript(ui)}

        const INBOX_TOKEN = ${jsonForScript(token)};
        const EXPIRES_AT_RAW = ${jsonForScript(expiresAt)};
        const UI = __UI__;
        const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
        let currentMessageId = null;
        let allMessages = [];
        let seenMessageIds = new Set();
        let searchQuery = "";
        let lastInteractionTime = Date.now();
        const pagination = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
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
          document.getElementById("message-count").textContent = String(pagination.total || allMessages.length);

          if (!allMessages.length) {
            node.innerHTML = '<div class="notice"><div class="empty-state">' +
              '<div class="empty-icon">📭</div>' +
              '<div>' + escapeHtml(UI.inbox.noMessages) + '</div>' +
              '<div class="meta" style="margin:0;">' + escapeHtml(UI.inbox.noMessagesHint) + '</div>' +
            '</div></div>';
            document.getElementById("message-pagination").innerHTML = "";
            return;
          }

          if (!filtered.length) {
            node.innerHTML = '<div class="notice">' + escapeHtml(UI.inbox.searchNoResults) + '</div>';
            document.getElementById("message-pagination").innerHTML = "";
            return;
          }

          node.innerHTML = filtered.map((item) =>
            '<button class="message-item ' + (item.id === currentMessageId ? "active" : "") + '" data-message-id="' + escapeHtml(item.id) + '" role="option" aria-selected="' + (item.id === currentMessageId) + '">' +
              '<div><strong>' + escapeHtml(item.subject || UI.common.untitled) + '</strong>' +
              (!seenMessageIds.has(item.id) ? '<span class="new-badge">' + UI.inbox.newBadge + '</span>' : '') +
              '</div>' +
              '<div class="meta">' + escapeHtml(item.from_address || "-") + '</div>' +
              '<div class="meta">' + window.formatLocalTime(item.received_at) + ' · ' + escapeHtml(item.size || 0) + ' ' + UI.inbox.bytes + ' · ' + escapeHtml(item.attachment_count) + ' ' + UI.inbox.attachments + '</div>' +
            '</button>'
          ).join("");

          renderInboxPagination();
        }

        function formatInboxPaginationSummary() {
          return UI.common.pagination.summary
            .replace("{page}", String(pagination.page))
            .replace("{totalPages}", String(Math.max(1, pagination.totalPages)))
            .replace("{total}", String(pagination.total));
        }

        function renderInboxPagination() {
          const container = document.getElementById("message-pagination");
          if (!container) return;
          const totalPages = Math.max(1, pagination.totalPages);
          const page = pagination.page;
          const disabledPrev = page <= 1 ? " disabled" : "";
          const disabledNext = page >= totalPages ? " disabled" : "";

          const sizeOptions = PAGE_SIZE_OPTIONS
            .map((size) => '<option value="' + size + '"' + (size === pagination.pageSize ? " selected" : "") + '>' + size + '</option>')
            .join("");

          container.innerHTML = '<div class="pagination">' +
            '<div class="pagination-summary">' + escapeHtml(formatInboxPaginationSummary()) + '</div>' +
            '<div class="pagination-controls">' +
              '<label class="pagination-summary" style="margin-right:4px;">' + escapeHtml(UI.common.pagination.pageSize) + '</label>' +
              '<select class="page-size-select" id="inbox-page-size">' + sizeOptions + '</select>' +
              '<button type="button" class="button sm ghost" id="inbox-page-first"' + disabledPrev + '>' + escapeHtml(UI.common.pagination.first) + '</button>' +
              '<button type="button" class="button sm ghost" id="inbox-page-prev"' + disabledPrev + '>' + escapeHtml(UI.common.pagination.prev) + '</button>' +
              '<input type="number" min="1" max="' + totalPages + '" value="' + page + '" class="page-jump" id="inbox-page-jump" aria-label="' + escapeHtml(UI.common.pagination.jumpTo) + '" />' +
              '<button type="button" class="button sm ghost" id="inbox-page-next"' + disabledNext + '>' + escapeHtml(UI.common.pagination.next) + '</button>' +
              '<button type="button" class="button sm ghost" id="inbox-page-last"' + disabledNext + '>' + escapeHtml(UI.common.pagination.last) + '</button>' +
            '</div>' +
          '</div>';
        }

        function renderMessage(result) {
          document.getElementById("message-subject").textContent = result.message.subject || UI.common.untitled;
          document.getElementById("message-meta").textContent =
            (result.message.from_address || "-") + " → " + result.message.to_address + " · " + result.message.received_at;

          const htmlBlock = result.message.html_body
            ? '<div class="panel subpanel"><div class="meta" style="margin-bottom:10px;">' + escapeHtml(UI.inbox.htmlPreview) + '</div><iframe class="mail-html" id="mail-iframe" sandbox srcdoc="' + String(result.message.html_body).replace(/"/g, "&quot;") + '"></iframe></div>'
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

          // iframe 自适应高度
          const iframe = document.getElementById("mail-iframe");
          if (iframe) {
            iframe.addEventListener("load", () => {
              try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const height = Math.max(280, doc.documentElement.scrollHeight + 20);
                iframe.style.height = Math.min(height, 800) + "px";
              } catch (e) { /* cross-origin, keep default */ }
            });
          }
        }

        async function loadMessages(options = {}) {
          clearInboxError();
          const params = new URLSearchParams();
          params.set("page", String(pagination.page));
          params.set("page_size", String(pagination.pageSize));
          const result = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages?" + params.toString());
          const previousCount = allMessages.length;
          const previousIds = new Set(allMessages.map((m) => m.id));
          allMessages = result.messages || [];
          // 首次加载时标记所有消息为已读
          if (previousCount === 0) {
            allMessages.forEach((m) => seenMessageIds.add(m.id));
          }
          if (result.pagination) {
            pagination.page = result.pagination.page ?? pagination.page;
            pagination.pageSize = result.pagination.page_size ?? pagination.pageSize;
            pagination.total = result.pagination.total ?? pagination.total;
            pagination.totalPages = Math.max(1, result.pagination.total_pages ?? 1);
          }
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
          seenMessageIds.add(currentMessageId);
          lastInteractionTime = Date.now();
          renderList();
          try {
            const detail = await request("/inbox/" + encodeURIComponent(INBOX_TOKEN) + "/messages/" + currentMessageId);
            renderMessage(detail);
            // 移动端自动滚动到详情区域
            if (window.innerWidth <= 980) {
              document.getElementById("message-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
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

        // --- Inbox pagination controls ---
        document.addEventListener("click", async (event) => {
          const btn = event.target.closest("#inbox-page-first, #inbox-page-prev, #inbox-page-next, #inbox-page-last");
          if (!btn || btn.disabled) return;
          const totalPages = Math.max(1, pagination.totalPages);
          let next = pagination.page;
          if (btn.id === "inbox-page-first") next = 1;
          else if (btn.id === "inbox-page-prev") next = Math.max(1, pagination.page - 1);
          else if (btn.id === "inbox-page-next") next = Math.min(totalPages, pagination.page + 1);
          else if (btn.id === "inbox-page-last") next = totalPages;
          if (next === pagination.page) return;
          pagination.page = next;
          currentMessageId = null;
          try { await loadMessages({ silent: true }); } catch (error) { showInboxError(error.message); }
        });

        document.addEventListener("change", async (event) => {
          if (event.target.id === "inbox-page-size") {
            const nextSize = Number.parseInt(event.target.value, 10);
            if (!Number.isInteger(nextSize) || nextSize <= 0) return;
            pagination.pageSize = nextSize;
            pagination.page = 1;
            currentMessageId = null;
            try { await loadMessages({ silent: true }); } catch (error) { showInboxError(error.message); }
          }
        });

        document.addEventListener("keydown", async (event) => {
          if (event.key === "Enter" && event.target.id === "inbox-page-jump") {
            event.preventDefault();
            const totalPages = Math.max(1, pagination.totalPages);
            const target = Math.min(totalPages, Math.max(1, Number.parseInt(event.target.value, 10) || 1));
            if (target === pagination.page) return;
            pagination.page = target;
            currentMessageId = null;
            try { await loadMessages({ silent: true }); } catch (error) { showInboxError(error.message); }
          }
        });

        setInterval(() => {
          // 如果用户最近 15 秒内有交互，暂停自动刷新
          if (Date.now() - lastInteractionTime < 15000) return;
          loadMessages({ silent: false }).catch(() => {});
        }, 30000);
        setInterval(updateExpiryBanner, 1000);
        updateExpiryBanner();

        // 追踪用户交互
        document.addEventListener("click", () => { lastInteractionTime = Date.now(); });
        document.addEventListener("keydown", () => { lastInteractionTime = Date.now(); });

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
