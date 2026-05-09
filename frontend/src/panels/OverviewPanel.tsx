import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import Spinner from "../components/Spinner";

interface Metrics { users: number; domains: number; mailboxes: number; messages: number; tokens: number }

type Panel = "overview" | "domains" | "mailboxes" | "tokens" | "users" | "ops";

export default function OverviewPanel({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate: (panel: Panel) => void }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      if (isAdmin) {
        const [u, d, m, msg, tok] = await Promise.all([
          apiGet<{ pagination: { total: number } }>("/admin/users?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/admin/domains?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/admin/mailboxes?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/admin/messages?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/user/api-tokens?page=1&page_size=1"),
        ]);
        setMetrics({ users: u.pagination.total, domains: d.pagination.total, mailboxes: m.pagination.total, messages: msg.pagination.total, tokens: tok.pagination.total });
      } else {
        const [d, tok, m] = await Promise.all([
          apiGet<{ pagination: { total: number } }>("/user/domains?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/user/api-tokens?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/user/mailboxes?page=1&page_size=1"),
        ]);
        setMetrics({ users: 0, domains: d.pagination.total, mailboxes: m.pagination.total, messages: 0, tokens: tok.pagination.total });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>;
  }

  const cards = isAdmin
    ? [
        { label: "用户", value: metrics?.users ?? 0, icon: "👥", panel: "users" as Panel },
        { label: "域名", value: metrics?.domains ?? 0, icon: "🌐", panel: "domains" as Panel },
        { label: "邮箱", value: metrics?.mailboxes ?? 0, icon: "📬", panel: "mailboxes" as Panel },
        { label: "邮件", value: metrics?.messages ?? 0, icon: "✉️", panel: "ops" as Panel },
        { label: "Token", value: metrics?.tokens ?? 0, icon: "🔑", panel: "tokens" as Panel },
      ]
    : [
        { label: "我的域名", value: metrics?.domains ?? 0, icon: "🌐", panel: "domains" as Panel },
        { label: "我的邮箱", value: metrics?.mailboxes ?? 0, icon: "📬", panel: "mailboxes" as Panel },
        { label: "我的 Token", value: metrics?.tokens ?? 0, icon: "🔑", panel: "tokens" as Panel },
      ];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">概览</h2>
      <p className="text-muted text-sm mb-5">点击卡片跳转到对应模块</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => onNavigate(c.panel)}
            className="bg-white/[0.03] border border-line rounded-lg p-4 hover:border-accent/30 hover:bg-accent/[0.03] transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted text-sm">{c.label}</span>
              <span className="text-lg opacity-60 group-hover:opacity-100 transition-opacity">{c.icon}</span>
            </div>
            <strong className="block text-3xl font-bold">{c.value}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
