import { afterEach, describe, expect, it } from 'vitest';
import {
  computeAlerts,
  freeSlots,
  getHome,
  getMonthSummary,
  getNow,
  getToday,
  getYear,
  layoutTimeline,
  parseDocument,
  timeStatus,
} from '../src/index.js';
import { makeVault } from './helpers.js';

const m = (t: string) => {
  const [h, mm] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (mm ?? 0);
};

describe('timeStatus', () => {
  const task = { kind: 'task' as const, done: false, time: { start: '14:00', end: '15:00' } };
  it.each([
    ['13:00', 'upcoming'],
    ['13:55', 'soon'],
    ['14:30', 'ongoing'],
    ['15:00', 'overdue'],
  ])('%s → %s', (now, status) => expect(timeStatus(task, m(now))).toBe(status));

  it('일정은 끝나면 ended, 완료된 할 일은 done', () => {
    expect(timeStatus({ ...task, kind: 'event' }, m('16:00'))).toBe('ended');
    expect(timeStatus({ ...task, done: true }, m('16:00'))).toBe('done');
  });

  it('시작만 있으면 기본 30분', () => {
    const t = { kind: 'task' as const, done: false, time: { start: '14:00' } };
    expect(timeStatus(t, m('14:29'))).toBe('ongoing');
    expect(timeStatus(t, m('14:30'))).toBe('overdue');
  });

  it('시간 없는 할 일은 open', () => {
    expect(timeStatus({ kind: 'task', done: false }, 0)).toBe('open');
  });
});

const doc = parseDocument(
  [
    '## 할 일',
    '- [ ] 09:00-10:00 A 🆔 aaaaaa',
    '- [ ] 09:30-11:00 B 🆔 bbbbbb',
    '- 13:00 C 🆔 cccccc',
    '- [x] 15:00-16:00 D 🆔 dddddd',
    '- [ ] E 🆔 eeeeee',
    '',
  ].join('\n'),
  'Daily/2026-11-24.md',
);

describe('타임라인 계산', () => {
  it('겹치는 항목은 칸을 나눈다', () => {
    const slots = layoutTimeline(doc.items);
    expect(slots.map((s) => [s.item.text, s.column, s.columns])).toEqual([
      ['A', 0, 2],
      ['B', 1, 2],
      ['C', 0, 1],
      ['D', 0, 1],
    ]);
  });

  it('빈 시간 (완료된 할 일은 자리 차지 안 함)', () => {
    expect(freeSlots(doc.items, '08:00', '18:00')).toEqual([
      { start: '08:00', end: '09:00', minutes: 60 },
      { start: '11:00', end: '13:00', minutes: 120 },
      { start: '13:30', end: '18:00', minutes: 270 },
    ]);
  });

  it('알림: 10분 전, 시작, 끝(할 일만), 완료 항목 제외', () => {
    const alerts = computeAlerts('2026-11-24', doc.items);
    expect(alerts.filter((a) => a.item.text === 'C').map((a) => a.type)).toEqual(['before', 'start']);
    expect(alerts.filter((a) => a.item.text === 'A').map((a) => a.type)).toEqual(['before', 'start', 'end']);
    expect(alerts.some((a) => a.item.text === 'D')).toBe(false);
    expect(alerts[0]?.at).toEqual(new Date(2026, 10, 24, 8, 50));
  });
});

describe('getToday / getNow / getHome', () => {
  let ctx: Awaited<ReturnType<typeof makeVault>>;
  afterEach(() => ctx?.cleanup());

  it('오늘 목록, 밀린 할 일, 다가오는 마감', async () => {
    ctx = await makeVault({
      'Daily/2026-11-24.md': [
        '---',
        'date: 2026-11-24',
        'headline: 오늘',
        '---',
        '## 할 일',
        '- [ ] 14:00-15:00 진행 중 🆔 t00001',
        '- [ ] 시간 없음 🆔 t00002',
        '- [ ] 09:00 밀린 시간 할 일 🆔 t00003',
        '- 16:00 회의 🆔 t00004',
        '',
      ].join('\n'),
      'Daily/2026-11-20.md': [
        '## 할 일',
        '- [ ] 지난주 남은 것 🆔 p00001',
        '- [x] 지난주 완료 🆔 p00002',
        '- [ ] 오늘 마감 📅 2026-11-24 🆔 p00003',
        '- [ ] 다음 주 마감 📅 2026-11-28 🆔 p00004',
        '',
      ].join('\n'),
      'Inbox.md': '## 할 일\n- [ ] 마감 지남 📅 2026-11-01 🆔 i00001\n- [ ] 날짜 없음 🆔 i00002\n',
      'Monthly/2026-11.md': '## 목표\n- [x] 목표1 🆔 g00001\n- [ ] 목표2 🆔 g00002\n- 체크박스 없는 목표\n',
    });
    const now = new Date(2026, 10, 24, 14, 20);
    const t = await getToday(ctx.vault, now);
    expect(t.headline).toBe('오늘');
    expect(t.items.map((x) => [x.item.text, x.status])).toEqual([
      ['진행 중', 'ongoing'],
      ['밀린 시간 할 일', 'overdue'],
      ['오늘 마감', 'open'],
      ['시간 없음', 'open'],
      ['회의', 'upcoming'],
    ]);
    expect(t.overdue.map((i) => i.text)).toEqual(['마감 지남', '지난주 남은 것']);
    expect(t.upcoming.map((i) => i.text)).toEqual(['다음 주 마감']);

    const n = await getNow(ctx.vault, now, { dayEnd: '18:00' });
    expect(n.ongoing.map((i) => i.text)).toEqual(['진행 중']);
    expect(n.next?.text).toBe('회의');
    expect(n.freeSlots).toEqual([
      { start: '15:00', end: '16:00', minutes: 60 },
      { start: '16:30', end: '18:00', minutes: 90 },
    ]);

    const month = await getMonthSummary(ctx.vault, '2026-11');
    expect(month.goals).toMatchObject({ done: 1, total: 2, ratio: 0.5 });
    expect(month.days.find((d) => d.date === '2026-11-24')).toMatchObject({ headline: '오늘', open: 3, events: 1 });

    const home = await getHome(ctx.vault, now);
    expect(home.inbox.map((i) => i.text)).toEqual(['마감 지남', '날짜 없음']);
    expect(home.year.goals.total).toBe(0);
  });
});

describe('getYear', () => {
  let ctx: Awaited<ReturnType<typeof makeVault>>;
  afterEach(() => ctx?.cleanup());
  it('월별 목표·완료 수와 날짜별 완료', async () => {
    ctx = await makeVault({
      'Daily/2026-03-02.md': '## 할 일\n- [x] a 🆔 a00001\n- [x] b 🆔 a00002\n- [ ] c 🆔 a00003\n',
      'Monthly/2026-03.md': '## 목표\n- [x] 목표 🆔 g00001\n',
      'Yearly/2026.md': '## 목표\n- [ ] 연 목표 🆔 y00001\n',
    });
    const y = await getYear(ctx.vault, '2026');
    expect(y.months[2]).toMatchObject({ month: '2026-03', done: 2, open: 1, goals: { done: 1, total: 1 } });
    expect(y.doneByDate).toEqual({ '2026-03-02': 2 });
    expect(y.tasksByDate).toEqual({ '2026-03-02': 3 });
    expect(y.goals.total).toBe(1);
  });
});
