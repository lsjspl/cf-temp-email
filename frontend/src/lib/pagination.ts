export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 后端返回的分页格式（snake_case） */
export interface RawPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** 将后端 snake_case 分页转为前端 camelCase */
export function mapPagination(raw: RawPagination): Pagination {
  return {
    page: raw.page ?? 1,
    pageSize: raw.page_size ?? 20,
    total: raw.total ?? 0,
    totalPages: raw.total_pages ?? 1,
  };
}
