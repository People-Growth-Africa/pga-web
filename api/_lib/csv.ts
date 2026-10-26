/**
 * One hardened cell renderer for every CSV export.
 *
 * Spreadsheet formula injection is the risk: a name beginning with =, +, -, @,
 * tab or carriage return can be executed when the file is opened. We trim,
 * flatten newlines so one record stays on one row, and prefix a single quote
 * before the cell is quoted. Both exports import this function so the rule
 * cannot drift between them.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, ' ')
    .trim();
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRows(rows: (string | number | null | undefined)[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
