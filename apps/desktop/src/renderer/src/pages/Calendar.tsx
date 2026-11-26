import { useState } from 'react';
import type { DayView, Item } from '@scheduler/core';
import { useStore } from '../store';
import { dayInfo, weekHeadTone, WEEK, addDaysStr, addMonths, dayOrder, fmtMonth, fmtShortDate, fmtTime, monthDays, parseD, statusFor, todayStr, useNow, weekStartOf } from '../lib';
import { PageBody, PageHeader } from '../components/Shell';
import { QuickAdd } from '../components/QuickAdd';
import { ItemRow } from '../components/ItemRow';
import { useDrag, useIsOver, useItemDrag } from '../drag';
import { Card, Empty, Pager, Segmented } from '../components/ui';
import { useTheme } from '../themes';

export function Calendar() {
  const { calView, month, weekStart, go, calDays, monthSummary } = useStore();
  const today = todayStr();
  const byDate = new Map(calDays.map((d) => [d.date, d]));

  const header =
    calView === 'month' ? (
      <Pager label={fmtMonth(month)} onPrev={() => go('calendar', { month: addMonths(month, -1) })} onNext={() => go('calendar', { month: addMonths(month, 1) })} onToday={() => go('calendar', { month: today.slice(0, 7) })} todayLabel="이번 달" />
    ) : (
      <Pager
        label={`${fmtShortDate(weekStart)} – ${fmtShortDate(addDaysStr(weekStart, 6))}`}
        onPrev={() => go('calendar', { weekStart: addDaysStr(weekStart, -7) })}
        onNext={() => go('calendar', { weekStart: addDaysStr(weekStart, 7) })}
        onToday={() => go('calendar', { weekStart: weekStartOf(today) })}
        todayLabel="이번 주"
      />
    );

  return (
    <>
      <PageHeader
        title={header}
        right={
          <Segmented
            value={calView}
            options={[
              ['month', '월'],
              ['week', '주'],
            ]}
            onChange={(v) => go('calendar', { calView: v })}
          />
        }
      />
      <PageBody>
        <div className="grid gap-5 px-6 py-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
          {calView === 'month' ? <MonthGrid month={month} byDate={byDate} /> : <WeekColumns start={weekStart} byDate={byDate} />}
          <div className="space-y-4">
            <Card title={`${fmtMonth((calView === 'month' ? month : weekStart).slice(0, 7))} 마감`}>
              {monthSummary?.dueThisMonth.length ? (
                monthSummary.dueThisMonth.map((i) => <ItemRow key={i.ref} item={i} showDue compact actions={[]} />)
              ) : (
                <Empty>마감이 정해진 남은 할 일이 없어요.</Empty>
              )}
            </Card>
            <p className="px-1 text-[11px] leading-relaxed text-faint">항목을 다른 날짜로 끌어서 옮길 수 있어요. 날짜를 누르면 그날을 열고, 칸의 + 로 바로 추가해요.</p>
          </div>
        </div>
      </PageBody>
    </>
  );
}

/** 이 날짜 칸을 놓을 곳으로 */
function useDrop(date: string) {
  const over = useIsOver(`d:${date}`);
  return { over, props: { 'data-drop': 'date', 'data-date': date } };
}

