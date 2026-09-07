/**
 * Utilidades para generar y leer CSV.
 *
 * Excel en Windows no detecta UTF-8 por su cuenta: sin BOM abre el archivo como
 * Windows-1252 y "Categoría" se lee "CategorÃ­a". Por eso todo CSV que
 * generemos empieza con BOM y usa saltos CRLF (RFC 4180), y la importación
 * descarta ese BOM al leer para no ensuciar el primer encabezado.
 */

/** U+FEFF: la marca que le dice a Excel que el archivo es UTF-8. */
export const UTF8_BOM = '﻿';

/** Entrecomilla el texto (duplicando comillas) y deja los números crudos. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return `"${value.replace(/"/g, '""')}"`;
}

/** Arma el CSV completo, con BOM y CRLF, listo para `downloadCsv`. */
export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map(row => row.map(csvCell).join(',')),
  ];
  return UTF8_BOM + lines.join('\r\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // En un timeout: revocar en el mismo tick corta la descarga en algunos Chrome.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Quita el BOM inicial, para que el primer encabezado no llegue como "﻿SKU". */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
