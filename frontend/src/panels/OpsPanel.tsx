import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import Table from "../components/Table";
import StatusTag from "../components/StatusTag";
import { useToast } from "../components/Toast";
import { formatTime } from "../lib/utils";

interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

export default function OpsPanel() {
  const [tab, setTab] = useState<"cloudflare" | "mailboxes" | "messages" | "tokens" | "audit">("cloudflare");
  const toast = useToast();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">运维</h2>
      <div className="flex gap-1 border-b border-line pb-2 mb-4 flex-wrap">
        {(["cloudflare", "mailboxes", "messages", "tokens", "audit"] as const).map((t) => (
          <button
            key={t}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${tab === t ? "bg-accent/10 text-accent font-medium" : "text-muted hover:text-white hover:bg-white/[0.05]"}`}
            onClick={() => setTab(t)}
          >
            {t === "cloudflare" ? "Cloudflare" : t === "mailboxes" ? "邮箱" : t === "messages" ? "邮件" : t === "tokens" ? "Token" : "审计日志"}
          </button>
        ))}
      </div>
      {tab === "cloudflare" && <CloudflareTab toast={toast} />}
      {tab === "mailboxes" && <AdminMailboxesTab toast={toast} />}
      {tab === "messages" && <AdminMessagesTab toast={toast} />}
      {tab === "tokens" && <AdminTokensTab toast={toast} />}
      {tab === "audit" && <AuditTab toast={toast} />}
    </div>
  );
}

function CloudflareTab({ toast }: { toast: import("../components/Toast").ToastFn }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { apiGet<Record<string, unknown>>("/admin/cloudflare/status").then(setStatus).catch(() => {}); }, []);

  async function saveToken() {
    try {
      await apiPost("/admin/cloudflare/config", { api_token: token });
      toast("Token 已保存", "ok");
      setToken("");
    } catch (e) { toast(e instanceof Error ? e.message : "保存失败", "error"); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-line rounded-md p-4 text-sm">
        <strong>运行状态：</strong>
        <span className="ml-2">{status ? JSON.stringify(status, null, 2).slice(0, 200) : "加载中..."}</span>
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted block mb-1">Cloudflare API Token</label>
          <input className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="输入新 Token 覆盖" />
        </div>
        <button className="btn-primary text-sm" onClick={saveToken}>保存</button>
      </div>
    </div>
  );
}

function AdminMailboxesTab({ toast }: { toast: import("../components/Toast").ToastFn }) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const load = useCallback(async (page = 1, pageSize = 20) => {
    try {
      const res = await apiGet<{ mailboxes: Record<string, unknown>[]; pagination: Pagination }>(`/admin/mailboxes?page=${page}&page_size=${pageSize}`);
      setData(res.mailboxes);
      setPagination(res.pagination);
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
  }, [toast]);

  useEffect(() => { load(); }, []);

  return (
    <Table
      columns={[
        { key: "email", header: "邮箱", render: (m) => <span className="font-mono text-xs">{String(m.email_address ?? "")}</span> },
        { key: "owner", header: "归属", render: (m) => String(m.user_email ?? "-") },
        { key: "status", header: "状态", render: (m) => <StatusTag value={String(m.status ?? "")} /> },
        { key: "expires", header: "过期", render: (m) => <span className="text-xs text-muted">{formatTime(m.expires_at as string)}</span> },
      ]}
      data={data as (Record<string, unknown> & { id: string })[]}
      pagination={pagination}
      onPageChange={(p) => load(p, pagination.pageSize)}
      onPageSizeChange={(s) => load(1, s)}
    />
  );
}

function AdminMessagesTab({ toast }: { toast: import("../components/Toast").ToastFn }) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const load = useCallback(async (page = 1, pageSize = 20) => {
    try {
      const res = await apiGet<{ messages: Record<string, unknown>[]; pagination: Pagination }>(`/admin/messages?page=${page}&page_size=${pageSize}`);
      setData(res.messages);
      setPagination(res.pagination);
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
  }, [toast]);

  useEffect(() => { load(); }, []);

  return (
    <Table
      columns={[
        { key: "to", header: "收件人", render: (m) => <span className="font-mono text-xs">{String(m.to_address ?? "")}</span> },
        { key: "from", header: "发件人", render: (m) => String(m.from_address ?? "-") },
        { key: "subject", header: "主题", render: (m) => String(m.subject ?? "(无主题)") },
        { key: "received", header: "接收时间", render: (m) => <span className="text-xs text-muted">{formatTime(m.received_at as string)}</span> },
      ]}
      data={data as (Record<string, unknown> & { id: string })[]}
      pagination={pagination}
      onPageChange={(p) => load(p, pagination.pageSize)}
      onPageSizeChange={(s) => load(1, s)}
    />
  );
}

function AdminTokensTab({ toast }: { toast: import("../components/Toast").ToastFn }) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

  const load = useCallback(async (page = 1, pageSize = 20) => {
    try {
      const res = await apiGet<{ tokens: Record<string, unknown>[]; pagination: Pagination }>(`/admin/api-tokens?page=${page}&page_size=${pageSize}`);
      setData(res.tokens);
      setPagination(res.pagination);
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
  }, [toast]);

  useEffect(() => { load(); }, []);

  return (
    <Table
      columns={[
        { key: "user", header: "用户", render: (t) => String(t.user_email ?? "-") },
        { key: "name", header: "名称", render: (t) => String(t.name ?? "") },
        { key: "prefix", header: "前缀", render: (t) => <span className="font-mono text-xs">{String(t.token_prefix ?? "")}</span> },
        { key: "status", header: "状态", render: (t) => <StatusTag value={String(t.status ?? "")} /> },
      ]}
      data={data as (Record<string, unknown> & { id: string })[]}
      pagination={pagination}
      onPageChange={(p) => load(p, pagination.pageSize)}
      onPageSizeChange={(s) => load(1, s)}
    />
  );
}

function AuditTab({ toast }: { toast: import("../components/Toast").ToastFn }) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });

  const load = useCallback(async (page = 1, pageSize = 10) => {
    try {
      const res = await apiGet<{ audit_logs: Record<string, unknown>[]; pagination: Pagination }>(`/admin/audit-logs?page=${page}&page_size=${pageSize}`);
      setData(res.audit_logs);
      setPagination(res.pagination);
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
  }, [toast]);

  useEffect(() => { load(); }, []);

  return (
    <Table
      columns={[
        { key: "time", header: "时间", render: (a) => <span className="text-xs text-muted">{formatTime(a.created_at as string)}</span> },
        { key: "action", header: "动作", render: (a) => <span className="tag-default !text-[10px]">{String(a.action ?? "")}</span> },
        { key: "actor", header: "操作人", render: (a) => <span className="text-xs">{String(a.actor_user_id ?? "-")}</span> },
        { key: "target", header: "目标", render: (a) => <span className="text-xs">{[a.target_type, a.target_id].filter(Boolean).join(": ") || "-"}</span> },
      ]}
      data={data as (Record<string, unknown> & { id: string })[]}
      pagination={pagination}
      onPageChange={(p) => load(p, pagination.pageSize)}
      onPageSizeChange={(s) => load(1, s)}
    />
  );
}
