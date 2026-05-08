import { getCookie, setCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import type { AppSchema } from "../types/app";

export type Locale = "zh-CN" | "en";

const LOCALE_COOKIE = "tm_lang";

type TranslationMap = Record<Locale, string>;

const EXACT_ERROR_TRANSLATIONS: Record<string, TranslationMap> = {
  Unauthorized: { "zh-CN": "未授权。", en: "Unauthorized." },
  Forbidden: { "zh-CN": "禁止访问。", en: "Forbidden." },
  "Not Found": { "zh-CN": "资源不存在。", en: "Not Found." },
  "Internal Server Error": { "zh-CN": "服务器内部错误。", en: "Internal Server Error." },
  "Invalid credentials.": { "zh-CN": "账号或密码错误。", en: "Invalid credentials." },
  "User is disabled.": { "zh-CN": "用户已被禁用。", en: "User is disabled." },
  "System has already been initialized.": {
    "zh-CN": "系统已经初始化完成。",
    en: "System has already been initialized.",
  },
  "Password must be at least 8 characters.": {
    "zh-CN": "密码至少需要 8 个字符。",
    en: "Password must be at least 8 characters.",
  },
  "Request body must be valid JSON.": {
    "zh-CN": "请求体必须是有效的 JSON。",
    en: "Request body must be valid JSON.",
  },
  "Mailbox not found.": { "zh-CN": "邮箱不存在。", en: "Mailbox not found." },
  "Mailbox has expired.": { "zh-CN": "邮箱已过期。", en: "Mailbox has expired." },
  "Inbox link not found.": { "zh-CN": "收件箱链接不存在。", en: "Inbox link not found." },
  "Inbox link is invalid.": { "zh-CN": "收件箱链接无效。", en: "Inbox link is invalid." },
  "Inbox link has expired.": { "zh-CN": "收件箱链接已过期。", en: "Inbox link has expired." },
  "Message not found.": { "zh-CN": "邮件不存在。", en: "Message not found." },
  "Attachment not found.": { "zh-CN": "附件不存在。", en: "Attachment not found." },
  "Attachment object not found.": {
    "zh-CN": "附件文件不存在。",
    en: "Attachment object not found.",
  },
  "Cloudflare API token is not configured in the admin settings.": {
    "zh-CN": "管理员设置中尚未配置 Cloudflare API Token。",
    en: "Cloudflare API token is not configured in the admin settings.",
  },
  "Cloudflare runtime configuration is incomplete.": {
    "zh-CN": "Cloudflare 运行时配置不完整。",
    en: "Cloudflare runtime configuration is incomplete.",
  },
  "Rate limit exceeded.": {
    "zh-CN": "请求过于频繁，请稍后再试。",
    en: "Rate limit exceeded.",
  },
  "API token is invalid or revoked.": {
    "zh-CN": "API Token 无效或已被撤销。",
    en: "API token is invalid or revoked.",
  },
  "API token not found.": { "zh-CN": "API Token 不存在。", en: "API token not found." },
  "Domain not found.": { "zh-CN": "域名不存在。", en: "Domain not found." },
  "Domain is not available to this user.": {
    "zh-CN": "该域名当前不可供此用户使用。",
    en: "Domain is not available to this user.",
  },
  "Mailbox link has expired.": { "zh-CN": "邮箱链接已过期。", en: "Mailbox link has expired." },
  "Failed to create initial administrator.": {
    "zh-CN": "创建初始管理员失败。",
    en: "Failed to create initial administrator.",
  },
  "role must be admin or user.": {
    "zh-CN": "role 必须为 admin 或 user。",
    en: "role must be admin or user.",
  },
  "A user with that email already exists.": {
    "zh-CN": "该邮箱对应的用户已存在。",
    en: "A user with that email already exists.",
  },
  "Failed to create user.": { "zh-CN": "创建用户失败。", en: "Failed to create user." },
  "User not found.": { "zh-CN": "用户不存在。", en: "User not found." },
  "status must be active or disabled.": {
    "zh-CN": "status 必须为 active 或 disabled。",
    en: "status must be active or disabled.",
  },
  "Failed to update user.": { "zh-CN": "更新用户失败。", en: "Failed to update user." },
  "Failed to delete user.": { "zh-CN": "删除用户失败。", en: "Failed to delete user." },
  "You cannot delete the current user.": {
    "zh-CN": "不能删除当前登录用户。",
    en: "You cannot delete the current user.",
  },
  "Login failed.": { "zh-CN": "登录失败。", en: "Login failed." },
  "Invalid token format.": { "zh-CN": "Token 格式无效。", en: "Invalid token format." },
  "Cloudflare API returned no result.": {
    "zh-CN": "Cloudflare API 未返回结果。",
    en: "Cloudflare API returned no result.",
  },
  "domain must be a valid hostname.": {
    "zh-CN": "域名必须是有效的主机名。",
    en: "domain must be a valid hostname.",
  },
  "type must be root or subdomain.": {
    "zh-CN": "type 必须为 root 或 subdomain。",
    en: "type must be root or subdomain.",
  },
  "status must be pending, active, failed, or disabled.": {
    "zh-CN": "status 必须为 pending、active、failed 或 disabled。",
    en: "status must be pending, active, failed, or disabled.",
  },
  "That domain already exists.": { "zh-CN": "该域名已存在。", en: "That domain already exists." },
  "Domain must be active before assignment.": {
    "zh-CN": "域名必须先处于 active 状态才能分配。",
    en: "Domain must be active before assignment.",
  },
  "Domain is already assigned to that user.": {
    "zh-CN": "该域名已经分配给该用户。",
    en: "Domain is already assigned to that user.",
  },
  "prefix must match /^[a-z0-9][a-z0-9-_]{1,62}$/": {
    "zh-CN": "prefix 必须匹配 /^[a-z0-9][a-z0-9-_]{1,62}$/。",
    en: "prefix must match /^[a-z0-9][a-z0-9-_]{1,62}$/",
  },
  "That mailbox prefix is already in use.": {
    "zh-CN": "该邮箱前缀已被占用。",
    en: "That mailbox prefix is already in use.",
  },
  "Failed to generate a unique mailbox address.": {
    "zh-CN": "生成唯一邮箱地址失败。",
    en: "Failed to generate a unique mailbox address.",
  },
  "ttl_seconds must be a positive integer.": {
    "zh-CN": "ttl_seconds 必须是正整数。",
    en: "ttl_seconds must be a positive integer.",
  },
  "Domain does not belong to any zone accessible by the configured Cloudflare token.": {
    "zh-CN": "该域名不属于当前 Cloudflare Token 可访问的任何 Zone。",
    en: "Domain does not belong to any zone accessible by the configured Cloudflare token.",
  },
};

const MANUAL_STEP_TRANSLATIONS: Record<string, TranslationMap> = {
  "Open the admin Operations panel.": {
    "zh-CN": "打开管理员运维面板。",
    en: "Open the admin Operations panel.",
  },
  "Save a Cloudflare API token with access to the zones you want this worker to manage.": {
    "zh-CN": "保存一个可访问目标 Zone 的 Cloudflare API Token，让当前 Worker 具备管理权限。",
    en: "Save a Cloudflare API token with access to the zones you want this worker to manage.",
  },
  "Open Cloudflare Email Routing for the configured zone and confirm the generated DNS records are present.": {
    "zh-CN": "打开该 Zone 的 Cloudflare Email Routing，确认系统生成的 DNS 记录已经存在。",
    en: "Open Cloudflare Email Routing for the configured zone and confirm the generated DNS records are present.",
  },
  "Verify the catch-all rule points to the expected Worker script before sending production traffic.": {
    "zh-CN": "在投入正式流量前，确认 catch-all 规则指向预期的 Worker 脚本。",
    en: "Verify the catch-all rule points to the expected Worker script before sending production traffic.",
  },
  "Use a domain inside a zone that this Cloudflare token can access.": {
    "zh-CN": "请使用当前 Cloudflare Token 有权限访问的 Zone 下的域名。",
    en: "Use a domain inside a zone that this Cloudflare token can access.",
  },
  "If the token should manage this zone, expand the token's zone permissions and retry.": {
    "zh-CN": "如果这个 Token 本应管理该 Zone，请补齐 Zone 权限后再重试。",
    en: "If the token should manage this zone, expand the token's zone permissions and retry.",
  },
  "If the zone handles unrelated mail, narrow the Email Routing rule manually after initial setup.": {
    "zh-CN": "如果该 Zone 还承载了其他邮件流量，请在初次配置后手动收窄 Email Routing 规则。",
    en: "If the zone handles unrelated mail, narrow the Email Routing rule manually after initial setup.",
  },
};

const REQUIRED_FIELD_PATTERN = /^([a-zA-Z0-9_]+) is required\.$/;
const POSITIVE_INTEGER_PATTERN = /^([a-zA-Z0-9_]+) must be a positive integer\.$/;
const EMAIL_PATTERN = /^([a-zA-Z0-9_]+) is not a valid email address\.$/;
const CLOUDFLARE_STATUS_PATTERN = /^Cloudflare API request failed with status (\d+)\.$/;

export function normalizeLocale(input: string | null | undefined): Locale | null {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toLowerCase();
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans") {
    return "zh-CN";
  }

  if (normalized === "en" || normalized === "en-us" || normalized === "en-gb") {
    return "en";
  }

  return null;
}

