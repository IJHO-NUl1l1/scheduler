import type { GridWidget } from '@shared/api';

/**
 * 대시보드 격자 계산 (순수 함수). 12열, 행 높이 고정.
 * - 겹치면 아래로 밀어낸다
 * - 위에 빈칸이 있으면 끌어올린다 (중력)
 * - 다른 위젯 위에 놓으면 두 위젯이 크기를 유지한 채 자리를 맞바꾼다
 */
export const COLS = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SizeLimit {
  minW: number;
  minH: number;
  maxH?: number;
}

export const collide = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const clampX = (w: GridWidget): GridWidget => ({ ...w, w: Math.min(COLS, Math.max(1, w.w)), x: Math.max(0, Math.min(COLS - Math.min(COLS, w.w), w.x)), y: Math.max(0, w.y) });

/** 위젯 정렬 순서: 위에서 아래, 왼쪽에서 오른쪽 */
const byPos = (a: GridWidget, b: GridWidget) => a.y - b.y || a.x - b.x;

/**
 * 겹침 해소: fixed 위젯을 먼저 그 자리에 두고, 나머지는 위치 순서대로 겹치지 않을 때까지 아래로 민다.
 */
export function resolve(ws: GridWidget[], fixedIds: string[] = []): GridWidget[] {
  const placed: GridWidget[] = [];
  const put = (w: GridWidget) => {
    let c = clampX(w);
    while (placed.some((p) => collide(c, p))) c = { ...c, y: c.y + 1 };
    placed.push(c);
  };
  for (const id of fixedIds) {
    const w = ws.find((x) => x.id === id);
    if (w) put(w);
  }
  for (const w of [...ws].filter((x) => !fixedIds.includes(x.id)).sort(byPos)) put(w);
  return order(ws, placed);
}

/** 중력: 위쪽 빈칸으로 끌어올린다 */
export function compact(ws: GridWidget[]): GridWidget[] {
  const placed: GridWidget[] = [];
  for (const w of [...ws].sort(byPos)) {
    let c = clampX(w);
    while (c.y > 0 && !placed.some((p) => collide({ ...c, y: c.y - 1 }, p))) c = { ...c, y: c.y - 1 };
    while (placed.some((p) => collide(c, p))) c = { ...c, y: c.y + 1 };
    placed.push(c);
  }
  return order(ws, placed);
}

/** 입력 순서를 유지해서 돌려준다 (React key 안정) */
function order(original: GridWidget[], placed: GridWidget[]): GridWidget[] {
  const m = new Map(placed.map((p) => [p.id, p]));
  return original.map((w) => m.get(w.id) ?? w);
}

/** 빈 곳(또는 다른 위젯과 일부 겹치는 곳)으로 옮기기 */
export function moveTo(ws: GridWidget[], id: string, x: number, y: number): GridWidget[] {
  const next = ws.map((w) => (w.id === id ? clampX({ ...w, x, y }) : w));
  return compact(resolve(next, [id]));
}

/** 두 위젯 자리 맞바꾸기. 크기는 그대로 */
export function swap(ws: GridWidget[], aId: string, bId: string): GridWidget[] {
  const a = ws.find((w) => w.id === aId);
  const b = ws.find((w) => w.id === bId);
  if (!a || !b || a.id === b.id) return ws;

  // 같은 줄이면: 줄 안에서 순서만 바꾸고 왼쪽부터 다시 채운다 (크기 유지, 빈칸 없음)
  if (a.y === b.y) {
    const row = ws.filter((w) => w.y === a.y).sort((p, q) => p.x - q.x);
    const ia = row.findIndex((w) => w.id === aId);
    const ib = row.findIndex((w) => w.id === bId);
    const reordered = [...row];
    reordered[ia] = row[ib]!;
    reordered[ib] = row[ia]!;
    let x = row[0]!.x;
    const placedRow = new Map<string, number>();
    for (const w of reordered) {
      placedRow.set(w.id, x);
      x += w.w;
    }
    if (x <= COLS) {
      const next = ws.map((w) => (placedRow.has(w.id) ? { ...w, x: placedRow.get(w.id)! } : w));
      return compact(resolve(next, reordered.map((w) => w.id)));
    }
  }

  const next = ws.map((w) => (w.id === aId ? clampX({ ...w, x: b.x, y: b.y }) : w.id === bId ? clampX({ ...w, x: a.x, y: a.y }) : w));
  // 위에 있던 쪽을 먼저 고정해서 서로 겹칠 때 아래쪽이 밀리게
  const first = b.y <= a.y ? [aId, bId] : [bId, aId];
  return compact(resolve(next, first));
}

/** 크기 바꾸기 (최소·최대 제한) */
export function resize(ws: GridWidget[], id: string, w: number, h: number, limit: SizeLimit): GridWidget[] {
  const next = ws.map((x) => {
    if (x.id !== id) return x;
    const nw = Math.max(limit.minW, Math.min(COLS - x.x, w));
    const nh = Math.max(limit.minH, Math.min(limit.maxH ?? 40, h));
    return { ...x, w: nw, h: nh };
  });
  return compact(resolve(next, [id]));
}

/** 맨 아래 왼쪽에 추가 */
export function addAtEnd(ws: GridWidget[], w: Omit<GridWidget, 'x' | 'y'>): GridWidget[] {
  const bottom = ws.reduce((m, x) => Math.max(m, x.y + x.h), 0);
  return compact([...ws, { ...w, x: 0, y: bottom }]);
}

export function bottomOf(ws: GridWidget[]): number {
  return ws.reduce((m, x) => Math.max(m, x.y + x.h), 0);
}
