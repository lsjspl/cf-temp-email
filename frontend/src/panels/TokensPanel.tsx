import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api"
import { Pagination, RawPagination, mapPagination } from "../lib/pagination";
import Table from "../components/Table";
import Modal from "../components/Modal";
import StatusTag from "../components/StatusTag";
import Dropdown, { DropdownItem } from "../components/Dropdown";
import { useToast } from "../components/Toast";
import { useConfirm } from "../hooks/useConfirm";
import { formatTime, copyText } from "../lib/utils";

interface Token { id: string; name: string; token_prefix: string; status: string; last_used_at: string | null }

export default function TokensPanel() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState("");
  const [editItem, setEditItem] = useState<Token | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (page = 1, pageSize = 20) => {
    try {
      const res = await apiGet<{ tokens: Token[]; pagination: RawPagination }>(`/user/api-tokens?page=${page}&page_size=${pageSize}`);
      setTokens(res.tokens);
      setPagination(mapPagination(res.pagination));
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
  }, [toast]);

  useEffect(() => { load(); }, []);

  const filtered = search ? tokens.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())) : tokens;

  async function handleCreate(name: string) {
    const res = await apiPost<{ token: Token; value: string }>("/user/api-tokens", { name });
    setNewTokenValue(res.value);
    setAddOpen(false);
    load();
  }

  async function handleRevoke(id: string) {
    const ok = await confirm({ title: "撤销 Token", message: "确认撤销该 Token？撤销后客户端将立即失去访问权限，无法恢复。", confirmText: "撤销", danger: true });
    if (!ok) return;
    await apiDelete(`/user/api-tokens/${id}`);
    toast("Token 已撤销", "ok");
    load();
  }

  async function handleEdit(id: string, name: string) {
    await apiPatch(`/user/api-tokens/${id}`, { name });
    toast("Token 已更新", "ok");
    setEditItem(null);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold">API Token</h2>
        <div className="flex items-center gap-2">
          <input className="input !py-2 !text-sm max-w-[200px]" placeholder="搜索..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn-primary text-sm whitespace-nowrap" onClick={() => setAddOpen(true)}>创建 Token</button>
        </div>
      </div>
      <Table
        columns={[
          { key: "name", header: "名称", render: (t) => t.name },
          { key: "prefix", header: "前缀", render: (t) => <span className="font-mono text-xs">{t.token_prefix}</span> },
          { key: "status", header: "状态", render: (t) => <StatusTag value={t.status} /> },
          { key: "lastUsed", header: "最近使用", render: (t) => <span className="text-xs text-muted">{formatTime(t.last_used_at)}</span> },
          { key: "actions", header: "操作", render: (t) => t.status === "revoked" ? <span className="text-muted text-xs">已撤销</span> : (
            <Dropdown>
              <DropdownItem onClick={() => setEditItem(t)}>编辑</DropdownItem>
              <DropdownItem danger onClick={() => handleRevoke(t.id)}>撤销</DropdownItem>
            </Dropdown>
          )},
        ]}
        data={filtered}
        pagination={pagination}
        onPageChange={(p) => load(p, pagination.pageSize)}
        onPageSizeChange={(s) => load(1, s)}
      />
      <CreateTokenModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleCreate} />
      {newTokenValue && (
        <Modal open title="Token 已创建" onClose={() => setNewTokenValue("")} confirmText="关闭" onConfirm={() => setNewTokenValue("")}>
          <p className="mb-2">请立即复制保存，Token 不会再次显示：</p>
          <div className="font-mono text-xs bg-white/[0.04] p-3 rounded break-all select-all">{newTokenValue}</div>
          <button className="btn-ghost text-xs mt-2" onClick={() => { copyText(newTokenValue); toast("已复制", "ok"); }}>复制</button>
        </Modal>
      )}
      {editItem && <EditTokenModal token={editItem} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
    </div>
  );
}

function CreateTokenModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Modal open={open} title="创建 Token" onClose={onClose} onConfirm={() => { if (name) onSubmit(name); }} confirmText="创建">
      <div><label className="text-xs text-muted block mb-1">名称</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：integration-server" /></div>
    </Modal>
  );
}

function EditTokenModal({ token, onClose, onSubmit }: { token: Token; onClose: () => void; onSubmit: (id: string, name: string) => void }) {
  const [name, setName] = useState(token.name);
  return (
    <Modal open title="编辑 Token" onClose={onClose} onConfirm={() => { if (name) onSubmit(token.id, name); }} confirmText="保存">
      <div><label className="text-xs text-muted block mb-1">名称</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
    </Modal>
  );
}
