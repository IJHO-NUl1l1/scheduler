import { useEffect, useState } from 'react';
import { holidaysOn, timeStatus, type Item, type TimeStatus } from '@scheduler/core/pure';

/** 한 주는 일요일부터 */
export const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export type Period = 'morning' | 'day' | 'evening' | 'night';

export function periodOf(d: Date): Period {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export const GREETING: Record<Period, string> = {
  morning: '좋은 아침이에요',
  day: '좋은 오후예요',
  evening: '오늘 하루 마무리할 시간',
  night: '늦은 시간이에요',
};

const p2 = (n: number) => String(n).padStart(2, '0');

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export const todayStr = () => dateStr(new Date());

export function parseD(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

export function addDaysStr(date: string, n: number): string {
  const d = parseD(date);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y ?? 2000, (m ?? 1) - 1 + n, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}

/** 그 주의 일요일 */
export function weekStartOf(date: string): string {
  const d = parseD(date);
  return addDaysStr(date, -d.getDay());
}

/** 달력에 그릴 날짜들 (일요일 시작, 앞뒤 달 포함, 6주 이내) */
export function monthDays(month: string): string[] {
  const first = `${month}-01`;
  const start = weekStartOf(first);
  const [y, m] = month.split('-').map(Number);
  const last = dateStr(new Date(y ?? 2000, m ?? 1, 0));
  const end = addDaysStr(weekStartOf(last), 6);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDaysStr(d, 1)) out.push(d);
  return out;
}

/** 30초마다 갱신되는 현재 시각 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function fmtTime(i: Pick<Item, 'time' | 'kind'>): string {
  if (i.kind === 'allday') return '종일';
  if (!i.time) return '';
  return i.time.end ? `${i.time.start}–${i.time.end}` : i.time.start;
}

export function fmtShortDate(date: string, today?: string): string {
  if (today) {
    if (date === today) return '오늘';
    if (date === addDaysStr(today, 1)) return '내일';
    if (date === addDaysStr(today, -1)) return '어제';
  }
  const d = parseD(date);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
}

export function fmtLongDate(date: string): string {
  const d = parseD(date);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`;
}

export function fmtMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${y}년 ${Number(m)}월`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseD(b).getTime() - parseD(a).getTime()) / 86_400_000);
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** 그 날짜 기준 상태 (지난 날 / 오늘 / 앞날) */
export function statusFor(item: Item, date: string | undefined, now: Date): TimeStatus {
  const today = dateStr(now);
  const rel = !date ? 'today' : date < today ? 'past' : date > today ? 'future' : 'today';
  return timeStatus(item, now.getHours() * 60 + now.getMinutes(), {}, rel);
}

/** 일간 목록 순서: 종일 → 시간순 → 시간 없는 것(파일 순서). 완료해도 자리를 지킨다 */
export function dayOrder(items: Item[]): Item[] {
  const rank = (i: Item) => (i.kind === 'allday' ? 0 : i.time ? 1 : 2);
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (a.time && b.time && a.time.start !== b.time.start) return a.time.start < b.time.start ? -1 : 1;
    return a.line - b.line;
  });
}

/** 한국 달력 기준: 공휴일 이름과 글자색 (일·공휴일 빨강, 토 파랑) */
export function dayInfo(date: string): { holiday: string | null; tone: string } {
  const names = holidaysOn(date).map((h) => h.name);
  const dow = parseD(date).getDay();
  const tone = names.length || dow === 0 ? 'text-sun' : dow === 6 ? 'text-sat' : '';
  return { holiday: names.length ? names.join(' · ') : null, tone };
}

/** 요일 머리글 색 (일요일 시작: 0=일 빨강, 6=토 파랑) */
export const weekHeadTone = (i: number) => (i === 0 ? 'text-sun' : i === 6 ? 'text-sat' : 'text-faint');

export const PRIORITY_LABEL: Record<string, string> = {
  highest: '최상',
  high: '높음',
  medium: '중간',
  low: '낮음',
  lowest: '최하',
};
