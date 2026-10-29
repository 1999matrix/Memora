import { APP_CONSTANTS } from '../constants/app.constants';

export function getSkipTake(page = 1, limit: number = APP_CONSTANTS.PAGINATION.DEFAULT_LIMIT) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(
    Math.max(limit, 1),
    APP_CONSTANTS.PAGINATION.MAX_LIMIT,
  );

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}
