import { useCallback, useEffect, useState } from "react";
import { t, getLocale, setLocale, type Locale } from "../lib/i18n";
import { apiGet } from "../lib/api";
import type { AuthUser } from "../hooks/useAuth";
import OverviewPanel from "../panels/OverviewPanel";
import DomainsPanel from "../panels/DomainsPanel";
import MailboxesPanel from "../panels/MailboxesPanel";
import TokensPanel from "../panels/TokensPanel";
import UsersPanel from "../panels/UsersPanel";
import OpsPanel from "../panels/OpsPanel";

const PANELS = ["overview", "domains", "mailboxes", "tokens", "users", "ops"] as const;
type Panel = (typeof PANELS)[number];

export default function DashboardPage({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [panel, setPanel] = useState<Panel>("overview");
  const [locale, setLoc] = useState<Locale>(getLocale());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const ui = t();
  const isAdmin = user.role === "admin";

  // 加载侧边栏徽章数量
  const loadCounts = useCallback(async () => {
    try {
      if (isAdmin) {
        const [u, d, m, tok] = await Promise.all([
          apiGet<{ pagination: { total: number } }>("/admin/users?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/admin/domains?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/admin/mailboxes?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/user/api-tokens?page=1&page_size=1"),
        ]);
        setCounts({ users: u.pagination.total, domains: d.pagination.total, mailboxes: m.pagination.total, tokens: tok.pagination.total });
      } else {
        const [d, m, tok] = await Promise.all([
          apiGet<{ pagination: { total: number } }>("/user/domains?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/user/mailboxes?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/user/api-tokens?page=1&page_size=1"),
        ]);
        setCounts({ domains: d.pagination.total, mailboxes: m.pagination.total, tokens: tok.pagination.total });
      }
    } catch { /* ignore */ }
  }, [isAdmin]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  function switchLocale(l: Locale) {
    setLocale(l);
    setLoc(l);
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
    loadCounts();
  }

  // 键盘快捷键
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "r" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); handleRefresh(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const navItems: { key: Panel; label: string; count?: number; adminOnly?: boolean }[] = [
    { key: "overview", label: ui.nav.overview },
    { key: "domains", label: ui.nav.domains, count: counts.domains },
    { key: "mailboxes", label: ui.nav.mailboxes, count: counts.mailboxes },
    { key: "tokens", label: ui.nav.tokens, count: counts.tokens },
    { key: "users", label: ui.nav.users, count: counts.users, adminOnly: true },
    { key: "ops", label: ui.nav.ops, adminOnly: true },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded" />
            {ui.dashboard.title}
          </h1>
          <p className="text-muted text-sm mt-1.5">
            <span className={`tag ${isAdmin ? "tag-good" : "tag-default"}`}>
              {isAdmin ? ui.dashboard.admin : ui.dashboard.user}
            </span>
            <span className="ml-2 font-mono">{user.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-default" onClick={handleRefresh} title="刷新 (R)">
            ↻ {ui.common.refresh}
          </button>
          <select
            className="input !w-auto !py-2 !px-3 !text-sm !min-h-0"
            value={locale}
            onChange={(e) => switchLocale(e.target.value as Locale)}
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
          <button className="btn-danger" onClick={onLogout}>
            {ui.common.logout}
          </button>
        </div>
      </header>

      {/* Layout */}
      <div className="grid grid-cols-[220px_1fr] gap-4 max-lg:grid-cols-1">
        {/* Sidebar */}
        <nav className="card p-2.5 sticky top-6 self-start max-lg:static max-lg:flex max-lg:overflow-x-auto max-lg:gap-1 max-lg:p-2">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => (
              <button
                key={item.key}
                onClick={() => setPanel(item.key)}
                className={`w-full text-left px-3.5 py-2.5 rounded-md text-sm transition-all flex items-center justify-between gap-2 ${
                  panel === item.key
                    ? "bg-accent/10 text-accent font-semibold shadow-[inset_3px_0_0] shadow-accent"
                    : "text-muted hover:bg-white/[0.05] hover:text-white"
                } max-lg:w-auto max-lg:whitespace-nowrap`}
              >
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    panel === item.key ? "bg-accent/20 text-accent" : "bg-white/[0.06] text-muted"
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            ))}
        </nav>

        {/* Content */}
        <main className="card p-5 sm:p-6 min-h-[400px]">
          {panel === "overview" && <OverviewPanel isAdmin={isAdmin} onNavigate={setPanel} key={refreshKey} />}
          {panel === "domains" && <DomainsPanel isAdmin={isAdmin} key={`domains-${refreshKey}`} />}
          {panel === "mailboxes" && <MailboxesPanel isAdmin={isAdmin} key={`mailboxes-${refreshKey}`} />}
          {panel === "tokens" && <TokensPanel key={`tokens-${refreshKey}`} />}
          {panel === "users" && <UsersPanel currentUserId={user.id} key={`users-${refreshKey}`} />}
          {panel === "ops" && <OpsPanel key={`ops-${refreshKey}`} />}
        </main>
      </div>

      {/* Shortcut hint */}
      <div className="mt-4 text-xs text-muted/60 text-center">
        按 <kbd className="px-1.5 py-0.5 border border-line-strong rounded text-muted bg-white/[0.03]">R</kbd> 刷新数据
      </div>
    </div>
  );
}
