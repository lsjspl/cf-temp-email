import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../lib/api"
import { Pagination, RawPagination, mapPagination } from "../lib/pagination";
import Table from "../components/Table";
import Modal from "../components/Modal";
import StatusTag from "../components/StatusTag";
import Dropdown, { DropdownItem } from "../components/Dropdown";
import { useToast } from "../components/Toast";
import { useConfirm } from "../hooks/useConfirm";
import { formatTime, copyText } from "../lib/utils";

interface Mailbox { id: string; email_address: string; status: string; expires_at: string; encrypted_access_url?: string }
interface Domain { id: string; domain: string }

export default function MailboxesPanel() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (page = 1, pageSize = 20) => {
    try {
      const res = await apiGet<{ mailboxes: Mailbox[]; pagination: RawPagination }>(`/user/mailboxes?page=${page}&page_size=${pageSize}`);
      setMailboxes(res.mailboxes);
      setPagination(mapPagination(res.pagination));
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
  }, [toast]);

  useEffect(() => { load(); loadDomains(); }, []);

  async function loadDomains() {
    try {
      const res = await apiGet<{ domains: Domain[] }>("/user/domains?page=1&page_size=200");
      setDomains(res.domains);
    } catch { /* ignore */ }
  }

  const filtered = search ? mailboxes.filter((m) => m.email_address.includes(search)) : mailboxes;

  async function handleCreate(domainId: string, prefix: string, ttl: number) {
    const res = await apiPost<Mailbox>("/user/mailboxes", { domain_id: domainId, prefix: prefix || undefined, ttl_seconds: ttl });
    toast(`${res.email_address} 已创建`, "ok");
    setAddOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "删除邮箱", message: "确认删除该邮箱及其所有邮件？", confirmText: "删除", danger: true });
    if (!ok) return;
    await apiDelete(`/user/mailboxes/${id}`);
    toast("邮箱已删除", "ok");
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold">邮箱</h2>
        <div className="flex items-center gap-2">
          <input className="input !py-2 !text-sm max-w-[200px]" placeholder="搜索..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn-primary text-sm whitespace-nowrap" onClick={() => setAddOpen(true)}>创建邮箱</button>
        </div>
      </div>
      <Table
        columns={[
          { key: "email", header: "邮箱地址", render: (m) => <span className="font-mono text-xs">{m.email_address}</span> },
          { key: "status", header: "状态", render: (m) => <StatusTag value={m.status} /> },
          { key: "expires", header: "过期时间", render: (m) => <span className="text-xs text-muted">{formatTime(m.expires_at)}</span> },
          { key: "link", header: "访问链接", render: (m) => m.encrypted_access_url ? (
            <div className="flex items-center gap-1.5">
              <a href={m.encrypted_access_url} target="_blank" rel="noreferrer" className="btn-ghost !px-2 !py-1 !text-xs !min-h-0">打开</a>
              <button className="btn-ghost !px-2 !py-1 !text-xs !min-h-0" onClick={() => { copyText(m.encrypted_access_url!); toast("已复制", "ok"); }}>复制</button>
            </div>
          ) : <span className="text-muted">-</span> },
          { key: "actions", header: "操作", render: (m) => (
            <Dropdown>
              <DropdownItem danger onClick={() => handleDelete(m.id)}>删除</DropdownItem>
            </Dropdown>
          )},
        ]}
        data={filtered}
        pagination={pagination}
        onPageChange={(p) => load(p, pagination.pageSize)}
        onPageSizeChange={(s) => load(1, s)}
      />
      <CreateMailboxModal open={addOpen} domains={domains} onClose={() => setAddOpen(false)} onSubmit={handleCreate} />
    </div>
  );
}

function CreateMailboxModal({ open, domains, onClose, onSubmit }: { open: boolean; domains: Domain[]; onClose: () => void; onSubmit: (domainId: string, prefix: string, ttl: number) => void }) {
  const [domainId, setDomainId] = useState("");
  const [prefix, setPrefix] = useState("");
  const [ttl, setTtl] = useState(86400);

  useEffect(() => { if (domains.length && !domainId) setDomainId(domains[0]!.id); }, [domains, domainId]);

  return (
    <Modal open={open} title="创建邮箱" onClose={onClose} onConfirm={() => { if (domainId) onSubmit(domainId, prefix, ttl); }} confirmText="创建">
      <div className="space-y-3">
        <div><label className="text-xs text-muted block mb-1">域名</label><select className="input" value={domainId} onChange={(e) => setDomainId(e.target.value)}>{domains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}</select></div>
        <div><label className="text-xs text-muted block mb-1">前缀（留空随机）</label><input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="留空则随机生成" /></div>
        <div><label className="text-xs text-muted block mb-1">有效期</label><select className="input" value={ttl} onChange={(e) => setTtl(Number(e.target.value))}><option value={3600}>1 小时</option><option value={21600}>6 小时</option><option value={86400}>1 天</option><option value={604800}>7 天</option></select></div>
      </div>
    </Modal>
  );
}
