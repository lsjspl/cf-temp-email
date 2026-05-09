import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { Pagination, RawPagination, mapPagination } from "../lib/pagination";
import Table from "../components/Table";
import Modal from "../components/Modal";
import StatusTag from "../components/StatusTag";
import Dropdown, { DropdownItem } from "../components/Dropdown";
import { useToast } from "../components/Toast";
import { useConfirm } from "../hooks/useConfirm";

interface Domain { id: string; domain: string; type: string; status: string; assigned_user_count?: number }

export default function DomainsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Domain | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (page = pagination.page, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      const path = isAdmin ? "/admin/domains" : "/user/domains";
      const res = await apiGet<{ domains: Domain[]; pagination: RawPagination }>(`${path}?page=${page}&page_size=${pageSize}`);
      setDomains(res.domains);
      setPagination(mapPagination(res.pagination));
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
    setLoading(false);
  }, [isAdmin, pagination.page, pagination.pageSize, toast]);

  useEffect(() => { load(1, 20); }, []);

  const filtered = search ? domains.filter((d) => d.domain.toLowerCase().includes(search.toLowerCase())) : domains;

  async function handleAdd(domain: string, type: string) {
    try {
      const res = await apiPost<{ domain: Domain }>("/admin/domains", { domain, type, status: "active" });
      toast("域名已创建", "ok");
      setAddOpen(false);
      // 自动配置 Cloudflare
      if (res?.domain?.id) {
        try {
          await apiPost(`/admin/domains/${res.domain.id}/configure-cloudflare`);
          toast("Cloudflare 已配置", "ok");
        } catch (e) { toast(`域名已创建，但 Cloudflare 配置失败：${e instanceof Error ? e.message : ""}`, "warn"); }
      }
      load(1, pagination.pageSize);
    } catch (e) { toast(e instanceof Error ? e.message : "创建失败", "error"); }
  }

  async function handleEdit(id: string, type: string, status: string) {
    try {
      await apiPatch(`/admin/domains/${id}`, { type, status });
      toast("域名已更新", "ok");
      setEditItem(null);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "更新失败", "error"); }
  }

  async function handleDelete(id: string, domainName: string) {
    const ok = await confirm({ title: "删除域名", message: `确认删除 ${domainName}？将同时清理 Cloudflare 配置。`, confirmText: "删除", danger: true });
    if (!ok) return;
    try {
      await apiDelete(`/admin/domains/${id}`);
      toast("域名已删除", "ok");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "删除失败", "error"); }
  }

  async function handleConfigure(id: string) {
    try {
      await apiPost(`/admin/domains/${id}/configure-cloudflare`);
      toast("Cloudflare 已配置", "ok");
    } catch (e) { toast(e instanceof Error ? e.message : "配置失败", "error"); }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold">域名</h2>
        <div className="flex items-center gap-2">
          <input className="input !py-2 !text-sm w-48" placeholder="搜索域名..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {isAdmin && <button className="btn-primary whitespace-nowrap" onClick={() => setAddOpen(true)}>添加域名</button>}
        </div>
      </div>
      <Table
        columns={[
          { key: "domain", header: "域名", render: (d) => <span className="font-mono text-sm">{d.domain}</span> },
          { key: "type", header: "类型", width: "90px", render: (d) => <StatusTag value={d.type} /> },
          { key: "status", header: "状态", width: "90px", render: (d) => <StatusTag value={d.status} /> },
          ...(isAdmin ? [{ key: "actions", header: "操作", className: "!overflow-visible whitespace-nowrap", render: (d: Domain) => (
            <Dropdown>
              <DropdownItem onClick={() => setEditItem(d)}>编辑</DropdownItem>
              <DropdownItem onClick={() => handleConfigure(d.id)}>配置 CF</DropdownItem>
              <DropdownItem danger onClick={() => handleDelete(d.id, d.domain)}>删除</DropdownItem>
            </Dropdown>
          )}] : []),
        ]}
        data={filtered}
        loading={loading}
        emptyTitle="暂无域名"
        emptyDescription={isAdmin ? "添加一个域名来开始接收邮件" : "请联系管理员分配域名"}
        emptyAction={isAdmin ? <button className="btn-primary" onClick={() => setAddOpen(true)}>添加第一个域名</button> : undefined}
        pagination={pagination}
        onPageChange={(p) => load(p, pagination.pageSize)}
        onPageSizeChange={(s) => load(1, s)}
      />
      <AddDomainModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      {editItem && <EditDomainModal domain={editItem} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
    </div>
  );
}

function AddDomainModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (domain: string, type: string) => void }) {
  const [domain, setDomain] = useState("");
  const [type, setType] = useState("root");
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal open={open} title="添加域名" onClose={onClose} onConfirm={async () => { if (!domain.trim()) return; setSubmitting(true); await onSubmit(domain.trim(), type); setSubmitting(false); }} confirmText="添加" loading={submitting}>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-muted block mb-1.5">域名</label>
          <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" autoFocus />
          {!domain.trim() && <p className="text-xs text-danger mt-1">域名不能为空</p>}
        </div>
        <div>
          <label className="text-sm text-muted block mb-1.5">类型</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="root">根域名</option>
            <option value="subdomain">子域名</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

function EditDomainModal({ domain, onClose, onSubmit }: { domain: Domain; onClose: () => void; onSubmit: (id: string, type: string, status: string) => void }) {
  const [type, setType] = useState(domain.type);
  const [status, setStatus] = useState(domain.status);
  return (
    <Modal open title={`编辑 ${domain.domain}`} onClose={onClose} onConfirm={() => onSubmit(domain.id, type, status)} confirmText="保存">
      <div className="space-y-3">
        <div>
          <label className="text-sm text-muted block mb-1.5">类型</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="root">根域名</option>
            <option value="subdomain">子域名</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-muted block mb-1.5">状态</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">激活</option>
            <option value="pending">待处理</option>
            <option value="disabled">禁用</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
