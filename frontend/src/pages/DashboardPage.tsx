import { useState } from "react";
import { t, getLocale, setLocale, type Locale } from "../lib/i18n";
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
  const ui = t();

  function switchLocale(l: Locale) {
    setLocale(l);
    setLoc(l);
  }

  const navItems: { key: Panel; label: string; adminOnly?: boolean }[] = [
    { key: "overview", label: ui.nav.overview },
    { key: "domains", label: ui.nav.domains },
    { key: "mailboxes", label: ui.nav.mailboxes },
    { key: "tokens", label: ui.nav.tokens },
    { key: "users", label: ui.nav.users, adminOnly: true },
    { key: "ops", label: ui.nav.ops, adminOnly: true },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded" />
            {ui.dashboard.title}
          </h1>
          <p className="text-muted text-sm mt-1.5">
            <span className={`tag ${user.role === "admin" ? "tag-good" : "tag-default"}`}>
              {user.role === "admin" ? ui.dashboard.admin : ui.dashboard.user}
            </span>
            <span className="ml-2 font-mono">{user.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input !w-auto !py-2 !px-3 !text-sm !min-h-0"
            value={locale}
            onChange={(e) => switchLocale(e.target.value as Locale)}
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
          <button className="btn-danger text-sm" onClick={onLogout}>
            {ui.common.logout}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-[220px_1fr] gap-4 max-lg:grid-cols-1">
        <nav className="card p-2.5 sticky top-6 self-start max-lg:static max-lg:flex max-lg:overflow-x-auto max-lg:gap-1">
          {navItems
            .filter((item) => !item.adminOnly || user.role === "admin")
            .map((item) => (
              <button
                key={item.key}
                onClick={() => setPanel(item.key)}
                className={`w-full text-left px-3.5 py-2.5 rounded-md text-sm transition-all ${
                  panel === item.key
                    ? "bg-accent/10 text-accent font-semibold shadow-[inset_3px_0_0] shadow-accent"
                    : "text-muted hover:bg-white/[0.05] hover:text-white"
                } max-lg:w-auto max-lg:whitespace-nowrap`}
              >
                {item.label}
              </button>
            ))}
        </nav>

        <main className="card p-6 min-h-[400px]">
          {panel === "overview" && <OverviewPanel isAdmin={user.role === "admin"} />}
          {panel === "domains" && <DomainsPanel isAdmin={user.role === "admin"} />}
          {panel === "mailboxes" && <MailboxesPanel />}
          {panel === "tokens" && <TokensPanel />}
          {panel === "users" && <UsersPanel currentUserId={user.id} />}
          {panel === "ops" && <OpsPanel />}
        </main>
      </div>
    </div>
  );
}