function resolveLocaleFromHeaders(headerValue: string | undefined): Locale {
  if (!headerValue) {
    return "zh-CN";
  }

  for (const part of headerValue.split(",")) {
    const locale = normalizeLocale(part.split(";")[0]);
    if (locale) {
      return locale;
    }
  }

  return "zh-CN";
}

function translateFieldName(fieldName: string, locale: Locale): string {
  if (locale === "en") {
    return fieldName;
  }

  const labels: Record<string, string> = {
    login: "登录名",
    password: "密码",
    email: "邮箱",
    username: "用户名",
    role: "角色",
    status: "状态",
    domain: "域名",
    domain_id: "域名 ID",
    type: "类型",
    prefix: "前缀",
    ttl_seconds: "TTL 秒数",
    user_id: "用户 ID",
    api_token: "API Token",
    name: "名称",
  };

  return labels[fieldName] ?? fieldName;
}

export const attachLocale: MiddlewareHandler<AppSchema> = async (c, next) => {
  const queryLocale = normalizeLocale(c.req.query("lang"));
  const headerLocale = normalizeLocale(c.req.header("X-Language"));
  const cookieLocale = normalizeLocale(getCookie(c, LOCALE_COOKIE));
  const acceptLocale = resolveLocaleFromHeaders(c.req.header("Accept-Language"));

  const locale = queryLocale ?? headerLocale ?? cookieLocale ?? acceptLocale ?? "zh-CN";
  c.set("locale", locale);

  if (queryLocale && queryLocale !== cookieLocale) {
    setCookie(c, LOCALE_COOKIE, queryLocale, {
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  await next();
};

export function translateManualSteps(locale: Locale, steps: unknown): unknown {
  if (!Array.isArray(steps)) {
    return steps;
  }

  return steps.map((step) => {
    if (typeof step !== "string") {
      return step;
    }

    return MANUAL_STEP_TRANSLATIONS[step]?.[locale] ?? step;
  });
}

export function translateErrorMessage(locale: Locale, message: string): string {
  if (locale === "en") {
    return message;
  }

  const exact = EXACT_ERROR_TRANSLATIONS[message];
  if (exact) {
    return exact[locale];
  }

  const required = message.match(REQUIRED_FIELD_PATTERN);
  if (required) {
    return `${translateFieldName(required[1], locale)}不能为空。`;
  }

  const positiveInteger = message.match(POSITIVE_INTEGER_PATTERN);
  if (positiveInteger) {
    return `${translateFieldName(positiveInteger[1], locale)}必须是正整数。`;
  }

  const email = message.match(EMAIL_PATTERN);
  if (email) {
    return `${translateFieldName(email[1], locale)}不是有效的邮箱地址。`;
  }

  const cloudflareStatus = message.match(CLOUDFLARE_STATUS_PATTERN);
  if (cloudflareStatus) {
    return `Cloudflare API 调用失败，状态码 ${cloudflareStatus[1]}。`;
  }

  return message;
}

export function languageLabel(locale: Locale): string {
  return locale === "zh-CN" ? "中文" : "English";
}
