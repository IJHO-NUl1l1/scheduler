import type { Item, Priority } from './model.js';
import { minutesOf, parseDate, timeOfMinutes } from './dates.js';

/**
 * 현재 시각과 대조한 상태. 파일에는 저장하지 않는다. (docs/today.md 2장)
 * - upcoming / soon / ongoing / overdue / ended / done: 시간 있는 항목
 * - open / done: 시간 없는 할 일
 * - allday: 종일 일정
 * - note: 체크박스·시간 없는 글머리
 */
export type TimeStatus = 'upcoming' | 'soon' | 'ongoing' | 'overdue' | 'ended' | 'done' | 'open' | 'allday' | 'note';

export interface TimeOptions {
  /** 곧 시작으로 볼 시간 (분). 기본 10 */
  soonMinutes?: number;
  /** 끝 시간이 없을 때 표시용 길이 (분). 기본 30 */
  defaultDurationMinutes?: number;
}

const DEFAULTS: Required<TimeOptions> = { soonMinutes: 10, defaultDurationMinutes: 30 };

export function startMinutes(item: Pick<Item, 'time'>): number | undefined {
  return item.time ? minutesOf(item.time.start) : undefined;
}

export function endMinutes(item: Pick<Item, 'time'>, opts: TimeOptions = {}): number | undefined {
  if (!item.time) return undefined;
  if (item.time.end) return minutesOf(item.time.end);
  return minutesOf(item.time.start) + (opts.defaultDurationMinutes ?? DEFAULTS.defaultDurationMinutes);
}

/**
 * @param nowMin 오늘 0시부터 지난 분
 * @param day 항목의 날짜와 오늘의 관계. 지난 날이면 시간 항목은 모두 끝난 것으로 본다
 */
export function timeStatus(
  item: Pick<Item, 'kind' | 'done' | 'time'>,
  nowMin: number,
  opts: TimeOptions = {},
  day: 'past' | 'today' | 'future' = 'today',
): TimeStatus {
  if (item.kind === 'note') return 'note';
  if (item.kind === 'allday') return 'allday';
  if (item.kind === 'task' && item.done) return 'done';
  if (!item.time) return 'open';

  const isEvent = item.kind === 'event';
  if (day === 'past') return isEvent ? 'ended' : 'overdue';
  if (day === 'future') return 'upcoming';

  const s = startMinutes(item) ?? 0;
  const e = endMinutes(item, opts) ?? s;
  const soon = opts.soonMinutes ?? DEFAULTS.soonMinutes;
  if (nowMin < s - soon) return 'upcoming';
  if (nowMin < s) return 'soon';
  if (nowMin < e) return 'ongoing';
  return isEvent ? 'ended' : 'overdue';
}

export interface WithStatus<T extends Item = Item> {
  item: T;
  status: TimeStatus;
}

const STATUS_RANK: Record<TimeStatus, number> = {
  allday: 0,
  ongoing: 1,
  soon: 2,
  overdue: 3,
  open: 4,
  upcoming: 5,
  note: 6,
  ended: 7,
  done: 8,
};

const PRIORITY_RANK: Record<Priority, number> = { highest: 0, high: 1, medium: 2, low: 4, lowest: 5 };
const priorityRank = (p?: Priority) => (p ? PRIORITY_RANK[p] : 3);

/** 전체 목록 기본 정렬 (docs/today.md 2장) */
export function compareForToday(a: WithStatus, b: WithStatus): number {
  const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (r) return r;
  const sa = startMinutes(a.item);
  const sb = startMinutes(b.item);
  if (sa !== undefined && sb !== undefined && sa !== sb) return sa - sb;
  if (a.status === 'open') {
    const p = priorityRank(a.item.priority) - priorityRank(b.item.priority);
    if (p) return p;
    const da = a.item.due ?? '9999';
    const db = b.item.due ?? '9999';
    if (da !== db) return da < db ? -1 : 1;
  }
  return a.item.line - b.item.line;
}

export function withStatus<T extends Item>(items: T[], nowMin: number, opts: TimeOptions = {}, day: 'past' | 'today' | 'future' = 'today'): WithStatus<T>[] {
  return items.map((item) => ({ item, status: timeStatus(item, nowMin, opts, day) }));
}

/** 타임라인에 그릴 항목 (시간 있는 것만, 시작순) */
export function timelineItems<T extends Item>(items: T[]): T[] {
  return items.filter((i) => i.time && (i.kind === 'task' || i.kind === 'event')).sort((a, b) => (startMinutes(a) ?? 0) - (startMinutes(b) ?? 0));
}

