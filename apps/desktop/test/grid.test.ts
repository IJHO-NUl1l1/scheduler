import { describe, expect, it } from 'vitest';
import type { GridWidget } from '../src/shared/api';
import { addAtEnd, collide, compact, moveTo, resize, swap } from '../src/renderer/src/widgets/grid';
import { defaultLayout, migrate } from '../src/renderer/src/widgets/layout';

const W = (id: string, x: number, y: number, w: number, h: number): GridWidget => ({ id, type: 'now', x, y, w, h });
const noOverlap = (ws: GridWidget[]) => ws.every((a, i) => ws.every((b, j) => i === j || !collide(a, b)));
const pos = (ws: GridWidget[]) => Object.fromEntries(ws.map((w) => [w.id, [w.x, w.y, w.w, w.h]]));

describe('grid', () => {
  it('compact: 위쪽 빈칸으로 끌어올린다', () => {
    expect(pos(compact([W('a', 0, 3, 6, 2), W('b', 6, 5, 6, 2)]))).toEqual({ a: [0, 0, 6, 2], b: [6, 0, 6, 2] });
  });

  it('swap: 같은 줄은 순서만 바꾸고 왼쪽부터 다시 채운다 (크기 유지, 빈칸 없음)', () => {
    const ws = [W('a', 0, 0, 6, 4), W('b', 6, 0, 3, 4), W('c', 9, 0, 3, 4), W('d', 0, 4, 12, 2)];
    expect(pos(swap(ws, 'b', 'a'))).toEqual({ a: [3, 0, 6, 4], b: [0, 0, 3, 4], c: [9, 0, 3, 4], d: [0, 4, 12, 2] });
    expect(pos(swap(ws, 'a', 'c'))).toEqual({ a: [6, 0, 6, 4], b: [3, 0, 3, 4], c: [0, 0, 3, 4], d: [0, 4, 12, 2] });
  });

  it('swap: 다른 줄은 위치를 맞바꾸고 겹치면 아래로 민다', () => {
    const ws = [W('a', 0, 0, 6, 4), W('b', 6, 0, 6, 4), W('c', 0, 4, 12, 2)];
    const r = swap(ws, 'c', 'a');
    expect(noOverlap(r)).toBe(true);
    const c = r.find((w) => w.id === 'c')!;
    expect([c.y, c.w, c.h]).toEqual([0, 12, 2]);
  });

  it('swap: 같은 크기는 정확히 자리 교환', () => {
    const r = swap([W('a', 0, 0, 6, 4), W('b', 6, 0, 6, 4), W('c', 0, 4, 12, 2)], 'a', 'b');
    expect(pos(r)).toEqual({ a: [6, 0, 6, 4], b: [0, 0, 6, 4], c: [0, 4, 12, 2] });
  });

  it('moveTo: 겹치는 위젯은 아래로 밀리고 겹침이 없다', () => {
    const r = moveTo([W('a', 0, 0, 6, 4), W('b', 6, 0, 6, 4), W('c', 0, 4, 12, 2)], 'c', 0, 0);
    expect(noOverlap(r)).toBe(true);
    expect(r.find((w) => w.id === 'c')!.y).toBe(0);
  });

  it('resize: 최소 크기와 오른쪽 경계', () => {
    const r = resize([W('a', 8, 0, 4, 4)], 'a', 10, 1, { minW: 3, minH: 3 });
    expect(pos(r)).toEqual({ a: [8, 0, 4, 3] });
  });

  it('addAtEnd: 맨 아래에 붙인다', () => {
    const r = addAtEnd([W('a', 0, 0, 12, 3)], { id: 'b', type: 'clock', w: 3, h: 4 });
    expect(pos(r)['b']).toEqual([0, 3, 3, 4]);
  });

  it('기본 레이아웃은 겹치지 않는다', () => {
    expect(noOverlap(defaultLayout().widgets)).toBe(true);
  });

  it('v2(섹션) → v3(격자) 변환', () => {
    const l = migrate({ version: 2, sections: [{ title: '지금', widgets: [{ type: 'now', size: 'lg' }, { type: 'clock', size: 'sm' }] }, { title: '앞으로', widgets: [{ type: 'week', size: 'full' }] }] });
    expect(l.version).toBe(3);
    expect(l.widgets.map((w) => [w.type, w.x, w.y, w.w])).toEqual([
      ['heading', 0, 0, 12],
      ['now', 0, 1, 6],
      ['clock', 6, 1, 3],
      ['heading', 0, 5, 12],
      ['week', 0, 6, 12],
    ]);
    expect(noOverlap(l.widgets)).toBe(true);
  });
});
