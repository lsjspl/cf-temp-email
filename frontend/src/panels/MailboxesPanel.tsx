import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import { Pagination, RawPagination, mapPagination } from "../lib/pagination";
import Table from "../components/Table";
import Modal from "../components/Modal";
import StatusTag from "../components/StatusTag";
import Dropdown, { DropdownItem } from "../components/Dropdown";
import TimeCell from "../components/TimeCell";
import { useToast } from "../components/Toast";
import { useConfirm } from "../hooks/useConfirm";
import { copyText } from "../lib/utils";

interface Mailbox { id: string; email_address: string; status: string; expires_at: string; encrypted_access_url?: string }
interface Domain { id: string; domain: string; status?: string }

export default function MailboxesPanel({ isAdmin }: { isAdmin: boolean }) {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [createdMailbox, setCreatedMailbox] = useState<Mailbox | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const res = await apiGet<{ mailboxes: Mailbox[]; pagination: RawPagination }>(`/user/mailboxes?page=${page}&page_size=${pageSize}`);
      setMailboxes(res.mailboxes);
      setPagination(mapPagination(res.pagination));
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); loadDomains(); }, []);

  async function loadDomains() {
    try {
      const path = isAdmin ? "/admin/domains?page=1&page_size=200" : "/user/domains?page=1&page_size=200";
      const res = await apiGet<{ domains: Domain[] }>(path);
      setDomains(isAdmin ? res.domains.filter((d) => d.status === "active") : res.domains);
    } catch { /* ignore */ }
  }

  const filtered = search ? mailboxes.filter((m) => m.email_address.toLowerCase().includes(search.toLowerCase())) : mailboxes;

  async function handleCreate(domainId: string, prefix: string, ttl: number) {
    try {
      const res = await apiPost<Mailbox>("/user/mailboxes", { domain_id: domainId, prefix: prefix || undefined, ttl_seconds: ttl });
      toast(`${res.email_address} 已创建`, "ok");
      setCreatedMailbox(res);
      setAddOpen(false);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "创建失败", "error"); }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "删除邮箱", message: "确认删除该邮箱及其所有邮件？此操作不可撤销。", confirmText: "删除", danger: true });
    if (!ok) return;
    try {
      await apiDelete(`/user/mailboxes/${id}`);
      toast("邮箱已删除", "ok");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "删除失败", "error"); }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold">邮箱</h2>
        <div className="flex items-center gap-2">
          <input className="input !py-2 !text-sm w-48" placeholder="搜索邮箱地址..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn-primary whitespace-nowrap" onClick={() => setAddOpen(true)}>创建邮箱</button>
        </div>
      </div>
      <Table
        columns={[
          { key: "email", header: "邮箱地址", width: "280px", render: (m) => <span className="font-mono text-sm">{m.email_address}</span> },
          { key: "status", header: "状态", width: "90px", render: (m) => <StatusTag value={m.status} /> },
          { key: "expires", header: "过期时间", width: "180px", render: (m) => <TimeCell value={m.expires_at} /> },
          { key: "link", header: "访问链接", render: (m) => m.encrypted_access_url ? (
            <div className="flex items-center gap-1.5">
              <a href={m.encrypted_access_url} target="_blank" rel="noreferrer" className="btn-ghost !px-2 !py-1 !min-h-0 text-sm">打开</a>
              <button className="btn-ghost !px-2 !py-1 !min-h-0 text-sm" onClick={() => { copyText(m.encrypted_access_url!); toast("已复制", "ok"); }}>复制</button>
            </div>
          ) : <span className="text-muted">-</span> },
          { key: "actions", header: "操作", width: "80px", render: (m) => (
            <Dropdown>
              <DropdownItem danger onClick={() => handleDelete(m.id)}>删除</DropdownItem>
            </Dropdown>
          )},
        ]}
        data={filtered}
        loading={loading}
        emptyTitle="暂无邮箱"
        emptyDescription="创建一个邮箱来接收临时邮件"
        emptyAction={<button className="btn-primary" onClick={() => setAddOpen(true)}>创建第一个邮箱</button>}
        pagination={pagination}
        onPageChange={(p) => load(p, pagination.pageSize)}
        onPageSizeChange={(s) => load(1, s)}
      />
      <CreateMailboxModal open={addOpen} domains={domains} onClose={() => setAddOpen(false)} onSubmit={handleCreate} />
      {createdMailbox && (
        <Modal open title="邮箱已创建 ✓" onClose={() => setCreatedMailbox(null)} confirmText="关闭" onConfirm={() => setCreatedMailbox(null)}>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted block mb-1">邮箱地址</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-white">{createdMailbox.email_address}</span>
                <button className="btn-ghost !px-2 !py-1 !min-h-0 text-xs" onClick={() => { copyText(createdMailbox.email_address); toast("已复制", "ok"); }}>复制</button>
              </div>
            </div>
            {createdMailbox.encrypted_access_url && (
              <div>
                <span className="text-xs text-muted block mb-1">访问链接</span>
                <div className="flex items-center gap-2">
                  <a href={createdMailbox.encrypted_access_url} target="_blank" rel="noreferrer" className="btn-ghost !px-2 !py-1 !min-h-0 text-xs">打开收件箱</a>
                  <button className="btn-ghost !px-2 !py-1 !min-h-0 text-xs" onClick={() => { copyText(createdMailbox.encrypted_access_url!); toast("已复制", "ok"); }}>复制链接</button>
                </div>
              </div>
            )}
            <div>
              <span className="text-xs text-muted block mb-1">过期时间</span>
              <span className="text-sm">{new Date(createdMailbox.expires_at).toLocaleString()}</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateMailboxModal({ open, domains, onClose, onSubmit }: { open: boolean; domains: Domain[]; onClose: () => void; onSubmit: (domainId: string, prefix: string, ttl: number) => void }) {
  const [domainId, setDomainId] = useState("");
  const [prefix, setPrefix] = useState("");
  const [ttl, setTtl] = useState(86400);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (domains.length && !domainId) setDomainId(domains[0]!.id); }, [domains, domainId]);

  async function handleConfirm() {
    if (!domainId) return;
    setSubmitting(true);
    await onSubmit(domainId, prefix, ttl);
    setSubmitting(false);
  }

  return (
    <Modal open={open} title="创建邮箱" onClose={onClose} onConfirm={handleConfirm} confirmText="创建" loading={submitting}>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-muted block mb-1.5">域名</label>
          {domains.length === 0 ? (
            <p className="text-sm text-danger">暂无可用域名，请先添加并激活域名</p>
          ) : (
            <select className="input" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="text-sm text-muted block mb-1.5">前缀（留空随机生成）</label>
          <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="例如：test-user" />
          <p className="text-xs text-muted mt-1">支持小写字母、数字、- 或 _，2-63 字符</p>
        </div>
        <div>
          <label className="text-sm text-muted block mb-1.5">有效期</label>
          <select className="input" value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
            <option value={3600}>1 小时</option>
            <option value={21600}>6 小时</option>
            <option value={86400}>1 天</option>
            <option value={604800}>7 天</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
