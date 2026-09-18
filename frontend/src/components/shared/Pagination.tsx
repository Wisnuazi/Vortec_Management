"use client";

import { Button } from "./Button";
import styles from "./Pagination.module.css";

/**
 * DEC-069: shared Pagination — used on long tables (admin/users,
 * vendors, inventory, assets, projects list, material requests).
 *
 * Renders "Prev · page N of M · Next" + a "Rows per page" selector.
 * Page index is 0-based externally (so the first page is `0`) but
 * the label is 1-based so the UI matches what users expect.
 *
 * The component is controlled — caller owns the page/limit state
 * so search/filter changes can reset to page 0 without surprises.
 */

export type PageSize = 10 | 25 | 50 | 100;

export interface PaginationProps {
  page: number;
  pageSize: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: PageSize) => void;
  pageSizeOptions?: PageSize[];
  /** Optional aria-label for the pagination landmark. */
  label?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  label,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const firstRow = total === 0 ? 0 : safePage * pageSize + 1;
  const lastRow = Math.min(total, (safePage + 1) * pageSize);

  return (
    <nav className={styles.wrap} aria-label={label ?? "Pagination"}>
      <span className={styles.summary}>
        {firstRow}–{lastRow} of {total}
      </span>
      <div className={styles.controls}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 0}
          aria-label="Previous page"
        >
          ←
        </Button>
        <span className={styles.pageBadge}>
          {safePage + 1} / {totalPages}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages - 1}
          aria-label="Next page"
        >
          →
        </Button>
        {onPageSizeChange && (
          <select
            className={styles.sizeSelect}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>
    </nav>
  );
}