export interface TimelineSlot<T extends Item = Item> {
  item: T;
  start: number;
  end: number;
  /** 겹치는 항목끼리 나란히 그릴 때 몇 번째 칸인지 */
  column: number;
  /** 이 항목이 속한 겹침 묶음의 전체 칸 수 */
  columns: number;
}

/** 겹치는 항목을 칸으로 나눈다 */
export function layoutTimeline<T extends Item>(items: T[], opts: TimeOptions = {}): TimelineSlot<T>[] {
  const sorted = timelineItems(items).map((item) => ({
    item,
    start: startMinutes(item) ?? 0,
    end: endMinutes(item, opts) ?? 0,
    column: 0,
    columns: 1,
  }));
  let group: TimelineSlot<T>[] = [];
  let groupEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.column + 1));
    for (const g of group) g.columns = n;
    group = [];
  };
  for (const slot of sorted) {
    if (slot.start >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.end > slot.start).map((g) => g.column));
    let c = 0;
    while (used.has(c)) c++;
    slot.column = c;
    group.push(slot);
    groupEnd = Math.max(groupEnd, slot.end);
  }
  flush();
  return sorted;
}

/** 시간이 겹치는 항목 쌍 */
export function findOverlaps<T extends Item>(items: T[], opts: TimeOptions = {}): [T, T][] {
  const slots = layoutTimeline(items, opts);
  const out: [T, T][] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a && b && b.start < a.end) out.push([a.item, b.item]);
    }
  }
  return out;
}

export interface FreeSlot {
  start: string;
  end: string;
  minutes: number;
}

/**
 * 빈 시간 구간. 완료된 할 일과 끝난 일정은 자리를 차지하지 않는 것으로 본다.
 * @param from 시작 (HH:mm), 보통 근무 시작 또는 현재 시각
 */
export function freeSlots(items: Item[], from: string, to: string, opts: TimeOptions & { minMinutes?: number } = {}): FreeSlot[] {
  const busy = timelineItems(items)
    .filter((i) => !(i.kind === 'task' && i.done))
    .map((i) => [startMinutes(i) ?? 0, endMinutes(i, opts) ?? 0] as const)
    .sort((a, b) => a[0] - b[0]);
  const min = opts.minMinutes ?? 15;
  const out: FreeSlot[] = [];
  let cursor = minutesOf(from);
  const limit = minutesOf(to);
  for (const [s, e] of busy) {
    if (s > cursor && Math.min(s, limit) - cursor >= min) {
      const end = Math.min(s, limit);
      out.push({ start: timeOfMinutes(cursor), end: timeOfMinutes(end), minutes: end - cursor });
    }
    cursor = Math.max(cursor, e);
    if (cursor >= limit) break;
  }
  if (limit - cursor >= min) out.push({ start: timeOfMinutes(cursor), end: timeOfMinutes(limit), minutes: limit - cursor });
  return out;
}

export type AlertType = 'before' | 'start' | 'end';

export interface Alert {
  /** 같은 알림을 두 번 보내지 않기 위한 키. 시간이 바뀌면 키도 바뀐다 */
  key: string;
  type: AlertType;
  at: Date;
  item: Item;
}

/**
 * 하루치 항목의 알림 목록 (docs/today.md 3장). 이미 지난 알림도 포함하므로
 * 보내는 쪽에서 now와 보낸 기록으로 거른다.
 * - before: 시작 N분 전
 * - start: 시작 시각
 * - end: 끝 시각 (체크박스 있는 할 일만)
 */
export function computeAlerts(date: string, items: Item[], opts: TimeOptions & { beforeMinutes?: number } = {}): Alert[] {
  const base = parseDate(date).getTime();
  const at = (min: number) => new Date(base + min * 60_000);
  const before = opts.beforeMinutes ?? opts.soonMinutes ?? DEFAULTS.soonMinutes;
  const out: Alert[] = [];
  for (const item of timelineItems(items)) {
    if (item.kind === 'task' && item.done) continue;
    const s = startMinutes(item) ?? 0;
    const keyBase = `${date}|${item.ref}|${item.time?.start ?? ''}-${item.time?.end ?? ''}`;
    if (before > 0) out.push({ key: `${keyBase}|before`, type: 'before', at: at(s - before), item });
    out.push({ key: `${keyBase}|start`, type: 'start', at: at(s), item });
    if (item.kind === 'task') out.push({ key: `${keyBase}|end`, type: 'end', at: at(endMinutes(item, opts) ?? s), item });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
