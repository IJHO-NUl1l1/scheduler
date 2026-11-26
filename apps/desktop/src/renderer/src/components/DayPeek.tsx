import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DayView } from '@scheduler/core';
import type { Item } from '@scheduler/core/pure';
import { WEEK, dayInfo, dayOrder, parseD } from '../lib';
import { useTheme } from '../themes';

/** 날짜 미리보기 카드를 띄울 위치 (기준 칸의 화면 좌표) */
export interface PeekAnchor {
  date: string;
  rect: DOMRect;
}

const W = 272;
const MAX_ROWS = 7;

/**
 * 달력 칸에 마우스를 올리면 뜨는 날짜 미리보기.
 * 칸 오른쪽에 붙이고, 넘치면 왼쪽으로 뒤집는다. 위젯의 transform에 영향받지 않게 body에 그린다.
 */
export function DayPeek({ anchor, view, today }: { anchor: PeekAnchor; view: DayView | undefined; today: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const { rect } = anchor;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + 8;
    if (left + W > vw - 8) left = rect.left - W - 8;
    left = Math.max(8, left);
    const top = Math.min(Math.max(8, rect.top - 4), vh - h - 8);
    setPos({ left, top });
  }, [anchor, view]);

  const date = anchor.date;
  const d = parseD(date);
  const info = dayInfo(date);
  const items = dayOrder((view?.items ?? []).filter((i) => i.kind !== 'note' && i.parentLine === undefined));
  const tasks = items.filter((i) => i.kind === 'task');
  const done = tasks.filter((i) => i.done).length;
  const events = items.length - tasks.length;
  const isToday = date === today;
  const past = date < today;

  return createPortal(
    <div
      ref={ref}
      className="pop-in pointer-events-none fixed z-[70] rounded-xl border border-line bg-surface-2 shadow-2xl shadow-black/60"
      style={{ width: W, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <header className="flex items-baseline gap-2 border-b border-line/70 px-3.5 pb-2 pt-3">
        <span className={`tabular text-[20px] font-semibold leading-none ${isToday ? 'text-accent' : info.tone}`}>{d.getDate()}</span>
        <span className={`text-[12px] ${info.tone || 'text-muted'}`}>
          {d.getMonth() + 1}월 · {WEEK[d.getDay()]}요일
        </span>
        <span className="ml-auto flex gap-1">
          {isToday && <span className="rounded bg-accent-soft px-1.5 py-px text-[10.5px] font-semibold text-accent">오늘</span>}
          {info.holiday && <span className="max-w-[120px] truncate rounded bg-sun/15 px-1.5 py-px text-[10.5px] font-medium text-sun">{info.holiday}</span>}
        </span>
      </header>

      <div className="px-3.5 py-2.5">
        {view?.headline && <div className="mb-2 border-l-2 border-accent pl-2 text-[12.5px] font-semibold leading-snug">{view.headline}</div>}
        {items.length ? (
          <ul className="space-y-1.5">
            {items.slice(0, MAX_ROWS).map((i) => (
              <PeekRow key={i.ref} item={i} overdue={past && i.kind === 'task' && !i.done} />
            ))}
          </ul>
        ) : (
          !view?.headline && <p className="py-1 text-[12px] text-faint">비어 있는 날</p>
        )}
        {items.length > MAX_ROWS && <div className="mt-1.5 pl-[22px] text-[11px] text-faint">외 {items.length - MAX_ROWS}개</div>}
      </div>

      <footer className="flex items-center gap-2 border-t border-line/70 px-3.5 py-2 text-[11px] text-faint">
        {tasks.length > 0 && (
          <span>
            할 일 <span className="tabular text-muted">{done}/{tasks.length}</span>
          </span>
        )}
        {events > 0 && (
          <span>
            일정 <span className="tabular text-muted">{events}</span>
          </span>
        )}
        <span className="ml-auto">클릭해서 열기</span>
      </footer>
    </div>,
    document.body,
  );
}

function PeekRow({ item, overdue }: { item: Item; overdue: boolean }) {
  const Check = useTheme().TaskCheck;
  const time = item.kind === 'allday' ? '종일' : (item.time?.start ?? '');
  const isTask = item.kind === 'task';
  return (
    <li className="flex items-center gap-2 text-[12.5px] leading-tight">
      {isTask ? (
        <Check done={!!item.done} sm />
      ) : (
        <span className="flex h-3.5 w-3.5 shrink-0 justify-center">
          <span className="h-full w-[3px] rounded-full bg-event" />
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate ${item.done ? 'text-faint line-through' : overdue ? 'text-warn' : 'text-ink'}`}>{item.text}</span>
      {time && <span className="tabular shrink-0 text-[11px] text-faint">{time}</span>}
    </li>
  );
}
