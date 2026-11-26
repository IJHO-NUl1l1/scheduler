import { useEffect, useState, type ReactNode } from 'react';
import type { DayView } from '@scheduler/core';
import { startMinutes, type Item, type TimeStatus } from '@scheduler/core/pure';
import type { GridWidget, HomeData, WidgetType } from '@shared/api';
import { useStore } from '../store';
import { dayInfo, weekHeadTone, WEEK, addDaysStr, addMonths, dayOrder, fmtMonth, fmtShortDate, fmtTime, monthDays, parseD, statusFor, todayStr, weekStartOf } from '../lib';
import { Checkbox, ItemRow, justCompleted, useLingerRefresh } from '../components/ItemRow';
import { QuickAdd } from '../components/QuickAdd';
import { Timeline } from '../components/Timeline';
import { Clock } from '../components/Clock';
import { Icon, IconButton } from '../components/ui';
import { DayPeek, type PeekAnchor } from '../components/DayPeek';
import { useDrag } from '../drag';
import { useTheme } from '../themes';

export interface WidgetProps {
  conf: GridWidget;
  home: HomeData;
  now: Date;
  /** 위젯 본문 크기 (px) */
  box: { width: number; height: number };
}

/** 위젯 오른쪽 위 링크 */
export function WidgetLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-[11.5px] text-faint hover:text-accent">
      {children} <Icon name="arrow" size={11} />
    </button>
  );
}

const by = (home: HomeData, s: TimeStatus) => home.today.items.filter((x) => x.status === s).map((x) => x.item);
const nowMinOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const fmtIn = (min: number) => (min < 60 ? `${min}분 뒤` : `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''} 뒤`);


/**
 * 다음: 다음에 할 일 하나만.
 * - 시간이 정해진 다음 일정/할 일이 있으면 그것 (시각과 남은 시간)
 * - 없으면 시간 없는 미완료 할 일 맨 위 (바로 체크 가능)
 */
function NowWidget({ home, now }: WidgetProps) {
  const edit = useStore((s) => s.edit);
  const m = nowMinOf(now);
  const timed = [...by(home, 'soon'), ...by(home, 'upcoming')].filter((i) => i.time).sort((a, b) => (startMinutes(a) ?? 0) - (startMinutes(b) ?? 0));
  const next = timed[0] ?? by(home, 'open').find((i) => i.kind === 'task' && !i.done);
  if (!next) {
    return (
      <div className="flex h-full flex-col justify-center">
        <div className="text-[18px] font-semibold tracking-tight text-faint">다음 할 일이 없어요</div>
        <div className="mt-1 text-[12.5px] text-faint">오늘 남은 일정도, 남은 할 일도 없어요</div>
      </div>
    );
  }
  const start = startMinutes(next);
  const left = start !== undefined && start !== null ? start - m : null;
  return (
    <div className="flex h-full items-center gap-3">
      {next.kind === 'task' && (
        <span className="shrink-0 scale-125">
          <Checkbox item={next} />
        </span>
      )}
      <button type="button" onClick={() => edit(next)} className="min-w-0 flex-1 text-left">
        <div className="line-clamp-2 text-[20px] leading-snug font-semibold tracking-tight">{next.text}</div>
        <div className="tabular mt-1 text-[12.5px] text-muted">
          {next.time ? (
            <>
              {fmtTime(next)} · <span className={left !== null && left <= 15 ? 'text-soon' : ''}>{left !== null && left > 0 ? fmtIn(left) : '곧'}</span>
            </>
          ) : (
            '시간 정하지 않은 할 일'
          )}
        </div>
      </button>
    </div>
  );
}

/**
 * 챙길 것: 놓쳤거나 곧 닥칠 할 일을 실제 항목으로.
 * - 밀린 할 일 (지난 날짜의 미완료·마감 지남) + 오늘 시간 지난 미완료 → "오늘로" 바로 옮기기
 * - 7일 안 마감 (가까운 순)
 */
