import { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  emptyText?: string;
  pagination?: { page: number; totalPages: number; total: number; pageSize: number };
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export default function Table<T extends { id?: string }>({ columns, data, emptyText, pagination, onPageChange, onPageSizeChange }: Props<T>) {
  return (
    <div className="border border-line rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-white/[0.02]">
              {columns.map((col) => (
                <th key={col.key} className={`px-3.5 py-2.5 text-left text-xs font-semibold text-muted uppercase ${col.className ?? ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted">
                  <div className="text-2xl mb-1">📭</div>
                  {emptyText || "暂无数据"}
                </td>
              </tr>
            ) : (
              data.map((item, i) => (
                <tr key={item.id ?? i} className="hover:bg-white/[0.03] transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-3.5 py-3 text-sm ${col.className ?? ""}`}>
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 0 && (
        <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-line bg-white/[0.02] text-xs text-muted flex-wrap gap-2">
          <span>第 {pagination.page}/{pagination.totalPages} 页 · 共 {pagination.total} 条</span>
          <div className="flex items-center gap-1.5">
            <select
              className="bg-white/[0.04] border border-line-strong text-white rounded px-1.5 py-1 text-xs"
              value={pagination.pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            >
              {[10, 20, 50].map((s) => <option key={s} value={s}>{s}/页</option>)}
            </select>
            <button className="btn-ghost !px-2 !py-1 !text-xs !min-h-0" disabled={pagination.page <= 1} onClick={() => onPageChange?.(pagination.page - 1)}>上一页</button>
            <button className="btn-ghost !px-2 !py-1 !text-xs !min-h-0" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange?.(pagination.page + 1)}>下一页</button>
          </div>
        </div>
      )}
    </div>
  );
}
