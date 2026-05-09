import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { Pagination, RawPagination, mapPagination } from "../lib/pagination";
import Table from "../components/Table";
import Modal from "../components/Modal";
import StatusTag from "../components/StatusTag";
import TimeCell from "../components/TimeCell";
import Dropdown, { DropdownItem } from "../components/Dropdown";
import { useToast } from "../components/Toast";
import { useConfirm } from "../hooks/useConfirm";
import { copyText } from "../lib/utils";

interface Token { id: string; name: string; token_prefix: string; status: string; last_used_at: string | null }

export default function TokensPanel() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState("");
  const [editItem, setEditItem] = useState<Token | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const res = await apiGet<{ tokens: Token[]; pagination: RawPagination }>(`/user/api-tokens?page=${page}&page_size=${pageSize}`);
      setTokens(res.tokens);
      setPagination(mapPagination(res.pagination));
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, []);

  const filtered = search ? tokens.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())) : tokens;

  async function handleCreate(name: string) {
    try {
      const res = await apiPost<{ token: Token; value: string }>("/user/api-tokens", { name });
      setNewTokenValue(res.value);
      setAddOpen(false);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "创建失败", "error"); }
  }

  async function handleRevoke(id: string) {
    const ok = await confirm({ title: "撤销 Token", message: "确认撤销？客户端将立即失去访问权限，无法恢复。", confirmText: "撤销", danger: true });
    if (!ok) return;
    try {
      await apiDelete(`/user/api-tokens/${id}`);
      toast("Token 已撤销", "ok");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "操作失败", "error"); }
  }

  async function handleEdit(id: string, name: string) {
    try {
      await apiPatch(`/user/api-tokens/${id}`, { name });
      toast("Token 已更新", "ok");
      setEditItem(null);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "操作失败", "error"); }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold">API Token</h2>
        <div className="flex items-center gap-2">
          <input className="input !py-2 !text-sm w-48" placeholder="搜索名称..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn-primary whitespace-nowrap" onClick={() => setAddOpen(true)}>创建 Token</button>
        </div>
      </div>
      <Table
        columns={[
          { key: "name", header: "名称", render: (t) => <span className="font-medium">{t.name}</span> },
          { key: "prefix", header: "前缀", width: "140px", render: (t) => <span className="font-mono text-sm text-muted">{t.token_prefix}...</span> },
          { key: "status", header: "状态", width: "90px", render: (t) => <StatusTag value={t.status} /> },
          { key: "lastUsed", header: "最近使用", width: "180px", render: (t) => <TimeCell value={t.last_used_at} /> },
          { key: "actions", header: "操作", className: "!overflow-visible whitespace-nowrap", render: (t) => t.status === "revoked" ? <span className="text-muted text-sm">已撤销</span> : (
            <Dropdown>
              <DropdownItem onClick={() => setEditItem(t)}>编辑名称</DropdownItem>
              <DropdownItem danger onClick={() => handleRevoke(t.id)}>撤销</DropdownItem>
            </Dropdown>
          )},
        ]}
        data={filtered}
        loading={loading}
        emptyTitle="暂无 Token"
        emptyDescription="创建 API Token 用于程序化访问"
        emptyAction={<button className="btn-primary" onClick={() => setAddOpen(true)}>创建第一个 Token</button>}
        pagination={pagination}
        onPageChange={(p) => load(p, pagination.pageSize)}
        onPageSizeChange={(s) => load(1, s)}
      />
      <CreateTokenModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleCreate} />
      {newTokenValue && (
        <Modal open title="Token 已创建 ✓" onClose={() => setNewTokenValue("")} confirmText="我已保存" onConfirm={() => setNewTokenValue("")}>
          <div className="space-y-3">
            <p className="text-sm text-warning">⚠️ 请立即复制保存，Token 不会再次显示！</p>
            <div className="font-mono text-sm bg-white/[0.04] border border-line rounded-md p-3 break-all select-all">{newTokenValue}</div>
            <button className="btn-primary w-full" onClick={() => { copyText(newTokenValue); toast("已复制到剪贴板", "ok"); }}>复制 Token</button>
          </div>
        </Modal>
      )}
      {editItem && <EditTokenModal token={editItem} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
    </div>
  );
}

function CreateTokenModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal open={open} title="创建 Token" onClose={onClose} onConfirm={async () => { if (!name.trim()) return; setSubmitting(true); await onSubmit(name.trim()); setSubmitting(false); }} confirmText="创建" loading={submitting}>
      <div>
        <label className="text-sm text-muted block mb-1.5">名称</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：integration-server" autoFocus />
        {!name.trim() && <p className="text-xs text-danger mt-1">名称不能为空</p>}
      </div>
    </Modal>
  );
}

function EditTokenModal({ token, onClose, onSubmit }: { token: Token; onClose: () => void; onSubmit: (id: string, name: string) => void }) {
  const [name, setName] = useState(token.name);
  return (
    <Modal open title="编辑 Token" onClose={onClose} onConfirm={() => { if (name.trim()) onSubmit(token.id, name.trim()); }} confirmText="保存">
      <div>
        <label className="text-sm text-muted block mb-1.5">名称</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
    </Modal>
  );
}