function Chip({ item, date }: { item: Item; date: string }) {
  const edit = useStore((s) => s.edit);
  const now = useNow();
  const done = item.kind === 'task' && item.done;
  const st = statusFor(item, date, now);
  const drag = useItemDrag(item);
  const lifted = useDrag((s) => s.item?.ref === item.ref);
  return (
    <div
      {...drag}
      onClick={(e) => {
        e.stopPropagation();
        edit(item);
      }}
      className={`flex cursor-pointer touch-none items-center gap-1 truncate rounded px-1.5 py-[2px] text-[11.5px] leading-tight select-none hover:bg-hover ${lifted ? 'opacity-30' : ''} ${
        item.kind === 'event' || item.kind === 'allday' ? 'bg-event-soft' : st === 'overdue' ? 'bg-warn-soft' : ''
      } ${done ? 'text-faint line-through' : 'text-ink'}`}
    >
      {item.kind === 'task' && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? 'bg-faint' : 'bg-accent'}`} />}
      {item.time && <span className="tabular shrink-0 text-muted">{item.time.start}</span>}
      <span className="truncate">{item.text}</span>
    </div>
  );
}

function DayCell({ date, view, inMonth }: { date: string; view?: DayView; inMonth: boolean }) {
  const { go } = useStore();
  const [adding, setAdding] = useState(false);
  const { over, props } = useDrop(date);
  const today = todayStr();
  const items = dayOrder((view?.items ?? []).filter((i) => i.kind !== 'note' && i.parentLine === undefined));
  const max = view?.headline ? 3 : 4;
  const d = parseD(date);
  const info = dayInfo(date);
  const skin = useTheme().calendar;
  const isToday = date === today;
  const ring = isToday ? skin?.todayRing?.(34) : null;

  return (
    <div
      {...props}
      className={`group relative isolate flex min-h-[118px] flex-col gap-0.5 border-t border-l border-line/70 p-1.5 ${skin?.cellClass?.(date, inMonth) ?? (inMonth ? 'bg-surface' : 'bg-bg/60')} ${over ? '!bg-accent-soft ring-2 ring-inset ring-accent' : ''}`}
    >
      {skin?.cellDecor && <div className="pointer-events-none absolute inset-0 -z-10">{skin.cellDecor(date, { today, inMonth, compact: false })}</div>}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go('day', { day: date })}
          className={`tabular relative flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] hover:bg-hover ${
            isToday ? (ring ? skin?.todayNumClass : 'bg-accent font-bold text-on-accent') : !inMonth ? `${info.tone || 'text-faint'} opacity-50` : info.tone || 'text-muted'
          }`}
        >
          {ring && <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{ring}</span>}
          <span className="relative">{d.getDate()}</span>
        </button>
        {info.holiday && <span className="truncate text-[10.5px] font-medium text-sun">{info.holiday}</span>}
        <button type="button" onClick={() => setAdding(true)} className="ml-auto hidden rounded px-1.5 text-[14px] leading-none text-faint group-hover:block hover:bg-hover hover:text-ink" title="이 날 추가">
          +
        </button>
      </div>
      {view?.headline && <div className="truncate px-1 text-[11.5px] font-semibold text-ink">{view.headline}</div>}
      {items.slice(0, max).map((i) => (
        <Chip key={i.ref} item={i} date={date} />
      ))}
      {items.length > max && (
        <button type="button" onClick={() => go('day', { day: date })} className="px-1.5 text-left text-[11px] text-muted hover:text-ink">
          +{items.length - max}개 더
        </button>
      )}
      {adding && (
        <div className="absolute top-1 right-1 left-1 z-30">
          <QuickAdd defaultDate={date} autoFocus onDone={() => setAdding(false)} placeholder={`${fmtShortDate(date, today)} 추가`} />
          <button type="button" onClick={() => setAdding(false)} className="mt-1 w-full rounded bg-surface-2 py-0.5 text-[11px] text-muted">
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

function MonthGrid({ month, byDate }: { month: string; byDate: Map<string, DayView> }) {
  const days = monthDays(month);
  const skin = useTheme().calendar;
  const Frame = skin?.Frame;
  const grid = (
    <div className="overflow-hidden rounded-xl border-r border-b border-line/70">
      <div className={`grid grid-cols-7 border-t border-l border-line/70 ${skin?.weekHeadClass ?? 'bg-bg'}`}>
        {WEEK.map((w, i) => (
          <div key={w} className={`py-1.5 text-center text-[11px] ${weekHeadTone(i)}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => (
          <DayCell key={d} date={d} view={byDate.get(d)} inMonth={d.startsWith(month)} />
        ))}
      </div>
    </div>
  );
  return Frame ? <Frame month={month}>{grid}</Frame> : grid;
}

function WeekColumns({ start, byDate }: { start: string; byDate: Map<string, DayView> }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(start, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => (
        <WeekColumn key={d} date={d} view={byDate.get(d)} />
      ))}
    </div>
  );
}

function WeekColumn({ date, view }: { date: string; view?: DayView }) {
  const { go } = useStore();
  const { over, props } = useDrop(date);
  const today = todayStr();
  const d = parseD(date);
  const items = dayOrder((view?.items ?? []).filter((i) => i.kind !== 'note' && i.parentLine === undefined));
  const info = dayInfo(date);
  return (
    <div {...props} className={`flex min-h-[420px] flex-col rounded-xl border border-line/60 p-2 ${over ? 'bg-accent-soft ring-2 ring-accent' : date === today ? 'bg-surface-2' : 'bg-surface'}`}>
      <button type="button" onClick={() => go('day', { day: date })} className="mb-1 rounded-lg px-1.5 py-1 text-left hover:bg-hover">
        <div className={`text-[11px] ${date === today ? 'text-accent' : info.tone || 'text-faint'}`}>{WEEK[d.getDay()]}요일</div>
        <div className={`tabular text-[18px] font-semibold ${date === today ? 'text-accent' : info.tone}`}>{d.getDate()}</div>
        {info.holiday && <div className="truncate text-[11px] font-medium text-sun">{info.holiday}</div>}
        {view?.headline && <div className="mt-0.5 line-clamp-2 text-[12px] text-ink">{view.headline}</div>}
      </button>
      <div className="flex-1 space-y-0.5">
        {items.map((i) => (
          <Chip key={i.ref} item={i} date={date} />
        ))}
      </div>
      <QuickAdd defaultDate={date} className="mt-2" placeholder="추가" />
    </div>
  );
}

export { fmtTime };
