import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api"
import { Pagination, RawPagination, mapPagination } from "../lib/pagination";
import Table from "../components/Table";
import Modal from "../components/Modal";
import StatusTag from "../components/StatusTag";
import Dropdown, { DropdownItem } from "../components/Dropdown";
import { useToast } from "../components/Toast";
import { useConfirm } from "../hooks/useConfirm";
import { formatTime } from "../lib/utils";

interface User { id: string; email: string; username: string | null; role: string; status: string; last_login_at: string | null }
interface Domain { id: string; domain: string }

export default function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<User | null>(null);
  const [assignUser, setAssignUser] = useState<User | null>(null);
  const [allDomains, setAllDomains] = useState<Domain[]>([]);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (page = 1, pageSize = 20) => {
    try {
      const res = await apiGet<{ users: User[]; pagination: RawPagination }>(`/admin/users?page=${page}&page_size=${pageSize}`);
      setUsers(res.users);
      setPagination(mapPagination(res.pagination));
    } catch (e) { toast(e instanceof Error ? e.message : "加载失败", "error"); }
  }, [toast]);

  useEffect(() => { load(); loadDomains(); }, []);

  async function loadDomains() {
    try {
      const res = await apiGet<{ domains: Domain[] }>("/admin/domains?page=1&page_size=200");
      setAllDomains(res.domains.filter((d: Domain & { status?: string }) => (d as { status?: string }).status === "active"));
    } catch { /* ignore */ }
  }

  const filtered = search ? users.filter((u) => u.email.includes(search) || u.username?.includes(search)) : users;

  async function handleCreate(email: string, username: string, password: string, role: string) {
    await apiPost("/admin/users", { email, username, password, role });
    toast("用户已创建", "ok");
    setAddOpen(false);
    load();
  }

  async function handleEdit(id: string, data: { email?: string; username?: string; role?: string; status?: string }) {
    await apiPatch(`/admin/users/${id}`, data);
    toast("用户已更新", "ok");
    setEditItem(null);
    load();
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "删除用户", message: "确认删除该用户？将永久删除其所有邮箱和 Token。", confirmText: "删除", danger: true });
    if (!ok) return;
    await apiDelete(`/admin/users/${id}`);
    toast("用户已删除", "ok");
    load();
  }

  async function handleToggle(id: string, nextStatus: string) {
    await apiPatch(`/admin/users/${id}`, { status: nextStatus });
    toast("用户已更新", "ok");
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold">用户</h2>
        <div className="flex items-center gap-2">
          <input className="input !py-2 !text-sm max-w-[200px]" placeholder="搜索..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn-primary text-sm whitespace-nowrap" onClick={() => setAddOpen(true)}>创建用户</button>
        </div>
      </div>
      <Table
        columns={[
          { key: "email", header: "邮箱", render: (u) => <>{u.email}{u.id === currentUserId && <span className="ml-1.5 tag-default !text-[10px]">当前</span>}</> },
          { key: "role", header: "角色", render: (u) => <StatusTag value={u.role} /> },
          { key: "status", header: "状态", render: (u) => <StatusTag value={u.status} /> },
          { key: "lastLogin", header: "最近登录", render: (u) => <span className="text-xs text-muted">{formatTime(u.last_login_at)}</span> },
          { key: "actions", header: "操作", render: (u) => u.id === currentUserId ? <span className="text-muted text-xs">—</span> : (
            <Dropdown>
              <DropdownItem onClick={() => setAssignUser(u)}>分配域名</DropdownItem>
              <DropdownItem onClick={() => setEditItem(u)}>编辑</DropdownItem>
              <DropdownItem onClick={() => handleToggle(u.id, u.status === "active" ? "disabled" : "active")}>{u.status === "active" ? "禁用" : "启用"}</DropdownItem>
              <DropdownItem danger onClick={() => handleDelete(u.id)}>删除</DropdownItem>
            </Dropdown>
          )},
        ]}
        data={filtered}
        pagination={pagination}
        onPageChange={(p) => load(p, pagination.pageSize)}
        onPageSizeChange={(s) => load(1, s)}
      />
      <CreateUserModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleCreate} />
      {editItem && <EditUserModal user={editItem} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
      {assignUser && <AssignDomainsModal user={assignUser} allDomains={allDomains} onClose={() => setAssignUser(null)} toast={toast} />}
    </div>
  );
}

function CreateUserModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (email: string, username: string, password: string, role: string) => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  return (
    <Modal open={open} title="创建用户" onClose={onClose} onConfirm={() => { if (email && password) onSubmit(email, username, password, role); }} confirmText="创建">
      <div className="space-y-3">
        <div><label className="text-xs text-muted block mb-1">邮箱</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="text-xs text-muted block mb-1">用户名</label><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div><label className="text-xs text-muted block mb-1">密码</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div><label className="text-xs text-muted block mb-1">角色</label><select className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="user">用户</option><option value="admin">管理员</option></select></div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSubmit }: { user: User; onClose: () => void; onSubmit: (id: string, data: Record<string, string>) => void }) {
  const [email, setEmail] = useState(user.email);
  const [username, setUsername] = useState(user.username ?? "");
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  return (
    <Modal open title="编辑用户" onClose={onClose} onConfirm={() => onSubmit(user.id, { email, username, role, status })} confirmText="保存">
      <div className="space-y-3">
        <div><label className="text-xs text-muted block mb-1">邮箱</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="text-xs text-muted block mb-1">用户名</label><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div><label className="text-xs text-muted block mb-1">角色</label><select className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="user">用户</option><option value="admin">管理员</option></select></div>
        <div><label className="text-xs text-muted block mb-1">状态</label><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">激活</option><option value="disabled">禁用</option></select></div>
      </div>
    </Modal>
  );
}

function AssignDomainsModal({ user, allDomains, onClose, toast }: { user: User; allDomains: Domain[]; onClose: () => void; toast: import("../components/Toast").ToastFn }) {
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ domains: { id: string }[] }>(`/admin/users/${user.id}/domains?page=1&page_size=200`).then((res) => {
      const ids = new Set(res.domains.map((d) => d.id));
      setAssigned(ids);
      setOriginal(new Set(ids));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user.id]);

  async function handleSave() {
    const toAdd = [...assigned].filter((id) => !original.has(id));
    const toRemove = [...original].filter((id) => !assigned.has(id));
    try {
      for (const id of toAdd) await apiPost(`/admin/users/${user.id}/domains`, { domain_id: id });
      for (const id of toRemove) await apiDelete(`/admin/users/${user.id}/domains/${id}`);
      toast("域名已分配", "ok");
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : "操作失败", "error"); }
  }

  function toggle(id: string) {
    setAssigned((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <Modal open title={`分配域名 — ${user.email}`} onClose={onClose} onConfirm={handleSave} confirmText="保存" loading={loading}>
      {loading ? <p>加载中...</p> : (
        <div className="max-h-60 overflow-y-auto border border-line rounded-md">
          {allDomains.length === 0 ? <p className="p-3 text-muted text-sm">暂无激活域名</p> : allDomains.map((d) => (
            <label key={d.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.03] cursor-pointer transition-colors">
              <input type="checkbox" checked={assigned.has(d.id)} onChange={() => toggle(d.id)} className="w-4 h-4 accent-accent-strong" />
              <span className="font-mono text-sm">{d.domain}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
