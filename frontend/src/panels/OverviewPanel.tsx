import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

interface Metrics { users: number; domains: number; mailboxes: number; messages: number }

export default function OverviewPanel({ isAdmin }: { isAdmin: boolean }) {
  const [metrics, setMetrics] = useState<Metrics>({ users: 0, domains: 0, mailboxes: 0, messages: 0 });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      if (isAdmin) {
        const [u, d, m, msg] = await Promise.all([
          apiGet<{ pagination: { total: number } }>("/admin/users?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/admin/domains?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/admin/mailboxes?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/admin/messages?page=1&page_size=1"),
        ]);
        setMetrics({ users: u.pagination.total, domains: d.pagination.total, mailboxes: m.pagination.total, messages: msg.pagination.total });
      } else {
        const [d, t, m] = await Promise.all([
          apiGet<{ pagination: { total: number } }>("/user/domains?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/user/api-tokens?page=1&page_size=1"),
          apiGet<{ pagination: { total: number } }>("/user/mailboxes?page=1&page_size=1"),
        ]);
        setMetrics({ users: 0, domains: d.pagination.total, mailboxes: m.pagination.total, messages: t.pagination.total });
      }
    } catch { /* ignore */ }
  }

  const cards = isAdmin
    ? [{ label: "用户", value: metrics.users }, { label: "域名", value: metrics.domains }, { label: "邮箱", value: metrics.mailboxes }, { label: "邮件", value: metrics.messages }]
    : [{ label: "我的域名", value: metrics.domains }, { label: "我的 Token", value: metrics.messages }, { label: "我的邮箱", value: metrics.mailboxes }];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">概览</h2>
      <p className="text-muted text-sm mb-4">当前资源概览</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white/[0.03] border border-line rounded-md p-4 hover:border-accent/20 transition-colors">
            <span className="text-muted text-xs">{c.label}</span>
            <strong className="block text-2xl mt-1">{c.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
