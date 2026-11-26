import type { Item, Priority } from './model.js';
import { addDays, minutesOf, periodProgress, toDateString, toMonthString, toTimeString, daysInMonth } from './dates.js';
import { GOAL_SECTION, MEMO_SECTION, getHeadline, type ParsedDocument } from './parse/document.js';
import {
  compareForToday,
  freeSlots,
  timeStatus,
  type FreeSlot,
  type TimeOptions,
  type TimeStatus,
  type WithStatus,
} from './time.js';
import { INBOX_FILE, Vault, dailyPath, monthlyPath, yearlyPath } from './vault.js';

export interface DayView {
  date: string;
  headline?: string;
  items: Item[];
  memo: string;
}

function memoOf(doc: ParsedDocument): string {
  const sec = doc.sections.find((s) => s.title === MEMO_SECTION);
  if (!sec) return '';
  return doc.lines.slice(sec.start, sec.end).join('\n').trim();
}

function dayViewOf(date: string, doc: ParsedDocument | null): DayView {
  const view: DayView = { date, items: doc?.items ?? [], memo: doc ? memoOf(doc) : '' };
  const h = doc ? getHeadline(doc) : undefined;
  if (h) view.headline = h;
  return view;
}

export async function getDay(vault: Vault, date: string): Promise<DayView> {
  return dayViewOf(date, await vault.readDoc(dailyPath(date)));
}

/** 파일이 있는 날만 돌려준다 */
export async function getRange(vault: Vault, from: string, to: string): Promise<DayView[]> {
  const dates = await vault.listDailyDates(from, to);
  return Promise.all(dates.map((d) => getDay(vault, d)));
}

export async function getInbox(vault: Vault): Promise<Item[]> {
  return (await vault.readDoc(INBOX_FILE))?.items ?? [];
}

export interface GoalProgress {
  goals: Item[];
  done: number;
  total: number;
  /** 0~1, 체크박스 있는 목표가 없으면 undefined */
  ratio?: number;
}

export function goalProgress(doc: ParsedDocument | null): GoalProgress {
  const goals = doc?.items.filter((i) => i.section === GOAL_SECTION && i.parentLine === undefined) ?? [];
  const tasks = goals.filter((g) => g.kind === 'task');
  const done = tasks.filter((g) => g.done).length;
  const p: GoalProgress = { goals, done, total: tasks.length };
  if (tasks.length) p.ratio = done / tasks.length;
  return p;
}

export interface MonthDaySummary {
  date: string;
  headline?: string;
  open: number;
  done: number;
  events: number;
}

export interface MonthSummary {
  month: string;
  goals: GoalProgress;
  days: MonthDaySummary[];
  /** 이번 달 안에 마감인 미완료 할 일 */
  dueThisMonth: Item[];
}

export async function getMonthSummary(vault: Vault, month: string): Promise<MonthSummary> {
  const all = await vault.allDocs();
  const byFile = new Map(all.map((d) => [d.file, d]));
  const days = daysInMonth(month).map((date) => {
    const doc = byFile.get(dailyPath(date)) ?? null;
    const tasks = doc?.items.filter((i) => i.kind === 'task') ?? [];
    const s: MonthDaySummary = {
      date,
      open: tasks.filter((t) => !t.done).length,
      done: tasks.filter((t) => t.done).length,
      events: doc?.items.filter((i) => i.kind === 'event' || i.kind === 'allday').length ?? 0,
    };
    const h = doc ? getHeadline(doc) : undefined;
    if (h) s.headline = h;
    return s;
  });
  const dueThisMonth = all
    .flatMap((d) => d.items)
    .filter((i) => i.kind === 'task' && !i.done && i.due?.startsWith(month))
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
  return { month, goals: goalProgress(byFile.get(monthlyPath(month)) ?? null), days, dueThisMonth };
}

export interface TaskFilter {
  /** 본문에 포함된 문자열 (대소문자 무시) */
  query?: string;
  status?: 'open' | 'done' | 'all';
  dueBefore?: string;
  dueAfter?: string;
  priority?: Priority;
  /** Daily 파일 날짜 범위 */
  from?: string;
  to?: string;
  tag?: string;
  limit?: number;
}

