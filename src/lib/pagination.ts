import type { Context } from "hono";

import { AppRouteError } from "./errors";

/** 分页默认值。 */
export const DEFAULT_PAGE_SIZE = 20;
/** 分页上限，防止前端一次性拉过量数据。 */
export const MAX_PAGE_SIZE = 200;

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ParseOptions {
  defaultPageSize?: number;
  maxPageSize?: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number, fieldName: string): number {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppRouteError(400, "VALIDATION_ERROR", `${fieldName} must be a positive integer.`);
  }

  return value;
}

/**
 * 从 Hono Context 读取 `page` 与 `page_size` 查询参数，返回规范化的分页参数。
 * `page_size` 会被限制在 [1, maxPageSize]。
 */
export function parsePagination(c: Context, options: ParseOptions = {}): PaginationParams {
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = options.maxPageSize ?? MAX_PAGE_SIZE;

  const page = parsePositiveInt(c.req.query("page"), 1, "page");
  const requestedPageSize = parsePositiveInt(
    c.req.query("page_size"),
    defaultPageSize,
    "page_size",
  );
  const pageSize = Math.min(requestedPageSize, maxPageSize);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

/** 根据总数构造分页元数据。 */
export function buildPaginationMeta(
  total: number,
  params: Pick<PaginationParams, "page" | "pageSize">,
): PaginationMeta {
  const totalPages = params.pageSize > 0 ? Math.max(1, Math.ceil(total / params.pageSize)) : 1;
  return {
    page: params.page,
    page_size: params.pageSize,
    total,
    total_pages: totalPages,
  };
}
