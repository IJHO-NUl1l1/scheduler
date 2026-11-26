import {
  addDays,
  addEvent,
  addGoal,
  addTask,
  completeTask,
  deleteTask,
  getDay,
  getHome,
  getInbox,
  getMonthSummary,
  getRange,
  getYear,
  moveTask,
  parseDate,
  parseQuickAdd,
  setHeadline,
  setKind,
  setTaskTime,
  toDateString,
  updateTask,
  VaultError,
  type Item,
  type Vault,
} from '@scheduler/core';
import type { OpResult, Ops, Queries } from '../shared/api';
import type { PlannerService } from './planner';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** "11/27(금)" / "오늘" / "내일" / "인박스" */
function dayLabel(date: string | null | undefined): string {
  if (date === null || date === undefined) return '인박스';
  const today = toDateString(new Date());
  if (date === today) return '오늘';
  if (date === addDays(today, 1)) return '내일';
  const d = parseDate(date);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
}

function whereLabel(i: Item): string {
  if (i.fileDate) return dayLabel(i.fileDate);
  if (i.file === 'Inbox.md') return '인박스';
  const m = /^Monthly\/(\d{4})-(\d{2})/.exec(i.file);
  if (m) return `${Number(m[2])}월 목표`;
  const y = /^Yearly\/(\d{4})/.exec(i.file);
  if (y) return `${y[1]}년 목표`;
  return i.file;
}

function label(i: Item): string {
  const time = i.kind === 'allday' ? '종일 ' : i.time ? `${i.time.start}${i.time.end ? `-${i.time.end}` : ''} ` : '';
  return `${time}${i.text}`;
}

const today = () => toDateString(new Date());

export function makeQueries(getVault: () => Vault | null) {
  const v = () => getVault() ?? (() => {
    throw new VaultError('볼트가 열려 있지 않음');
  })();
  const q: { [K in keyof Queries]: (...args: Queries[K][0]) => Promise<Queries[K][1]> } = {
    home: async () => {
      const vault = v();
      const now = new Date();
      const t = toDateString(now);
      const [home, range] = await Promise.all([getHome(vault, now), getRange(vault, t, addDays(t, 6))]);
      const byDate = new Map(range.map((d) => [d.date, d]));
      const week = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(t, i);
        return byDate.get(date) ?? { date, items: [], memo: '' };
      });
      return { ...home, week };
    },
    day: (date) => getDay(v(), date),
    range: (from, to) => getRange(v(), from, to),
    month: (month) => getMonthSummary(v(), month),
    year: (year) => getYear(v(), year),
    inbox: () => getInbox(v()),
  };
  return q;
}

export function makeOps(planner: PlannerService) {
  const ops: { [K in keyof Ops]: (...args: Ops[K]) => Promise<OpResult> } = {
    quickAdd: async (text, defaultDate) => {
      const r = await planner.run(async (vault) => {
        const q = parseQuickAdd(text, today(), defaultDate);
        if (!q.text) throw new VaultError('내용이 비어 있음');
        if (q.kind === 'event' && q.date) {
          const ev: Parameters<typeof addEvent>[1] = { date: q.date, title: q.text };
          if (q.start) ev.start = q.start;
          if (q.end) ev.end = q.end;
          return addEvent(vault, ev);
        }
        const input: Parameters<typeof addTask>[1] = { text: q.text };
        if (q.date) input.date = q.date;
        if (q.start) input.start = q.start;
        if (q.end) input.end = q.end;
        if (q.due) input.due = q.due;
        if (q.priority) input.priority = q.priority;
        return addTask(vault, input);
      });
      return { message: `추가함 · ${whereLabel(r.value)} · ${label(r.value)}`, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    addTask: async (input) => {
      const r = await planner.run((vault) => addTask(vault, input));
      return { message: `추가함 · ${whereLabel(r.value)} · ${label(r.value)}`, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    addEvent: async (input) => {
      const r = await planner.run((vault) => addEvent(vault, input));
      return { message: `일정 추가 · ${whereLabel(r.value)} · ${label(r.value)}`, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    addGoal: async (period, text) => {
      const r = await planner.run((vault) => addGoal(vault, period, text));
      return { message: `목표 추가 · ${text}`, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    update: async (ref, patch) => {
      const r = await planner.run((vault) => updateTask(vault, ref, patch));
      return { message: `수정함 · ${label(r.value)}`, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    setTime: async (ref, start, end) => {
      const r = await planner.run((vault) => setTaskTime(vault, ref, start, end));
      const msg = start ? `시간 변경 · ${label(r.value)}` : `시간 뺌 · ${r.value.text}`;
      return { message: msg, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    setKind: async (ref, kind) => {
      const r = await planner.run((vault) => setKind(vault, ref, kind));
      const name = { task: '할 일', event: '일정', allday: '종일 일정' }[r.value.kind as 'task'] ?? '';
      return { message: `${name}(으)로 바꿈 · ${r.value.text}`, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    complete: async (ref, done) => {
      const r = await planner.run((vault) => completeTask(vault, ref, today(), done));
      return { message: `${done ? '완료' : '완료 취소'} · ${r.value.text}`, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    move: async (ref, toDate) => {
      const r = await planner.run((vault) => moveTask(vault, ref, toDate ?? undefined));
      return { message: `${dayLabel(toDate)}(으)로 옮김 · ${r.value.text}`, item: r.value, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    remove: async (ref) => {
      const r = await planner.run(async (vault) => {
        const found = await vault.findItem(ref);
        if (!found) throw new VaultError('항목을 찾지 못함');
        await deleteTask(vault, ref);
        return found.item;
      });
      return { message: `삭제함 · ${r.value.text}`, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
    headline: async (date, text) => {
      const r = await planner.run((vault) => setHeadline(vault, date, text));
      return { message: text ? `${dayLabel(date)} 헤드라인 · ${text}` : `${dayLabel(date)} 헤드라인 지움`, ...(r.undoId ? { undoId: r.undoId } : {}) };
    },
  };
  return ops;
}
