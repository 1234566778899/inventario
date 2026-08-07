import { MatPaginatorIntl } from '@angular/material/paginator';

/** Spanish labels for MatPaginator — Material ships English-only by default. */
export function spanishPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();

  intl.itemsPerPageLabel = 'Filas por página:';
  intl.nextPageLabel = 'Página siguiente';
  intl.previousPageLabel = 'Página anterior';
  intl.firstPageLabel = 'Primera página';
  intl.lastPageLabel = 'Última página';

  intl.getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) return `0 de ${length}`;
    const start = page * pageSize;
    // Guard against a start index past the end, which happens if length shrinks.
    const end = start < length ? Math.min(start + pageSize, length) : start + pageSize;
    return `${start + 1} – ${end} de ${length}`;
  };

  return intl;
}
