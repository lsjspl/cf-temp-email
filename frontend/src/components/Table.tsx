import { ReactNode } from "react";
import { InlineLoader } from "./Spinner";
import EmptyState from "./EmptyState";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
  width?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  pagination?: { page: number; totalPages: number; total: number; pageSize: number };
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export default function Table<T extends { id?: string }>({
  columns, data, loading, emptyTitle, emptyDescription, emptyAction, pagination, onPageChange, onPageSizeChange,
}: Props<T>) {
  if (loading) {
    return <InlineLoader />;
  }

  if (data.length === 0 && !loading) {
    return (
      <div className="border border-line rounded-md">
        <EmptyState
          title={emptyTitle || "暂无数据"}
          description={emptyDescription || "新建的内容会显示在这里"}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className="border border-line rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/[0.02]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3.5 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide ${col.className ?? ""}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((item, i) => (
              <tr key={item.id ?? i} className="hover:bg-white/[0.03] transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3.5 py-3 ${col.className ?? ""}`}
                    style={col.width ? { width: col.width, maxWidth: col.width } : undefined}
                  >
                    <div className="truncate">{col.render(item)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 0 && (
        <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-line bg-white/[0.02] text-sm text-muted flex-wrap gap-2">
          <span>第 {pagination.page}/{pagination.totalPages} 页 · 共 {pagination.total} 条</span>
          <div className="flex items-center gap-2">
            <select
              className="bg-white/[0.04] border border-line-strong text-white rounded px-2 py-1 text-sm"
              value={pagination.pageSize}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v > 0) onPageSizeChange?.(v);
              }}
            >
              {[10, 20, 50].map((s) => <option key={s} value={s}>{s} 条/页</option>)}
            </select>
            <button className="btn-ghost !px-2.5 !py-1 !min-h-0" disabled={pagination.page <= 1} onClick={() => onPageChange?.(pagination.page - 1)}>‹ 上一页</button>
            <button className="btn-ghost !px-2.5 !py-1 !min-h-0" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange?.(pagination.page + 1)}>下一页 ›</button>
          </div>
        </div>
      )}
    </div>
  );
}
