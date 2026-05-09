import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import Table from "../components/Table";
import Modal from "../components/Modal";
import StatusTag from "../components/StatusTag";
import Dropdown, { DropdownItem } from "../components/Dropdown";
import { useToast } from "../components/Toast";

interface Domain { id: string; domain: string; type: string; status: string; assigned_user_count?: number }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

export default function DomainsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Domain | null>(null);
  const toast = useToast();

  const load = useCallback(async (page = pagination.page, pageSize = pagination.pageSize) => {
    try {
      const path = isAdmin ? "/admin/domains" : "/user/domains";
      const res = await apiGet<{ domains: Domain[]; pagination: Pagination }>(`${path}?page=${page}&page_size=${pageSize}`);
      setDomains(res.domains);
      setPagination(res.pagination);
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
  }, [isAdmin, pagination.page, pagination.pageSize, toast]);

  useEffect(() => { load(); }, []);

  const filtered = search ? domains.filter((d) => d.domain.includes(search)) : domains;

  async function handleAdd(domain: string, type: string) {
    await apiPost("/admin/domains", { domain, type, status: "active" });
    toast("域名已创建", "ok");
    setAddOpen(false);
    load();
  }

  async function handleEdit(id: string, type: string, status: string) {
    await apiPatch(`/admin/domains/${id}`, { type, status });
    toast("域名已更新", "ok");
    setEditItem(null);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("确认删除该域名？")) return;
    await apiDelete(`/admin/domains/${id}`);
    toast("域名已删除", "ok");
    load();
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
          <input className="input !py-2 !text-sm max-w-[200px]" placeholder="搜索..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {isAdmin && <button className="btn-primary text-sm" onClick={() => setAddOpen(true)}>添加域名</button>}
        </div>
      </div>
      <Table
        columns={[
          { key: "domain", header: "域名", render: (d) => <span className="font-mono text-xs">{d.domain}</span> },
          { key: "type", header: "类型", render: (d) => <StatusTag value={d.type} /> },
          { key: "status", header: "状态", render: (d) => <StatusTag value={d.status} /> },
          ...(isAdmin ? [{ key: "actions", header: "操作", render: (d: Domain) => (
            <Dropdown>
              <DropdownItem onClick={() => setEditItem(d)}>编辑</DropdownItem>
              <DropdownItem onClick={() => handleConfigure(d.id)}>配置 Cloudflare</DropdownItem>
              <DropdownItem danger onClick={() => handleDelete(d.id)}>删除</DropdownItem>
            </Dropdown>
          )}] : []),
        ]}
        data={filtered}
        pagination={pagination}
        onPageChange={(p) => load(p)}
        onPageSizeChange={(s) => load(1, s)}
      />
      <AddDomainModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      {editItem && <EditDomainModal domain={editItem} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
    </div>
  );
}

function AddDomainModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (domain: string, type: string) => void }) {
  const [domain, setDomain] = useState("");
  const [type, setType] = useState("subdomain");
  return (
    <Modal open={open} title="添加域名" onClose={onClose} onConfirm={() => { if (domain) onSubmit(domain, type); }} confirmText="添加">
      <div className="space-y-3">
        <div><label className="text-xs text-muted block mb-1">域名</label><input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mail.example.com" /></div>
        <div><label className="text-xs text-muted block mb-1">类型</label><select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="subdomain">子域名</option><option value="root">根域名</option></select></div>
      </div>
    </Modal>
  );
}

function EditDomainModal({ domain, onClose, onSubmit }: { domain: Domain; onClose: () => void; onSubmit: (id: string, type: string, status: string) => void }) {
  const [type, setType] = useState(domain.type);
  const [status, setStatus] = useState(domain.status);
  return (
    <Modal open title="编辑域名" onClose={onClose} onConfirm={() => onSubmit(domain.id, type, status)} confirmText="保存">
      <div className="space-y-3">
        <div><label className="text-xs text-muted block mb-1">域名</label><input className="input opacity-60" value={domain.domain} disabled /></div>
        <div><label className="text-xs text-muted block mb-1">类型</label><select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="subdomain">子域名</option><option value="root">根域名</option></select></div>
        <div><label className="text-xs text-muted block mb-1">状态</label><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">激活</option><option value="pending">待处理</option><option value="disabled">禁用</option></select></div>
      </div>
    </Modal>
  );
}