export async function searchTasks(vault: Vault, f: TaskFilter = {}): Promise<Item[]> {
  const q = f.query?.toLowerCase();
  const status = f.status ?? 'open';
  const out = (await vault.allDocs())
    .flatMap((d) => d.items)
    .filter((i) => i.kind === 'task')
    .filter((i) => status === 'all' || (status === 'done' ? i.done : !i.done))
    .filter((i) => !q || i.text.toLowerCase().includes(q))
    .filter((i) => !f.dueBefore || (i.due !== undefined && i.due <= f.dueBefore))
    .filter((i) => !f.dueAfter || (i.due !== undefined && i.due >= f.dueAfter))
    .filter((i) => !f.priority || i.priority === f.priority)
    .filter((i) => !f.from || (i.fileDate !== undefined && i.fileDate >= f.from))
    .filter((i) => !f.to || (i.fileDate !== undefined && i.fileDate <= f.to))
    .filter((i) => !f.tag || i.tags.includes(f.tag.replace(/^#/, '')));
  return f.limit ? out.slice(0, f.limit) : out;
}

export interface TodayView {
  date: string;
  now: string;
  headline?: string;
  /** 오늘 전체 목록: 오늘 파일 항목 + 오늘 마감·예정. 기본 정렬됨 */
  items: WithStatus[];
  /** 밀린 할 일: 지난 Daily의 미완료 + 마감 지난 것 (오래된 순) */
  overdue: Item[];
  /** 앞으로 N일 안의 마감 (오늘 제외) */
  upcoming: Item[];
}

export interface TodayOptions extends TimeOptions {
  upcomingDays?: number;
}

/** 지난 Daily에 남은 미완료이거나 마감이 지난 할 일인지 */
function isOverdue(i: Item, today: string): boolean {
  if (i.kind !== 'task' || i.done) return false;
  if (i.due) return i.due < today;
  if (i.scheduled) return i.scheduled < today;
  return i.fileDate !== undefined && i.fileDate < today;
}

export async function getToday(vault: Vault, now: Date, opts: TodayOptions = {}): Promise<TodayView> {
  const today = toDateString(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const docs = await vault.allDocs();
  const todayDoc = docs.find((d) => d.file === dailyPath(today)) ?? null;
  const all = docs.flatMap((d) => d.items);

  const seen = new Set<string>();
  const items: Item[] = [];
  const push = (i: Item) => {
    const key = i.id ?? `${i.file}#${i.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(i);
  };
  todayDoc?.items.forEach(push);
  all.filter((i) => i.kind === 'task' && !i.done && (i.due === today || i.scheduled === today)).forEach(push);

  const statusOf = (i: Item): TimeStatus => timeStatus(i, nowMin, opts, 'today');
  const sorted = items.map((item) => ({ item, status: statusOf(item) })).sort(compareForToday);

  const overdue = all
    .filter((i) => !seen.has(i.id ?? `${i.file}#${i.line}`) && isOverdue(i, today))
    .sort((a, b) => (a.due ?? a.scheduled ?? a.fileDate ?? '').localeCompare(b.due ?? b.scheduled ?? b.fileDate ?? ''));

  const horizon = addDays(today, opts.upcomingDays ?? 7);
  const upcoming = all
    .filter((i) => i.kind === 'task' && !i.done && i.due && i.due > today && i.due <= horizon)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));

  const view: TodayView = { date: today, now: toTimeString(now), items: sorted, overdue, upcoming };
  const h = todayDoc ? getHeadline(todayDoc) : undefined;
  if (h) view.headline = h;
  return view;
}

export interface NowView {
  now: string;
  ongoing: Item[];
  next?: Item;
  /** 오늘 시간이 지났는데 체크 안 된 할 일 */
  overdueTimed: Item[];
  /** 오늘 시간 없는 미완료 할 일 */
  openUntimed: Item[];
  freeSlots: FreeSlot[];
}

export async function getNow(vault: Vault, now: Date, opts: TodayOptions & { dayEnd?: string } = {}): Promise<NowView> {
  const t = await getToday(vault, now, opts);
  const by = (s: TimeStatus) => t.items.filter((x) => x.status === s).map((x) => x.item);
  const nextCandidates = [...by('soon'), ...by('upcoming')].filter((i) => i.time);
  const view: NowView = {
    now: t.now,
    ongoing: by('ongoing'),
    overdueTimed: by('overdue'),
    openUntimed: by('open'),
    freeSlots: freeSlots(
      t.items.map((x) => x.item),
      t.now,
      opts.dayEnd ?? '24:00',
      opts,
    ),
  };
  const next = nextCandidates.sort((a, b) => minutesOf(a.time?.start ?? '') - minutesOf(b.time?.start ?? ''))[0];
  if (next) view.next = next;
  return view;
}

export interface HomeView {
  today: TodayView;
  progress: { day: number; month: number; year: number };
  month: MonthSummary;
  year: { year: string; goals: GoalProgress };
  inbox: Item[];
}

/** 홈 화면에 필요한 것을 한 번에 (docs/PLAN.md 9장) */
export async function getHome(vault: Vault, now: Date, opts: TodayOptions = {}): Promise<HomeView> {
  const year = String(now.getFullYear());
  const [today, month, yearDoc, inbox] = await Promise.all([
    getToday(vault, now, opts),
    getMonthSummary(vault, toMonthString(now)),
    vault.readDoc(yearlyPath(year)),
    getInbox(vault),
  ]);
  return {
    today,
    progress: periodProgress(now),
    month,
    year: { year, goals: goalProgress(yearDoc) },
    inbox: inbox.filter((i) => i.kind === 'task' && !i.done),
  };
}

export interface YearMonthSummary {
  month: string;
  goals: GoalProgress;
  /** 그 달 Daily 파일들의 할 일 수 */
  done: number;
  open: number;
}

export interface YearView {
  year: string;
  goals: GoalProgress;
  months: YearMonthSummary[];
  /** 날짜별 완료한 할 일 수 (히트맵용, 기록 있는 날만) */
  doneByDate: Record<string, number>;
  /** 날짜별 그날 할 일 전체 수 (완료율 계산용, 할 일이 있는 날만) */
  tasksByDate: Record<string, number>;
}

/** 연간 보기: 12개월 목표 달성률과 완료 기록 */
export async function getYear(vault: Vault, year: string): Promise<YearView> {
  const docs = await vault.allDocs();
  const byFile = new Map(docs.map((d) => [d.file, d]));
  const doneByDate: Record<string, number> = {};
  const tasksByDate: Record<string, number> = {};
  const months: YearMonthSummary[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    let done = 0;
    let open = 0;
    for (const d of docs) {
      if (d.type !== 'daily' || !d.key?.startsWith(month)) continue;
      const tasks = d.items.filter((i) => i.kind === 'task');
      const dn = tasks.filter((t) => t.done).length;
      done += dn;
      open += tasks.length - dn;
      if (dn) doneByDate[d.key] = dn;
      if (tasks.length) tasksByDate[d.key] = tasks.length;
    }
    months.push({ month, goals: goalProgress(byFile.get(monthlyPath(month)) ?? null), done, open });
  }
  return { year, goals: goalProgress(byFile.get(yearlyPath(year)) ?? null), months, doneByDate, tasksByDate };
}
