import { holidaysOn } from './holidays.js';
import type { DayView, GoalProgress, Item, MonthSummary, NowView, TimeStatus, TodayView } from './index.js';

/** Claude가 읽기 좋은 텍스트로 바꾼다. 항목마다 ref를 붙여서 바로 수정 도구에 쓸 수 있게 한다. */

const STATUS_LABEL: Partial<Record<TimeStatus, string>> = {
  soon: '곧 시작',
  ongoing: '진행 중',
  overdue: '시간 지남·미완료',
  ended: '끝남',
};

const PRIORITY_LABEL = { highest: '최상', high: '높음', medium: '중간', low: '낮음', lowest: '최하' } as const;

export function renderItem(i: Item, opts: { status?: TimeStatus; showFile?: boolean; indent?: string } = {}): string {
  const box = i.kind === 'task' ? (i.done ? '[x] ' : '[ ] ') : '';
  const time = i.kind === 'allday' ? '종일 ' : i.time ? `${i.time.start}${i.time.end ? `-${i.time.end}` : ''} ` : '';
  const kind = i.kind === 'event' || i.kind === 'allday' ? '(일정) ' : i.kind === 'note' ? '(메모) ' : '';
  const meta: string[] = [];
  if (i.priority) meta.push(`우선순위 ${PRIORITY_LABEL[i.priority]}`);
  if (i.due) meta.push(`마감 ${i.due}`);
  if (i.scheduled) meta.push(`예정 ${i.scheduled}`);
  if (i.doneDate) meta.push(`완료 ${i.doneDate}`);
  if (i.recurrence) meta.push(`반복 ${i.recurrence}`);
  if (opts.status && STATUS_LABEL[opts.status]) meta.push(STATUS_LABEL[opts.status] ?? '');
  if (opts.showFile) meta.push(i.fileDate ?? i.file.replace(/\.md$/, ''));
  meta.push(`ref: ${i.ref}`);
  return `${opts.indent ?? ''}- ${box}${time}${kind}${i.text} (${meta.join(', ')})`;
}

/** 부모-하위 구조를 들여쓰기로 유지해서 출력 */
export function renderTree(items: Item[], statusOf?: (i: Item) => TimeStatus | undefined): string[] {
  const out: string[] = [];
  const childrenOf = new Map<number, Item[]>();
  const lines = new Set(items.map((i) => i.line));
  for (const i of items) {
    if (i.parentLine !== undefined && lines.has(i.parentLine)) {
      const arr = childrenOf.get(i.parentLine) ?? [];
      arr.push(i);
      childrenOf.set(i.parentLine, arr);
    }
  }
  const walk = (i: Item, depth: number) => {
    const status = statusOf?.(i);
    out.push(renderItem(i, { indent: '  '.repeat(depth), ...(status ? { status } : {}) }));
    for (const c of childrenOf.get(i.line) ?? []) walk(c, depth + 1);
  };
  for (const i of items) if (i.parentLine === undefined || !lines.has(i.parentLine)) walk(i, 0);
  return out;
}

/** " (공휴일: 추석)" 처럼 붙일 꼬리표 */
function holidayTag(date: string): string {
  const h = holidaysOn(date).map((x) => x.name);
  return h.length ? ` (공휴일: ${h.join(', ')})` : '';
}

export function renderDay(d: DayView): string {
  const out = [`# ${d.date}${holidayTag(d.date)}${d.headline ? ` — ${d.headline}` : ''}`];
  out.push(d.items.length ? renderTree(d.items).join('\n') : '(항목 없음)');
  if (d.memo) out.push(`\n메모:\n${d.memo}`);
  return out.join('\n');
}

export function renderList(title: string, items: Item[], showFile = true): string {
  if (!items.length) return `${title}: 없음`;
  return [`${title} (${items.length})`, ...items.map((i) => renderItem(i, { showFile }))].join('\n');
}

function renderGoals(g: GoalProgress): string {
  if (!g.goals.length) return '목표: 없음';
  const ratio = g.ratio !== undefined ? ` ${g.done}/${g.total} (${Math.round(g.ratio * 100)}%)` : '';
  return [`목표${ratio}`, ...g.goals.map((i) => renderItem(i))].join('\n');
}

export function renderMonth(m: MonthSummary): string {
  const days = m.days
    .filter((d) => d.headline || d.open || d.done || d.events)
    .map((d) => `- ${d.date}${d.headline ? ` ${d.headline}` : ''} (미완료 ${d.open}, 완료 ${d.done}, 일정 ${d.events})`);
  return [
    `# ${m.month}`,
    renderGoals(m.goals),
    '',
    days.length ? ['날짜별', ...days].join('\n') : '날짜별: 기록 없음',
    '',
    renderList('이번 달 마감 미완료', m.dueThisMonth),
  ].join('\n');
}

export function renderGoalsFor(period: string, g: GoalProgress): string {
  return `# ${period}\n${renderGoals(g)}`;
}

export function renderToday(t: TodayView): string {
  const statusByKey = new Map(t.items.map((x) => [x.item, x.status]));
  return [
    `# 오늘 ${t.date} (현재 ${t.now})${holidayTag(t.date)}${t.headline ? ` — ${t.headline}` : ''}`,
    t.items.length ? renderTree(t.items.map((x) => x.item), (i) => statusByKey.get(i)).join('\n') : '(오늘 항목 없음)',
    '',
    renderList('밀린 할 일', t.overdue),
    '',
    renderList('다가오는 마감', t.upcoming),
  ].join('\n');
}

export function renderNow(n: NowView): string {
  const out = [`현재 ${n.now}`];
  out.push(n.ongoing.length ? renderList('진행 중', n.ongoing, false) : '진행 중: 없음');
  out.push(n.next ? `다음: ${renderItem(n.next).slice(2)}` : '다음: 없음');
  out.push(renderList('시간 지남·미완료', n.overdueTimed, false));
  out.push(renderList('시간 없는 미완료', n.openUntimed, false));
  out.push(n.freeSlots.length ? `빈 시간: ${n.freeSlots.map((s) => `${s.start}-${s.end}(${s.minutes}분)`).join(', ')}` : '빈 시간: 없음');
  return out.join('\n');
}
