export const visibleListItems = <T>(items: T[], visibleCount: number) =>
  items.slice(0, visibleCount)

export const nextVisibleItemCount = (
  currentCount: number,
  totalCount: number,
  pageSize: number
) => Math.min(totalCount, currentCount + pageSize)
