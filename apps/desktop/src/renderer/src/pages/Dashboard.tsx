import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { GridWidget, WidgetType } from '@shared/api';
import { useStore } from '../store';
import { periodOf, useNow } from '../lib';
import { useTheme } from '../themes';
import { PageBody, PageHeader } from '../components/Shell';
import { Icon } from '../components/ui';
import { COLS, addAtEnd, bottomOf, moveTo, resize, swap } from '../widgets/grid';
import { GAP, ROW_H, WIDGET_META, defaultLayout, makeWidget } from '../widgets/layout';
import { WIDGETS, WidgetLink } from '../widgets/registry';

const HEADER_H = 40;
const PAD = 14;

/**
 * 대시보드: 12열 격자 위의 위젯. 구성은 볼트의 .planner/layout.json에 저장된다.
 * 편집 모드: 위젯을 누르면 떠올라 커서를 따라오고, 다른 위젯 위에 놓으면 자리를 맞바꾼다(크기 유지).
 * 빈 곳에 놓으면 그 자리로, 모서리를 끌면 칸 단위로 크기 조절.
 */
export function Dashboard() {
  const { home, editLayout, setEditLayout } = useStore();
  const now = useNow();
  const theme = useTheme();
  if (!home) return null;
  const subline = theme.subline?.(now);
  return (
    <>
      <PageHeader
        title={<span className="text-[24px] leading-tight">{theme.greeting(periodOf(now), now)}</span>}
        sub={
          (subline || home.today.headline) && (
            <span className="flex flex-wrap gap-x-3 text-[13px]">
              {subline && <span className="text-accent">{subline}</span>}
              {home.today.headline && (
                <span>
                  오늘은 <span className="text-ink">{home.today.headline}</span>
                </span>
              )}
            </span>
          )
        }
      />
      <PageBody>
        <div className="mx-auto max-w-[1320px] px-8 pt-5 pb-20">
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setEditLayout(!editLayout)}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors ${editLayout ? 'bg-accent text-on-accent' : 'text-faint hover:bg-surface-2 hover:text-ink'}`}
            >
              <Icon name="dashboard" size={13} />
              {editLayout ? '편집 완료' : '화면 편집'}
            </button>
          </div>
          {editLayout && <EditBar />}
          <GridBoard now={now} />
        </div>
      </PageBody>
    </>
  );
}

function EditBar() {
  const { layout, setLayout } = useStore();
  const [open, setOpen] = useState(false);
  const used = new Set(layout.widgets.map((w) => w.type));
  const types = (Object.keys(WIDGET_META) as WidgetType[]).filter((t) => WIDGET_META[t].multiple || !used.has(t));
  const add = (t: WidgetType) => {
    setLayout((l) => ({ ...l, widgets: addAtEnd(l.widgets, makeWidget(t, t === 'heading' ? { options: { title: '새 구역' } } : {})) }));
    setOpen(false);
    setTimeout(() => document.querySelector('main')?.scrollTo({ top: 1e6, behavior: 'smooth' }), 50);
  };
  return (
    <div className="sticky top-3 z-40 mb-5 flex items-center gap-3 rounded-xl border border-accent/30 bg-surface/95 px-4 py-2.5 text-[12.5px] shadow-xl shadow-black/40 backdrop-blur">
      <span className="font-semibold text-accent">화면 편집</span>
      <span className="text-muted">누르고 끌어서 옮기기 · 다른 위젯 위에 놓으면 자리 바꾸기 · 오른쪽 아래 모서리로 크기 조절</span>
      <span className="relative ml-auto">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-medium text-on-accent">
          <Icon name="plus" size={13} /> 위젯 추가
        </button>
        {open && (
          <div className="absolute top-full right-0 z-50 mt-2 w-[280px] rounded-xl border border-line bg-surface p-1.5 shadow-2xl shadow-black/60">
            {types.map((t) => (
              <button key={t} type="button" onClick={() => add(t)} className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover">
                <span className="tabular mt-0.5 w-9 shrink-0 rounded bg-surface-2 py-0.5 text-center text-[10px] text-faint">
                  {WIDGET_META[t].w}×{WIDGET_META[t].h}
                </span>
                <span>
                  <span className="block text-[13px]">{WIDGET_META[t].title}</span>
                  <span className="block text-[11px] text-faint">{WIDGET_META[t].desc}</span>
                </span>
              </button>
            ))}
            {!types.length && <p className="px-3 py-2 text-[12px] text-faint">모든 위젯을 쓰고 있어요</p>}
          </div>
        )}
      </span>
      <button type="button" onClick={() => void useStore.getState().ask({ title: '기본 구성으로 되돌릴까요?', body: '위젯 배치와 크기가 처음 상태로 돌아가요.', ok: '되돌리기' }).then((y) => y && setLayout(() => defaultLayout()))} className="shrink-0 text-muted hover:text-ink">
        기본값
      </button>
    </div>
  );
}

interface BoardDrag {
  id: string;
  mode: 'move' | 'resize';
  /** 누른 지점과 위젯 왼쪽 위의 거리 (px) */
  ox: number;
  oy: number;
  /** 지금 커서 위치 (보드 기준 px) */
  px: number;
  py: number;
  preview: GridWidget[];
}

function GridBoard({ now }: { now: Date }) {
  const { home, layout, setLayout, editLayout: edit } = useStore();
  const board = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [drag, setDrag] = useState<BoardDrag | null>(null);

  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!edit) setDrag(null);
  }, [edit]);

  if (!home) return null;
  const colW = (width - GAP * (COLS - 1)) / COLS;
  const stepX = colW + GAP;
  const stepY = ROW_H + GAP;
  const box = (w: GridWidget) => ({ left: w.x * stepX, top: w.y * stepY, width: w.w * colW + (w.w - 1) * GAP, height: w.h * ROW_H + (w.h - 1) * GAP });
  const shown = drag?.preview ?? layout.widgets;
  const rows = bottomOf(shown) + (edit ? 4 : 0);
  const boardH = Math.max(0, rows * stepY - GAP);

  const begin = (e: RPointerEvent, w: GridWidget, mode: BoardDrag['mode']) => {
    if (!edit || e.button !== 0) return;
    if (mode === 'move' && (e.target as HTMLElement).closest('button, input, [data-nodrag]')) return;
    e.preventDefault();
    e.stopPropagation();
    const r = board.current!.getBoundingClientRect();
    const b = box(w);
    const start: BoardDrag = { id: w.id, mode, ox: e.clientX - r.left - b.left, oy: e.clientY - r.top - b.top, px: e.clientX - r.left, py: e.clientY - r.top, preview: layout.widgets };
    setDrag(start);
    let cur = start;
    let lastKey = '';
    const base = layout.widgets;
    const a = base.find((x) => x.id === w.id)!;

    const move = (ev: PointerEvent) => {
      const rr = board.current!.getBoundingClientRect();
      const px = ev.clientX - rr.left;
      const py = ev.clientY - rr.top;
      let preview: GridWidget[];
      if (mode === 'resize') {
        const nw = Math.round((px - a.x * stepX + GAP) / stepX);
        const nh = Math.round((py - a.y * stepY + GAP) / stepY);
        preview = resize(base, a.id, nw, nh, WIDGET_META[a.type].limit);
      } else {
        // 커서가 다른 위젯 위에 있으면 자리 바꾸기, 아니면 그 칸으로 이동
        const cx = Math.floor(px / stepX);
        const cy = Math.floor(py / stepY);
        const over = base.find((o) => o.id !== a.id && cx >= o.x && cx < o.x + o.w && cy >= o.y && cy < o.y + o.h);
        if (over) preview = swap(base, a.id, over.id);
        else preview = moveTo(base, a.id, Math.round((px - cur.ox) / stepX), Math.round((py - cur.oy) / stepY));
      }
      const key = preview.map((p) => `${p.id}:${p.x},${p.y},${p.w},${p.h}`).join('|');
      cur = { ...cur, px, py, preview: key === lastKey ? cur.preview : preview };
      lastKey = key;
      setDrag(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      const final = cur.preview;
      setDrag(null);
      if (final !== base) setLayout((l) => ({ ...l, widgets: final }));
    };
    document.body.style.cursor = mode === 'resize' ? 'nwse-resize' : 'grabbing';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragged = drag ? shown.find((w) => w.id === drag.id) : undefined;
  const original = drag ? layout.widgets.find((w) => w.id === drag.id) : undefined;

  return (
    <div
      ref={board}
      className="relative"
      style={{
        height: boardH,
        // 편집 중에는 격자 칸을 보여준다
        backgroundImage: edit
          ? `repeating-linear-gradient(to bottom, transparent 0 ${ROW_H}px, var(--bg) ${ROW_H}px ${stepY}px), repeating-linear-gradient(to right, color-mix(in srgb, var(--surface-2) 70%, transparent) 0 ${colW}px, transparent ${colW}px ${stepX}px)`
          : undefined,
        transition: 'height 200ms ease',
      }}
    >
      {shown.map((w) => {
        const b = box(w);
        const isDragged = drag?.id === w.id;
        const lifting = isDragged && drag.mode === 'move';
        return (
          <div
            key={w.id}
            className="absolute"
            style={{
              transform: `translate(${b.left}px, ${b.top}px)`,
              width: b.width,
              height: b.height,
              transition: drag && !isDragged ? 'transform 220ms cubic-bezier(.2,.8,.2,1), width 220ms, height 220ms' : isDragged && drag.mode === 'resize' ? 'width 120ms, height 120ms' : 'none',
              zIndex: isDragged ? 5 : 1,
            }}
          >
            {lifting ? (
              // 놓일 자리
              <div className="h-full w-full rounded-2xl border-2 border-dashed border-accent/70 bg-accent-soft" />
            ) : (
              <Frame w={w} edit={edit} resizing={isDragged} onPointerDown={(e) => begin(e, w, 'move')} onResizeStart={(e) => begin(e, w, 'resize')} body={WIDGETS[w.type].render({ conf: w, home, now, box: bodyBox(w, b) })} />
            )}
          </div>
        );
      })}

      {/* 떠오른 위젯: 원래 크기 그대로 커서를 따라온다 */}
      {drag?.mode === 'move' && dragged && original && (
        <div
          className="pointer-events-none absolute z-50"
          style={{ left: drag.px - drag.ox, top: drag.py - drag.oy, width: box(original).width, height: box(original).height, transform: 'rotate(-0.8deg) scale(1.035)', opacity: 0.9 }}
        >
          <div className="h-full w-full rounded-2xl shadow-[0_40px_80px_-16px_rgba(0,0,0,0.85),0_0_0_1px_var(--accent)]">
            <Frame w={original} edit lifted body={WIDGETS[original.type].render({ conf: original, home, now, box: bodyBox(original, box(original)) })} />
          </div>
        </div>
      )}
    </div>
  );
}

function bodyBox(w: GridWidget, b: { width: number; height: number }) {
  if (w.type === 'heading') return { width: b.width, height: b.height };
  const header = w.type === 'clock' ? 0 : HEADER_H;
  return { width: b.width - PAD * 2, height: b.height - header - PAD * 2 };
}

function Frame({
  w,
  edit,
  body,
  lifted,
  resizing,
  onPointerDown,
  onResizeStart,
}: {
  w: GridWidget;
  edit: boolean;
  body: React.ReactNode;
  lifted?: boolean;
  resizing?: boolean;
  onPointerDown?: (e: RPointerEvent) => void;
  onResizeStart?: (e: RPointerEvent) => void;
}) {
  const { setLayout, home, go } = useStore();
  const meta = WIDGET_META[w.type];
  const Decor = useTheme().CardDecor;
  const link = home && !edit ? WIDGETS[w.type].link?.(go, home) : undefined;
  const update = (fn: (x: GridWidget) => GridWidget | null) =>
    setLayout((l) => ({ ...l, widgets: l.widgets.map((x) => (x.id === w.id ? fn(x) : x)).filter((x): x is GridWidget => x !== null) }));

  const controls = edit && !lifted && (
    <span className="ml-auto flex items-center gap-1" data-nodrag>
      {w.type === 'clock' && (
        <button type="button" onClick={() => update((x) => ({ ...x, options: { ...x.options, clockStyle: x.options?.clockStyle === 'digital' ? 'analog' : 'digital' } }))} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted hover:text-ink">
          {w.options?.clockStyle === 'digital' ? '디지털' : '아날로그'}
        </button>
      )}
      <span className="tabular rounded-md px-1.5 text-[10.5px] text-faint">
        {w.w}×{w.h}
      </span>
      <button type="button" title="위젯 빼기" onClick={() => update(() => null)} className="rounded-md p-1 text-faint hover:bg-warn-soft hover:text-warn">
        <Icon name="close" size={13} />
      </button>
    </span>
  );

  const resizeHandle = edit && !lifted && w.type !== 'heading' && (
    <div onPointerDown={onResizeStart} data-nodrag className="absolute right-1 bottom-1 z-10 flex h-5 w-5 cursor-nwse-resize items-end justify-end text-faint hover:text-accent" title="끌어서 크기 조절">
      <svg viewBox="0 0 10 10" width="10" height="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M9 3L3 9M9 6.5L6.5 9" />
      </svg>
    </div>
  );

  if (w.type === 'heading') {
    return (
      <div
        onPointerDown={onPointerDown}
        className={`relative flex h-full items-center gap-3 rounded-xl ${edit ? 'cursor-grab border border-dashed border-line bg-surface/60 px-3 hover:border-accent/60' : ''}`}
      >
        {edit && !lifted ? (
          <>
            <input
              value={w.options?.title ?? ''}
              onChange={(e) => update((x) => ({ ...x, options: { ...x.options, title: e.target.value } }))}
              placeholder="구역 이름"
              className="w-[180px] rounded-md bg-surface-2 px-2 py-1 text-[12.5px] font-semibold outline-none focus:bg-hover"
            />
            <span className="h-px flex-1 bg-line" />
            {controls}
          </>
        ) : (
          body
        )}
      </div>
    );
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className={`relative flex h-full flex-col overflow-hidden widget-frame rounded-2xl border bg-surface ${resizing ? 'border-accent' : ''} ${
        edit && !lifted ? 'cursor-grab hover:border-accent/60' : ''
      }`}
    >
      {Decor && !edit && <Decor id={w.id} />}
      {w.type !== 'clock' || edit ? (
        <header className="flex shrink-0 items-center gap-2 border-b border-line/70 px-4" style={{ height: HEADER_H }}>
          <h3 className="text-[12.5px] font-semibold">{meta.title}</h3>
          {controls}
          {link && (
            <span className="ml-auto">
              <WidgetLink onClick={link.run}>{link.label}</WidgetLink>
            </span>
          )}
        </header>
      ) : null}
      <div className={`min-h-0 flex-1 overflow-auto ${edit ? 'pointer-events-none select-none' : ''}`} style={{ padding: PAD }}>
        {body}
      </div>
      {resizeHandle}
    </div>
  );
}
