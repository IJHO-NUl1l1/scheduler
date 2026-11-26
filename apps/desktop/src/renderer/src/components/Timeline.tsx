import { useEffect, useRef, useState } from 'react';
import { layoutTimeline, minutesOf, timeOfMinutes, type Item, type TimeStatus } from '@scheduler/core/pure';
import { useStore } from '../store';
import { useDrag } from '../drag';

const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

interface BlockDrag {
  ref: string;
  mode: 'move' | 'resize';
  startY: number;
  start: number;
  end: number;
  hasEnd: boolean;
  delta: number;
  moved: boolean;
}

/**
 * 타임라인. 시간이 있는 항목만 그린다.
 * - 블록을 누르고 끌면 블록이 떠올라 커서를 따라오고, 원래 자리엔 점선이 남는다 (15분 단위)
 * - 블록 아래 끝을 끌면 길이 조절
 * - 목록의 항목을 끌어 오면 놓일 시각이 미리 보인다
 * - 블록 클릭: 편집
 */
export function Timeline({
  items,
  statusOf,
  now,
  date,
  isToday,
  dayStart,
  dayEnd,
  hourHeight = 52,
  full = false,
  maxHeight = 640,
  editable = true,
}: {
  items: Item[];
  statusOf: (i: Item) => TimeStatus | undefined;
  now: Date;
  date: string;
  isToday: boolean;
  dayStart: string;
  dayEnd: string;
  hourHeight?: number;
  full?: boolean;
  maxHeight?: number;
  editable?: boolean;
}) {
  const { op, edit, highlight, editing } = useStore();
  const [drag, setDrag] = useState<BlockDrag | null>(null);
  const incoming = useDrag((s) => (s.target?.kind === 'timeline' && s.target.date === date ? s.target.minute : undefined));
  const incomingItem = useDrag((s) => (s.target?.kind === 'timeline' && s.target.date === date ? s.item : null));
  const slots = layoutTimeline(items);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let from = full ? 0 : minutesOf(dayStart);
  let to = full ? 24 * 60 : minutesOf(dayEnd);
  for (const s of slots) {
    from = Math.min(from, s.start);
    to = Math.max(to, s.end);
  }
  if (isToday && !full) {
    from = Math.min(from, nowMin);
    to = Math.max(to, nowMin + 30);
  }
  from = Math.floor(from / 60) * 60;
  to = Math.min(24 * 60, Math.ceil(to / 60) * 60);
  const px = (min: number) => ((min - from) / 60) * hourHeight;
  const hours: number[] = [];
  for (let m = from; m <= to; m += 60) hours.push(m);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = isToday ? nowMin : (slots[0]?.start ?? minutesOf(dayStart));
    el.scrollTop = Math.max(0, px(target) - el.clientHeight / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, isToday, date]);

  const finish = (d: BlockDrag) => {
    if (!d.moved) {
      const item = items.find((i) => i.ref === d.ref);
      if (item) edit(item);
      return;
    }
    if (!d.delta) return;
    if (d.mode === 'move') {
      const s = Math.max(0, Math.min(24 * 60 - SNAP, d.start + d.delta));
      const e = d.hasEnd ? Math.min(24 * 60, s + (d.end - d.start)) : undefined;
      void op('setTime', d.ref, timeOfMinutes(s), e !== undefined ? timeOfMinutes(e) : undefined);
    } else {
      const e = Math.max(d.start + SNAP, Math.min(24 * 60, d.end + d.delta));
      void op('setTime', d.ref, timeOfMinutes(d.start), timeOfMinutes(e));
    }
  };

  const incomingLen = incomingItem?.time?.end ? Math.max(SNAP, minutesOf(incomingItem.time.end) - minutesOf(incomingItem.time.start)) : 60;

  return (
    <div ref={scroller} className="relative overflow-y-auto pr-1" style={{ maxHeight }}>
      <div
        className="relative ml-12 select-none"
        style={{ height: px(to) + 12 }}
        data-drop={editable ? 'timeline' : undefined}
        data-date={date}
        data-from={from}
        data-hh={hourHeight}
      >
        {/* 시간 눈금 */}
        {hours.map((m) => (
          <div key={m} className="absolute right-0 left-0 border-t border-line" style={{ top: px(m) }}>
            <span className="tabular absolute -top-[7px] -left-12 w-9 text-right text-[10.5px] text-faint">{timeOfMinutes(m)}</span>
          </div>
        ))}
        {hours.slice(0, -1).map((m) => (
          <div key={`h${m}`} className="absolute right-0 left-0 border-t border-dotted border-line/50" style={{ top: px(m + 30) }} />
        ))}

        {slots.map((s) => {
          const st = statusOf(s.item);
          const done = st === 'done' || st === 'ended';
          const isEvent = s.item.kind === 'event';
          const d = drag?.ref === s.item.ref ? drag : null;
          const lifted = !!d?.moved;
          const start = d && d.mode === 'move' ? s.start + d.delta : s.start;
          const end = d ? (d.mode === 'move' ? s.end + d.delta : Math.max(s.start + SNAP, s.end + d.delta)) : s.end;
          const width = 100 / s.columns;
          const left = `calc(${s.column * width}% + 3px)`;
          const w = `calc(${width}% - 6px)`;
          const height = Math.max(24, px(end) - px(start) - 3);
          const tall = height >= 40;
          const tone =
            st === 'ongoing'
              ? 'bg-accent text-on-accent before:bg-on-accent/40'
              : st === 'overdue'
                ? 'bg-warn-soft text-ink before:bg-warn'
                : isEvent
                  ? 'bg-event-soft text-ink before:bg-event'
                  : 'bg-accent-soft text-ink before:bg-accent';
          return (
            <div key={s.item.ref}>
              {/* 들어 올렸을 때 원래 자리 */}
              {lifted && (
                <div className="absolute rounded-lg border border-dashed border-faint/60" style={{ top: px(s.start) + 1.5, height: Math.max(24, px(s.end) - px(s.start) - 3), left, width: w }} />
              )}
              <div
                title={`${s.item.time?.start}${s.item.time?.end ? `–${s.item.time.end}` : ''} ${s.item.text}`}
                onPointerDown={(e) => {
                  if (!editable || e.button !== 0) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mode = e.clientY > rect.bottom - 8 ? 'resize' : 'move';
                  let cur: BlockDrag = { ref: s.item.ref, mode, startY: e.clientY, start: s.start, end: s.end, hasEnd: !!s.item.time?.end, delta: 0, moved: false };
                  setDrag(cur);
                  // 창 전체에서 받아서 블록 밖으로 나가도 계속 끌린다
                  const move = (ev: PointerEvent) => {
                    const dy = ev.clientY - cur.startY;
                    cur = { ...cur, delta: snap((dy / hourHeight) * 60), moved: cur.moved || Math.abs(dy) > 4 };
                    setDrag(cur);
                  };
                  const up = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    document.body.style.cursor = '';
                    finish(cur);
                    setDrag(null);
                  };
                  document.body.style.cursor = mode === 'resize' ? 'ns-resize' : 'grabbing';
                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', up);
                }}
                className={`group absolute overflow-hidden rounded-lg py-1 pr-2 pl-3 text-[12px] leading-tight transition-[box-shadow,transform,opacity] duration-150 before:absolute before:top-1 before:bottom-1 before:left-1 before:w-[3px] before:rounded-full ${tone} ${
                  done && !lifted ? 'opacity-45' : ''
                } ${highlight.has(s.item.ref) || editing?.ref === s.item.ref ? 'ring-1 ring-accent' : ''} ${
                  lifted ? 'z-30 scale-[1.03] -rotate-[0.6deg] opacity-95 shadow-[0_20px_44px_-10px_rgba(0,0,0,0.8)]' : ''
                } ${editable ? (lifted ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
                style={{ top: px(start) + 1.5, height, left, width: w }}
              >
                {tall ? (
                  <>
                    <div className={`truncate font-semibold ${done ? 'line-through' : ''}`}>{s.item.text}</div>
                    <div className="tabular mt-0.5 truncate text-[11px] opacity-70">
                      {timeOfMinutes(start)}
                      {s.item.time?.end || d?.mode === 'resize' ? ` – ${timeOfMinutes(end)}` : ''}
                    </div>
                  </>
                ) : (
                  <div className="flex items-baseline gap-1.5 truncate">
                    <span className={`truncate font-semibold ${done ? 'line-through' : ''}`}>{s.item.text}</span>
                    <span className="tabular shrink-0 text-[10.5px] opacity-70">{timeOfMinutes(start)}</span>
                  </div>
                )}
                {editable && <div className="absolute right-2 bottom-0.5 left-2 h-1.5 cursor-ns-resize rounded-full opacity-0 group-hover:bg-current/20 group-hover:opacity-100" />}
              </div>
              {/* 옮길 시각 */}
              {lifted && (
                <div className="tabular pointer-events-none absolute z-40 rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-bg shadow-lg" style={{ top: px(start) - 9, right: 6 }}>
                  {timeOfMinutes(start)}–{timeOfMinutes(end)}
                </div>
              )}
            </div>
          );
        })}

        {/* 목록에서 끌어 온 항목이 놓일 자리 */}
        {incoming !== undefined && (
          <div className="pointer-events-none absolute right-1 left-1 z-20 rounded-lg border-2 border-dashed border-accent bg-accent-soft" style={{ top: px(incoming), height: Math.max(20, px(incoming + incomingLen) - px(incoming)) }}>
            <span className="tabular px-2 text-[11px] font-semibold text-accent">
              {timeOfMinutes(incoming)}–{timeOfMinutes(Math.min(24 * 60, incoming + incomingLen))}
            </span>
          </div>
        )}

        {isToday && nowMin >= from && nowMin <= to && (
          <div className="pointer-events-none absolute right-0 left-0 z-10" style={{ top: px(nowMin) }}>
            <div className="relative h-[1.5px] bg-now">
              <span className="tabular absolute -top-[9px] -left-12 w-[42px] rounded bg-now px-1 text-center text-[10px] font-semibold text-white">{timeOfMinutes(nowMin)}</span>
            </div>
          </div>
        )}
      </div>
      {slots.length === 0 && editable && <p className="mt-2 text-center text-[12px] text-faint">목록의 항목을 여기로 끌어 놓으면 시간이 정해져요</p>}
    </div>
  );
}
