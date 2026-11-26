import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { create } from 'zustand';
import { timeOfMinutes, type Item } from '@scheduler/core/pure';
import { useStore } from './store';
import { fmtShortDate, fmtTime, todayStr } from './lib';

/**
 * 항목 끌기 (목록 → 타임라인 / 다른 날짜).
 * 브라우저 기본 드래그 대신 포인터로 직접 처리해서, 누른 항목이 반투명하게 "떠올라" 커서를 따라오게 한다.
 *
 * 놓을 곳 표시 (HTML 속성):
 *   data-drop="date" data-date="YYYY-MM-DD"                     → 그날로 이동
 *   data-drop="timeline" data-date data-from(분) data-hh(시간당 px) → 그 시각으로 시간 할당
 */

const SNAP = 15;

export interface DropTarget {
  kind: 'date' | 'timeline';
  key: string;
  date: string;
  /** timeline일 때 놓일 시작 시각(분) */
  minute?: number;
}

interface DragState {
  item: Item | null;
  x: number;
  y: number;
  /** 누른 지점과 요소 왼쪽 위의 거리 */
  dx: number;
  dy: number;
  width: number;
  target: DropTarget | null;
}

export const useDrag = create<DragState>(() => ({ item: null, x: 0, y: 0, dx: 0, dy: 0, width: 0, target: null }));

function findTarget(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  if (!el) return null;
  const kind = el.dataset['drop'] as DropTarget['kind'];
  const date = el.dataset['date'] ?? '';
  if (kind === 'timeline') {
    const rect = el.getBoundingClientRect();
    const from = Number(el.dataset['from'] ?? 0);
    const hh = Number(el.dataset['hh'] ?? 48);
    const raw = from + ((y - rect.top) / hh) * 60;
    const minute = Math.max(0, Math.min(23 * 60, Math.round(raw / SNAP) * SNAP));
    return { kind, key: `tl:${date}`, date, minute };
  }
  return { kind: 'date', key: `d:${date}`, date };
}

/** 끝난 직후의 click(편집 열기)을 한 번 막는다 */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
}

async function drop(item: Item, t: DropTarget) {
  const { op } = useStore.getState();
  if (t.kind === 'date') {
    if (t.date && t.date !== item.fileDate) await op('move', item.ref, t.date);
    return;
  }
  let ref = item.ref;
  if (t.date && t.date !== item.fileDate) {
    const r = await op('move', ref, t.date);
    if (!r?.item) return;
    ref = r.item.ref;
  }
  const s = t.minute ?? 9 * 60;
  const len = item.time?.end ? Math.max(SNAP, toMin(item.time.end) - toMin(item.time.start)) : 60;
  await op('setTime', ref, timeOfMinutes(s), timeOfMinutes(Math.min(24 * 60, s + len)));
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** 항목 요소에 붙이는 끌기 핸들러 */
export function useItemDrag(item: Item) {
  const start = useRef<{ x: number; y: number; dx: number; dy: number; width: number } | null>(null);
  return {
    onPointerDown(e: RPointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, textarea, [data-nodrag]')) return;
      const rect = e.currentTarget.getBoundingClientRect();
      start.current = { x: e.clientX, y: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, width: rect.width };
      let started = false;
      const move = (ev: PointerEvent) => {
        const s = start.current;
        if (!s) return;
        if (!started) {
          if (Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < 5) return;
          started = true;
          document.body.style.cursor = 'grabbing';
          // 커서 가까이 작은 카드로 들어 올린다
          useDrag.setState({ item, dx: Math.min(s.dx, 28), dy: Math.min(s.dy, 18), width: Math.min(s.width, 300) });
        }
        useDrag.setState({ x: ev.clientX, y: ev.clientY, target: findTarget(ev.clientX, ev.clientY) });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.cursor = '';
        start.current = null;
        if (!started) return;
        swallowNextClick();
        const t = findTarget(ev.clientX, ev.clientY);
        useDrag.setState({ item: null, target: null });
        if (t) void drop(item, t);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
  };
}

/** 커서를 따라다니는 떠오른 항목 */
export function DragLayer() {
  const { item, x, y, dx, dy, width, target } = useDrag();
  if (!item) return null;
  const today = todayStr();
  const hint = target
    ? target.kind === 'timeline'
      ? `${target.date !== item.fileDate ? `${fmtShortDate(target.date, today)} ` : ''}${timeOfMinutes(target.minute ?? 0)}`
      : fmtShortDate(target.date, today)
    : null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <div
        className="absolute flex items-center gap-2.5 rounded-xl border border-accent/50 bg-surface-2/95 px-3 py-2 text-[13.5px] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75),0_0_0_1px_rgba(0,0,0,0.3)] backdrop-blur-sm"
        style={{ left: x - dx, top: y - dy, width, transform: 'rotate(-1.2deg) scale(1.04)', opacity: 0.92 }}
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.kind === 'task' ? 'bg-accent' : 'bg-event'}`} />
        {item.time && <span className="tabular shrink-0 text-[12px] text-muted">{fmtTime(item)}</span>}
        <span className="truncate">{item.text}</span>
      </div>
      {hint && (
        <div className="tabular absolute rounded-md bg-accent px-2 py-0.5 text-[11.5px] font-semibold text-on-accent shadow-lg" style={{ left: x + 14, top: y + 18 }}>
          → {hint}
        </div>
      )}
    </div>
  );
}

/** 놓을 곳 위에 있는지 (강조 표시용) */
export function useIsOver(key: string): boolean {
  return useDrag((s) => s.target?.key === key);
}
