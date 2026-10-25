export type RangeKey = '7' | '30' | '90' | 'all';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function rangeWindow(range: RangeKey): { from: string; to: string } {
  const to = todayIso();
  if (range === 'all') return { from: '2000-01-01', to };
  const days = Number(range);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: isoDate(start), to };
}

/** The equally long window immediately before `from`. */
export function previousWindow(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const length = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (length - 1));
  return { from: isoDate(previousStart), to: isoDate(previousEnd) };
}

/** Fills missing days with zeros so a line chart has an even x axis. */
export function fillDays<T extends { day: string }>(
  rows: T[],
  from: string,
  to: string,
  make: (day: string) => T,
): T[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const out: T[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const day = isoDate(cursor);
    out.push(byDay.get(day) ?? make(day));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
