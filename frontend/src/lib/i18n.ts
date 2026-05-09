export type Locale = "zh-CN" | "en";

const translations = {
  "zh-CN": {
    login: { title: "登录", heading: "临时邮箱控制台", subtitle: "统一管理会话、域名、邮箱和邮件。", email: "邮箱或用户名", password: "密码", submit: "登录", submitting: "登录中...", failed: "登录失败", missingFields: "请填写登录名和密码。" },
    setup: { title: "初始化", heading: "初始化系统", subtitle: "创建第一个管理员账号。", email: "管理员邮箱", username: "用户名", password: "密码", confirmPassword: "确认密码", submit: "初始化", passwordMismatch: "两次密码不一致。", passwordTooShort: "密码至少 8 位。" },
    nav: { overview: "概览", domains: "域名", mailboxes: "邮箱", tokens: "API Token", users: "用户", ops: "运维" },
    common: { save: "保存", cancel: "取消", confirm: "确认", delete: "删除", edit: "编辑", create: "创建", search: "搜索", refresh: "刷新", logout: "退出登录", loading: "加载中...", noData: "暂无数据", copy: "复制", copied: "已复制", actions: "操作", status: "状态", name: "名称", type: "类型", email: "邮箱", domain: "域名", role: "角色", enable: "启用", disable: "禁用", revoke: "撤销", open: "打开", close: "关闭" },
    dashboard: { title: "临时邮箱控制台", admin: "管理员", user: "用户" },
    status: { active: "激活", pending: "待处理", disabled: "禁用", revoked: "已撤销", failed: "失败", ready: "就绪", incomplete: "未完成", root: "根域名", subdomain: "子域名" },
  },
  en: {
    login: { title: "Login", heading: "Temp Mail Console", subtitle: "Manage sessions, domains, mailboxes, and messages.", email: "Email or username", password: "Password", submit: "Sign in", submitting: "Signing in...", failed: "Login failed", missingFields: "Please fill in login and password." },
    setup: { title: "Setup", heading: "Initialize System", subtitle: "Create the first admin account.", email: "Admin email", username: "Username", password: "Password", confirmPassword: "Confirm password", submit: "Initialize", passwordMismatch: "Passwords do not match.", passwordTooShort: "Password must be at least 8 characters." },
    nav: { overview: "Overview", domains: "Domains", mailboxes: "Mailboxes", tokens: "API Tokens", users: "Users", ops: "Operations" },
    common: { save: "Save", cancel: "Cancel", confirm: "Confirm", delete: "Delete", edit: "Edit", create: "Create", search: "Search", refresh: "Refresh", logout: "Logout", loading: "Loading...", noData: "No data", copy: "Copy", copied: "Copied!", actions: "Actions", status: "Status", name: "Name", type: "Type", email: "Email", domain: "Domain", role: "Role", enable: "Enable", disable: "Disable", revoke: "Revoke", open: "Open", close: "Close" },
    dashboard: { title: "Temp Mail Console", admin: "Admin", user: "User" },
    status: { active: "Active", pending: "Pending", disabled: "Disabled", revoked: "Revoked", failed: "Failed", ready: "Ready", incomplete: "Incomplete", root: "Root", subdomain: "Subdomain" },
  },
} as const;

let currentLocale: Locale = (localStorage.getItem("locale") as Locale) || "zh-CN";

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
  localStorage.setItem("locale", locale);
  document.documentElement.lang = locale;
}

export function t() {
  return translations[currentLocale];
}
