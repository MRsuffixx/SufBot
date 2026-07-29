'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from './page-primitives';
import { cn } from '@/lib/utils';

export type DataTableColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  hideOnMobile?: boolean;
  className?: string;
};

export type DataTableCell = {
  value: string;
  sortValue?: string | number;
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'info' | 'premium';
  mono?: boolean;
};

export type DataTableRow = {
  id: string;
  cells: Record<string, DataTableCell>;
};

export function DataTable({
  columns,
  rows,
  searchPlaceholder = 'Search…',
  emptyTitle = 'No data',
  emptyDescription = 'There are no rows to display.',
  pageSize = 20,
  selectable = false,
}: {
  columns: readonly DataTableColumn[];
  rows: readonly DataTableRow[];
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  selectable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(columns.map((column) => column.key)),
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = rows.filter(
      (row) =>
        normalized === '' ||
        Object.values(row.cells).some((cell) => cell.value.toLowerCase().includes(normalized)),
    );
    if (sort === null) return result;
    return [...result].sort((left, right) => {
      const leftValue = left.cells[sort.key]?.sortValue ?? left.cells[sort.key]?.value ?? '';
      const rightValue = right.cells[sort.key]?.sortValue ?? right.cells[sort.key]?.value ?? '';
      const comparison =
        typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue));
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [query, rows, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const currentColumns = columns.filter((column) => visibleColumns.has(column.key));
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id));

  const toggleSort = (column: DataTableColumn) => {
    if (column.sortable !== true) return;
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: 'asc' },
    );
    setPage(0);
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle-foreground"
          />
          <Input
            value={query}
            placeholder={searchPlaceholder}
            className="max-w-md pl-9"
            aria-label={searchPlaceholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </div>
        {selected.size > 0 ? (
          <span className="text-xs font-semibold text-primary">{selected.size} selected</span>
        ) : null}
        <details className="relative">
          <summary className="flex h-[var(--control-height)] cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">
            <Columns3 size={14} /> Columns
          </summary>
          <div className="absolute top-[calc(100%+.4rem)] right-0 z-[var(--z-popover)] w-52 rounded-lg border border-border-strong bg-surface-elevated p-2 shadow-lg">
            {columns.map((column) => (
              <label
                key={column.key}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-secondary"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.has(column.key)}
                  onChange={() =>
                    setVisibleColumns((current) => {
                      const next = new Set(current);
                      if (next.has(column.key) && next.size > 1) next.delete(column.key);
                      else next.add(column.key);
                      return next;
                    })
                  }
                />
                {column.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState
          className="m-3"
          title={emptyTitle}
          description={query === '' ? emptyDescription : 'Try a different search term.'}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-surface-secondary/65 text-[10px] font-bold tracking-[0.08em] text-subtle-foreground uppercase">
                <tr>
                  {selectable ? (
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select visible rows"
                        checked={allVisibleSelected}
                        onChange={() => {
                          setSelected((current) => {
                            const next = new Set(current);
                            for (const row of visibleRows) {
                              if (allVisibleSelected) next.delete(row.id);
                              else next.add(row.id);
                            }
                            return next;
                          });
                        }}
                      />
                    </th>
                  ) : null}
                  {currentColumns.map((column) => (
                    <th key={column.key} className={cn('px-4 py-3', column.className)}>
                      <button
                        type="button"
                        disabled={column.sortable !== true}
                        className="inline-flex items-center gap-1.5 disabled:cursor-default"
                        onClick={() => toggleSort(column)}
                      >
                        {column.label}
                        {sort?.key === column.key ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp size={12} />
                          ) : (
                            <ArrowDown size={12} />
                          )
                        ) : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-secondary/45">
                    {selectable ? (
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${row.id}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelected(row.id)}
                        />
                      </td>
                    ) : null}
                    {currentColumns.map((column) => (
                      <td key={column.key} className={cn('px-4 py-3.5', column.className)}>
                        <Cell cell={row.cells[column.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 p-3 md:hidden">
            {visibleRows.map((row) => (
              <div key={row.id} className="rounded-lg border border-border bg-surface-elevated p-3">
                {selectable ? (
                  <label className="mb-2 flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelected(row.id)}
                    />
                    Select
                  </label>
                ) : null}
                <dl className="grid gap-2.5">
                  {currentColumns
                    .filter((column) => column.hideOnMobile !== true)
                    .map((column) => (
                      <div
                        key={column.key}
                        className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-xs"
                      >
                        <dt className="text-muted-foreground">{column.label}</dt>
                        <dd className="min-w-0 break-words">
                          <Cell cell={row.cells[column.key]} />
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5">
        <p className="type-help">
          {filtered.length === 0
            ? '0 rows'
            : `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filtered.length)} of ${filtered.length}`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={safePage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft size={15} />
          </Button>
          <span className="min-w-16 text-center text-xs font-semibold">
            {safePage + 1} / {pageCount}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          >
            <ChevronRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Cell({ cell }: { cell: DataTableCell | undefined }) {
  if (cell === undefined) return <span className="text-subtle-foreground">—</span>;
  return (
    <span
      className={cn(
        'text-sm',
        cell.tone === 'muted' && 'text-muted-foreground',
        cell.tone === 'success' && 'font-semibold text-success',
        cell.tone === 'warning' && 'font-semibold text-warning',
        cell.tone === 'danger' && 'font-semibold text-danger',
        cell.tone === 'info' && 'font-semibold text-info',
        cell.tone === 'premium' && 'font-semibold text-premium',
        cell.mono === true && 'font-mono text-xs',
      )}
    >
      {cell.value}
    </span>
  );
}