function AttentionWidget({ home }: WidgetProps) {
  useLingerRefresh();
  const t = home.today;
  const late = [...t.overdue, ...by(home, 'overdue')].filter((i) => !i.done || justCompleted(i.ref));
  const due = t.upcoming.filter((i) => i.due && i.due <= addDaysStr(t.date, 7) && (!i.done || justCompleted(i.ref))).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  if (!late.length && !due.length) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2 text-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok-soft text-ok">
          <Icon name="check" size={14} strokeWidth={2.4} />
        </span>
        <span className="text-[13px]">놓친 것도, 급한 마감도 없어요</span>
      </div>
    );
  }
  const head = (label: string, n: number, tone: string) => (
    <div className="mb-0.5 flex items-center gap-2 px-2 pt-1 text-[11px] text-faint">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      {label} <span className="tabular">{n}</span>
    </div>
  );
  return (
    <div className="-mx-2 h-full space-y-2 overflow-y-auto">
      {late.length > 0 && (
        <div>
          {head('밀린 할 일', late.length, 'bg-warn')}
          {late.map((i) => (
            <ItemRow key={i.ref} item={i} compact showWhere actions={['today', 'delete']} />
          ))}
        </div>
      )}
      {due.length > 0 && (
        <div>
          {head('7일 안 마감', due.length, 'bg-soon')}
          {due.map((i) => (
            <ItemRow key={i.ref} item={i} compact actions={['today']} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 기록: GitHub 잔디처럼 최근 몇 주 동안 날마다 그날 할 일을 얼마나 끝냈는지 (완료율).
 * 단계: 0 = 끝낸 것 없음, 1 = ~33%, 2 = ~66%, 3 = 100% 미만, 4 = 100% (모두 끝낸 날).
 * 위에 월, 왼쪽에 요일(월·수·금), 아래에 범례. 색은 테마의 --heat-0..4, 4단계 모양은 테마가 바꿀 수 있다 (heatFull).
 * 주 수는 위젯 폭에 맞춘다 (최대 53주). 해를 넘기면 작년 기록도 같이 읽는다.
 */
const HEAT_CELL = 11;
const HEAT_GAP = 3;
const HEAT_LABEL_W = 22;

function RecordWidget({ box }: WidgetProps) {
  const rev = useStore((s) => s.rev);
  const go = useStore((s) => s.go);
  const heatFull = useTheme().heatFull;
  const [rec, setRec] = useState<{ done: Record<string, number>; tasks: Record<string, number> }>({ done: {}, tasks: {} });
  const [hover, setHover] = useState<string | null>(null);
  const today = todayStr();
  const weeks = Math.max(4, Math.min(53, Math.floor((box.width - HEAT_LABEL_W + HEAT_GAP) / (HEAT_CELL + HEAT_GAP))));
  const start = addDaysStr(weekStartOf(today), -(weeks - 1) * 7);
  useEffect(() => {
    let alive = true;
    const years = [...new Set([start.slice(0, 4), today.slice(0, 4)])];
    void Promise.all(years.map((y) => window.planner.query('year', y))).then(
      (r) => alive && setRec({ done: Object.assign({}, ...r.map((y) => y.doneByDate)), tasks: Object.assign({}, ...r.map((y) => y.tasksByDate)) }),
    );
    return () => {
      alive = false;
    };
  }, [rev, today, start]);

  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysStr(start, w * 7 + d)));
  const n = (d: string) => rec.done[d] ?? 0;
  const all = (d: string) => rec.tasks[d] ?? 0;
  const shown = cols.flat().filter((d) => d <= today);
  const total = shown.reduce((a, d) => a + n(d), 0);
  const full = shown.filter((d) => all(d) > 0 && n(d) >= all(d)).length;
  const lv = (d: string) => {
    const done = n(d);
    if (done <= 0) return 0;
    const r = done / Math.max(1, all(d));
    return r >= 1 ? 4 : r >= 2 / 3 ? 3 : r > 1 / 3 ? 2 : 1;
  };
  // 연속 기록: 오늘은 아직 안 했어도 끊긴 걸로 보지 않는다
  let streak = 0;
  for (let d = n(today) ? today : addDaysStr(today, -1); n(d) > 0; d = addDaysStr(d, -1)) streak++;

  // 월 이름: 그 달 1일이 들어 있는 주 위에. 앞 이름과 너무 붙으면 건너뛴다
  const months: { col: number; label: string }[] = [];
  cols.forEach((c, i) => {
    const first = c.find((d) => d.endsWith('-01'));
    const label = first ? `${Number(first.slice(5, 7))}월` : i === 0 ? `${Number(c[0]!.slice(5, 7))}월` : null;
    if (!label) return;
    const prev = months[months.length - 1];
    if (prev && i - prev.col < 3) {
      if (prev.col === 0) months.pop(); // 맨 앞 칸 이름보다 실제 1일 이름이 낫다
      else return;
    }
    months.push({ col: i, label });
  });
  const step = HEAT_CELL + HEAT_GAP;
  const gridW = weeks * step - HEAT_GAP;
  const hoverText = hover ? `${fmtShortDate(hover)} · ${all(hover) ? `${n(hover)}/${all(hover)} 완료 (${Math.round((n(hover) / all(hover)) * 100)}%)` : '할 일 없음'}` : null;

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="mb-3 text-[12.5px] text-muted">
        최근 {weeks}주 동안 <b className="text-ink">{total}개</b> 완료 · 모두 끝낸 날 <b className="text-ink">{full}일</b>
      </div>
      <div className="relative" style={{ width: gridW + HEAT_LABEL_W, height: 16 + 7 * step - HEAT_GAP }} onPointerLeave={() => setHover(null)}>
        {months.map((mo) => (
          <span key={mo.col} className="absolute top-0 text-[10px] leading-none text-muted" style={{ left: HEAT_LABEL_W + mo.col * step }}>
            {mo.label}
          </span>
        ))}
        {(['월', '수', '금'] as const).map((w, i) => (
          <span key={w} className="absolute left-0 text-[10px] leading-none text-muted" style={{ top: 16 + (1 + i * 2) * step + 1 }}>
            {w}
          </span>
        ))}
        <div className="absolute grid grid-flow-col" style={{ left: HEAT_LABEL_W, top: 16, gap: HEAT_GAP, gridTemplateRows: `repeat(7, ${HEAT_CELL}px)`, gridAutoColumns: `${HEAT_CELL}px` }}>
          {cols.flat().map((d) => {
            const future = d > today;
            return future ? (
              <span key={d} />
            ) : (
              <button
                key={d}
                type="button"
                aria-label={`${d} 완료 ${n(d)}`}
                onPointerEnter={() => setHover(d)}
                onClick={() => go('day', { day: d })}
                className={`flex items-center justify-center ${lv(d) === 4 && heatFull ? 'heat-full' : 'heat-cell rounded-[2.5px]'} ${d === today ? 'heat-today' : ''}`}
                style={lv(d) === 4 && heatFull ? undefined : { background: `var(--heat-${lv(d)})` }}
              >
                {lv(d) === 4 && heatFull}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1 text-[10.5px] text-muted" style={{ width: gridW + HEAT_LABEL_W }}>
        <span className="mr-auto truncate">{hoverText ?? (streak ? `${streak}일 연속` : '오늘 하나 끝내 보세요')}</span>
        <span className="mr-0.5">0%</span>
        {[0, 1, 2, 3, 4].map((l) =>
          l === 4 && heatFull ? (
            <span key={l} className="flex items-center justify-center" style={{ width: HEAT_CELL - 1, height: HEAT_CELL - 1 }}>
              {heatFull}
            </span>
          ) : (
            <span key={l} className="heat-cell rounded-[2.5px]" style={{ width: HEAT_CELL - 1, height: HEAT_CELL - 1, background: `var(--heat-${l})` }} />
          ),
        )}
        <span className="ml-0.5">100%</span>
      </div>
    </div>
  );
}

function TodayListWidget({ home }: WidgetProps) {
  // 남은 일 먼저, 완료한 할 일은 아래에 (줄 그어서). 끝난 일정은 뺀다
  const all = home.today.items.filter((x) => x.status !== 'ended' && x.item.kind !== 'note');
  const items = [...all.filter((x) => x.status !== 'done'), ...all.filter((x) => x.status === 'done')];
  return (
    <div className="flex h-full flex-col">
      <div className="-mx-2 flex-1 overflow-y-auto">
        {items.length ? (
          items.slice(0, 10).map((x) => <ItemRow key={x.item.ref} item={x.item} status={x.status} compact actions={['tomorrow', 'delete']} />)
        ) : (
          <p className="px-2 py-3 text-[13px] text-faint">오늘 할 일이 없어요.</p>
        )}
        {items.length > 10 && <p className="px-2 pt-1 text-[11px] text-faint">외 {items.length - 10}개</p>}
      </div>
      <QuickAdd defaultDate={home.today.date} className="mt-2" placeholder="오늘에 추가" />
    </div>
  );
}

function TimelineWidget({ home, now, box }: WidgetProps) {
  const app = useStore((s) => s.app);
  const map = new Map(home.today.items.map((x) => [x.item.ref, x.status] as const));
  return <Timeline items={home.today.items.map((x) => x.item)} statusOf={(i) => map.get(i.ref)} now={now} date={home.today.date} isToday dayStart={app?.dayStart ?? '08:00'} dayEnd={app?.dayEnd ?? '19:00'} hourHeight={40} maxHeight={Math.max(120, box.height)} />;
}

function WeekWidget({ home }: WidgetProps) {
  const go = useStore((s) => s.go);
  const today = todayStr();
  return (
    <div className="grid h-full grid-cols-7 gap-1.5">
      {home.week.map((d) => {
        const dd = parseD(d.date);
        const open = d.items.filter((i) => i.kind === 'task' && !i.done).length;
        const events = d.items.filter((i) => i.kind === 'event' || i.kind === 'allday').length;
        const info = dayInfo(d.date);
        const isToday = d.date === today;
        return (
          <button key={d.date} type="button" data-drop="date" data-date={d.date} onClick={() => go('day', { day: d.date })} className={`flex h-full min-h-[80px] flex-col rounded-lg p-2.5 text-left transition-colors hover:bg-hover ${isToday ? 'bg-accent-soft ring-1 ring-accent/40' : 'bg-surface-2'}`}>
            <div className={`text-[10.5px] ${isToday ? 'text-accent' : info.tone || 'text-faint'}`}>{isToday ? '오늘' : WEEK[dd.getDay()]}</div>
            <div className={`display mt-0.5 text-[24px] ${isToday ? '' : info.tone}`}>{dd.getDate()}</div>
            {info.holiday && <div className="mt-0.5 truncate text-[10.5px] font-medium text-sun">{info.holiday}</div>}
            {d.headline && <div className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug">{d.headline}</div>}
            <div className="mt-auto flex gap-1.5 pt-2 text-[10.5px]">
              {open > 0 && <span className="text-muted">할 일 {open}</span>}
              {events > 0 && <span className="text-event">일정 {events}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** 달력 칸에 찍는 점 최대 개수 (넘으면 +n) */
const MAX_DOTS = 4;

/** 월 달력 위젯. 칸에는 날짜와 개수만 점으로, 내용은 마우스를 올리면 미리보기 카드로. 위젯 안에서 달을 넘길 수 있고, 자기 데이터를 따로 불러온다 */
function PlainFrame({ children }: { month: string; compact?: boolean; children: ReactNode }) {
  return <>{children}</>;
}

function MonthWidget({ box, now }: WidgetProps) {
  const { go, rev } = useStore();
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [days, setDays] = useState<Map<string, DayView>>(new Map());
  const cells = monthDays(month);
  useEffect(() => {
    let alive = true;
    void window.planner.query('range', cells[0]!, cells[cells.length - 1]!).then((r) => alive && setDays(new Map(r.map((d) => [d.date, d]))));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, rev]);
  const today = todayStr();
  const rows = cells.length / 7;
  const theme = useTheme();
  const cellH = Math.max(34, (box.height - (theme.calendar?.weekHeadClass ? 114 : 56)) / rows);
  const [peek, setPeek] = useState<PeekAnchor | null>(null);
  const dragging = useDrag((s) => s.item !== null);
  useEffect(() => setPeek(null), [month]);
  const skin = theme.calendar;
  const Frame = skin?.Frame ?? PlainFrame;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <IconButton icon="left" title="이전 달" onClick={() => setMonth(addMonths(month, -1))} />
        <span className="min-w-[96px] text-center text-[13px] font-semibold">{fmtMonth(month)}</span>
        <IconButton icon="right" title="다음 달" onClick={() => setMonth(addMonths(month, 1))} />
        {month !== today.slice(0, 7) && (
          <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="ml-1 text-[11px] text-faint hover:text-ink">
            이번 달
          </button>
        )}
        <span className="ml-auto">
          <WidgetLink onClick={() => go('calendar', { calView: 'month', month })}>크게 보기</WidgetLink>
        </span>
      </div>
      <Frame month={month} compact>
      <div className={`grid grid-cols-7 text-center text-[10px] text-faint ${skin?.weekHeadClass ? `${skin.weekHeadClass} mb-1 rounded-md py-0.5` : ''}`}>
        {WEEK.map((w, i) => (
          <div key={w} className={`${skin?.weekHeadClass ? '' : 'pb-1'} ${weekHeadTone(i)}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-line/60" onPointerLeave={() => setPeek(null)} onPointerDown={() => setPeek(null)}>
        {cells.map((d) => {
          const v = days.get(d);
          const inMonth = d.startsWith(month);
          const items = (v?.items ?? []).filter((i) => i.kind !== 'note' && i.parentLine === undefined);
          const open = items.filter((i) => i.kind === 'task' && !i.done).length;
          const overdue = d < today && open > 0;
          const info = dayInfo(d);
          const dots = items.slice(0, MAX_DOTS);
          const mark = theme.dayMark?.(d);
          const isToday = d === today;
          const ring = isToday ? skin?.todayRing?.(28) : null;
          return (
            <button
              key={d}
              type="button"
              onClick={() => go('day', { day: d })}
              onPointerEnter={(e) => {
                if (e.buttons) return;
                const rect = e.currentTarget.getBoundingClientRect();
                setPeek({ date: d, rect });
              }}
              aria-label={[d, info.holiday, `${items.length}개`].filter(Boolean).join(' ')}
              data-drop="date"
              data-date={d}
              style={{ height: cellH }}
              className={`relative isolate flex flex-col items-start justify-between p-1 transition-colors hover:bg-hover ${skin?.cellClass?.(d, inMonth) ?? (inMonth ? 'bg-surface' : 'bg-bg')} ${peek?.date === d ? 'bg-hover' : ''}`}
            >
              {skin?.cellDecor && <span className="pointer-events-none absolute inset-0 -z-10">{skin.cellDecor(d, { today, inMonth, compact: true })}</span>}
              <span
                className={`tabular relative flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-[11.5px] leading-none ${
                  isToday ? (ring ? skin?.todayNumClass : 'bg-accent font-bold text-on-accent') : !inMonth ? `${info.tone || 'text-faint'} opacity-40` : info.tone || 'text-muted'
                }`}
              >
                {ring && <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{ring}</span>}
                <span className="relative">{parseD(d).getDate()}</span>
              </span>
              {mark && <span className="absolute top-1 right-1.5">{mark}</span>}
              <span className={`flex h-1.5 items-center gap-[3px] pl-1 ${inMonth ? '' : 'opacity-40'}`}>
                {dots.map((i) => (
                  <span key={i.ref} className={`h-1.5 w-1.5 rounded-full ${i.kind === 'task' ? (i.done ? 'bg-faint' : overdue ? 'bg-warn' : 'bg-accent') : 'bg-event'}`} />
                ))}
                {items.length > MAX_DOTS && <span className="tabular text-[9px] leading-none text-faint">+{items.length - MAX_DOTS}</span>}
              </span>
            </button>
          );
        })}
      </div>
      </Frame>
      {peek && !dragging && <DayPeek anchor={peek} view={days.get(peek.date)} today={today} />}
      <span className="sr-only">{now.toISOString()}</span>
    </div>
  );
}

function GoalsWidget({ home }: WidgetProps) {
  const go = useStore((s) => s.go);
  const bar = (label: string, done: number, total: number, onClick: () => void) => (
    <button type="button" onClick={onClick} className="block w-full rounded-md py-2 text-left">
      <div className="flex items-baseline justify-between text-[13px]">
        <span>{label}</span>
        <span className="tabular text-[12px] text-muted">{total ? `${done} / ${total}` : '목표 없음'}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {total ? Array.from({ length: total }, (_, i) => <span key={i} className={`h-[5px] flex-1 rounded-full ${i < done ? 'bg-ok' : 'bg-line'}`} />) : <span className="h-[5px] flex-1 rounded-full bg-line" />}
      </div>
    </button>
  );
  return (
    <div>
      {bar(`${Number(home.month.month.slice(5))}월`, home.month.goals.done, home.month.goals.total, () => go('goals', { goalsView: 'month' }))}
      {bar(`${home.year.year}년`, home.year.goals.done, home.year.goals.total, () => go('goals', { goalsView: 'year' }))}
    </div>
  );
}

function InboxWidget({ home }: WidgetProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="-mx-2 flex-1">
        {home.inbox.length ? home.inbox.slice(0, 5).map((i: Item) => <ItemRow key={i.ref} item={i} compact actions={['today', 'delete']} />) : <p className="px-2 py-3 text-[13px] text-faint">비어 있어요</p>}
        {home.inbox.length > 5 && <p className="px-2 text-[11px] text-faint">외 {home.inbox.length - 5}개</p>}
      </div>
      <QuickAdd defaultDate={null} className="mt-2" placeholder="인박스에 추가" />
    </div>
  );
}

function ClockWidget({ conf, box }: WidgetProps) {
  const prefs = useStore((s) => s.prefs);
  const style = conf.options?.clockStyle ?? prefs?.clockStyle ?? 'analog';
  return (
    <div className="flex h-full items-center justify-center">
      <Clock style={style} size={Math.max(60, Math.min(box.width, box.height) - 8)} />
    </div>
  );
}

/** 구역 제목 (편집 모드에서 이름 바꾸기는 Dashboard가 처리) */
function HeadingWidget({ conf }: WidgetProps) {
  const icons = useTheme().headingIcons;
  // 위에서부터 몇 번째 제목인지로 고른다: 제목마다 다른 아이콘이 붙고, 순서를 바꾸기 전까지는 늘 같다
  const rank = useStore((s) => {
    const hs = s.layout.widgets.filter((w) => w.type === 'heading').sort((a, b) => a.y - b.y || a.x - b.x);
    return Math.max(0, hs.findIndex((w) => w.id === conf.id));
  });
  const icon = icons?.length ? icons[rank % icons.length] : null;
  return (
    <div className="flex h-full items-center gap-3">
      {icon && <span className="-mr-1 flex shrink-0">{icon}</span>}
      <h2 className="text-[12px] font-semibold tracking-[0.08em] text-muted">{conf.options?.title || '제목'}</h2>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export const WIDGETS: Record<WidgetType, { render: (p: WidgetProps) => ReactNode; link?: (go: ReturnType<typeof useStore.getState>['go'], home: HomeData) => { label: string; run: () => void } }> = {
  heading: { render: (p) => <HeadingWidget {...p} /> },
  now: { render: (p) => <NowWidget {...p} />, link: (go, h) => ({ label: '오늘', run: () => go('day', { day: h.today.date }) }) },
  attention: { render: (p) => <AttentionWidget {...p} /> },
  record: { render: (p) => <RecordWidget {...p} />, link: (go) => ({ label: '연간 기록', run: () => go('goals', { goalsView: 'record' }) }) },
  todayList: { render: (p) => <TodayListWidget {...p} />, link: (go, h) => ({ label: '오늘 전체', run: () => go('day', { day: h.today.date }) }) },
  timeline: { render: (p) => <TimelineWidget {...p} />, link: (go, h) => ({ label: '크게 보기', run: () => go('day', { day: h.today.date }) }) },
  week: { render: (p) => <WeekWidget {...p} />, link: (go, h) => ({ label: '주간 보기', run: () => go('calendar', { calView: 'week', weekStart: weekStartOf(h.today.date) }) }) },
  month: { render: (p) => <MonthWidget {...p} /> },
  goals: { render: (p) => <GoalsWidget {...p} />, link: (go) => ({ label: '목표 탭', run: () => go('goals') }) },
  inbox: { render: (p) => <InboxWidget {...p} />, link: (go) => ({ label: '인박스', run: () => go('inbox') }) },
  clock: { render: (p) => <ClockWidget {...p} /> },
};

export { statusFor };
