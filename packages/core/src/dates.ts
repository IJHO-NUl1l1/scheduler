/** 로컬 시간 기준 날짜 유틸. 날짜는 항상 `YYYY-MM-DD` 문자열로 다룬다. */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toMonthString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function toTimeString(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

export function isDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateString(parseDate(s)) === s;
}

export function isMonthString(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isYearString(s: string): boolean {
  return /^\d{4}$/.test(s);
}

/** from부터 to까지(포함) 날짜 목록 */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y ?? 1970, m ?? 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${month}-${pad(i + 1)}`);
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function timeOfMinutes(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/** 오늘·이번 달·올해가 얼마나 지났는지 (0~1) */
export function periodProgress(now: Date): { day: number; month: number; year: number } {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (now.getTime() - dayStart.getTime()) / 86_400_000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = (now.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime());
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
  const year = (now.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime());
  return { day, month, year };
}
