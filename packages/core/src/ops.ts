import type { Item, ParsedLine, Priority } from './model.js';
import { isDateString, isMonthString, isYearString } from './dates.js';
import { generateId } from './ids.js';
import { formatLine, isValidTime, normalizeTime } from './parse/line.js';
import { GOAL_SECTION, MEMO_SECTION, TASK_SECTION, itemBlock, parseDocument, type ParsedDocument } from './parse/document.js';
import { appendToSection, joinLines, replaceLines, setFrontmatterField } from './write/edit.js';
import { INBOX_FILE, Vault, VaultError, dailyPath, monthlyPath, yearlyPath } from './vault.js';

/**
 * 볼트를 수정하는 작업들. 앱과 MCP 서버가 공통으로 쓴다.
 * 모든 작업은 Vault.modify를 거쳐서 "수정 직전 다시 읽기 → 바뀐 줄만 교체 → 원자적 쓰기"를 따른다.
 */

export interface AddTaskInput {
  text: string;
  /** 없으면 Inbox */
  date?: string;
  start?: string;
  end?: string;
  due?: string;
  scheduled?: string;
  priority?: Priority;
  /** 하위 항목으로 넣을 부모의 ref. 있으면 date는 무시하고 부모 파일에 넣는다 */
  parentRef?: string;
}

export interface AddEventInput {
  date: string;
  title: string;
  /** 없으면 종일 */
  start?: string;
  end?: string;
}

export interface UpdateTaskPatch {
  text?: string;
  due?: string | null;
  scheduled?: string | null;
  priority?: Priority | null;
}

function fail(msg: string): never {
  throw new VaultError(msg);
}

function checkDate(d: string | undefined | null, name: string): void {
  if (d && !isDateString(d)) fail(`${name} 날짜 형식이 잘못됨 (YYYY-MM-DD): ${d}`);
}

function checkTimes(start?: string, end?: string): { start?: string; end?: string } {
  const s = start ? normalizeTime(start) : undefined;
  const e = end ? normalizeTime(end) : undefined;
  if (s && !isValidTime(s)) fail(`시작 시간 형식이 잘못됨 (HH:mm): ${start}`);
  if (e && !isValidTime(e)) fail(`끝 시간 형식이 잘못됨 (HH:mm): ${end}`);
  if (e && !s) fail('끝 시간만 있고 시작 시간이 없음');
  if (s && e && e <= s) fail(`끝 시간이 시작 시간보다 빠름: ${s}-${e}`);
  const out: { start?: string; end?: string } = {};
  if (s) out.start = s;
  if (e) out.end = e;
  return out;
}

function cleanText(text: string): string {
  const t = text.replace(/[\r\n]+/g, ' ').trim();
  if (!t) fail('내용이 비어 있음');
  return t;
}

function findById(doc: ParsedDocument, id: string): Item {
  const item = doc.items.find((i) => i.id === id);
  if (!item) fail(`ID ${id} 항목을 찾지 못함`);
  return item;
}

/** 수정 직전에 다시 읽은 문서에서 같은 항목을 다시 찾는다 */
function relocate(doc: ParsedDocument, original: Item): Item {
  if (original.id) return findById(doc, original.id);
  const item = doc.items.find((i) => i.line === original.line && i.raw === original.raw);
  if (!item) fail('파일이 그 사이 바뀌어서 항목 위치를 확인할 수 없음. 다시 조회한 뒤 시도');
  return item;
}

async function locate(vault: Vault, ref: string): Promise<{ doc: ParsedDocument; item: Item }> {
  const found = await vault.findItem(ref);
  if (!found) fail(`항목을 찾지 못함: ${ref}`);
  return found;
}

/** 한 항목의 줄만 바꾸는 공통 경로. 🆔가 없으면 이때 붙인다 */
async function mutateLine(vault: Vault, ref: string, fn: (p: ParsedLine) => ParsedLine): Promise<Item> {
  const { item: found } = await locate(vault, ref);
  const ids = found.id ? undefined : await vault.allIds();
  let id = found.id;
  await vault.modify(found.file, (doc) => {
    const item = relocate(doc, found);
    const before = formatLine(item);
    const next = fn({ ...item, tags: [...item.tags] });
    if (!next.id) next.id = id ?? generateId(ids ?? new Set());
    id = next.id;
    const after = formatLine(next);
    // 실제로 바뀐 게 없으면 원래 줄(사용자 기호 순서 등)을 그대로 둔다
    if (after === before) return null;
    return replaceLines(doc.lines, item.line, item.line + 1, [after]);
  });
  const doc = await vault.readDoc(found.file);
  return findById(doc ?? fail('파일이 사라짐'), id ?? fail('ID 없음'));
}

function newTaskLine(input: Omit<AddTaskInput, 'parentRef' | 'date'>, id: string, indent = ''): string {
  const p: ParsedLine = { kind: 'task', indent, bullet: '-', done: false, text: input.text, tags: [], id };
  const t = checkTimes(input.start, input.end);
  if (t.start) p.time = t.end ? { start: t.start, end: t.end } : { start: t.start };
  if (input.due) p.due = input.due;
  if (input.scheduled) p.scheduled = input.scheduled;
  if (input.priority) p.priority = input.priority;
  return formatLine(p);
}

export async function addTask(vault: Vault, input: AddTaskInput): Promise<Item> {
  const text = cleanText(input.text);
  checkDate(input.date, 'date');
  checkDate(input.due, 'due');
  checkDate(input.scheduled, 'scheduled');
  const ids = await vault.allIds();
  const id = generateId(ids);

  if (input.parentRef) {
    const { item: parent } = await locate(vault, input.parentRef);
    await vault.modify(parent.file, (doc) => {
      const p = relocate(doc, parent);
      const [, end] = itemBlock(doc, p);
      const line = newTaskLine({ ...input, text }, id, `${p.indent}  `);
      return replaceLines(doc.lines, end, end, [line]);
    });
    const doc = await vault.readDoc(parent.file);
    return findById(doc ?? fail('파일이 사라짐'), id);
  }

  const file = input.date ? dailyPath(input.date) : INBOX_FILE;
  const line = newTaskLine({ ...input, text }, id);
  const doc = await vault.modify(file, (d) => appendToSection(d, TASK_SECTION, [line], { before: MEMO_SECTION }));
  return findById(doc, id);
}

export async function addEvent(vault: Vault, input: AddEventInput): Promise<Item> {
  const title = cleanText(input.title);
  checkDate(input.date, 'date');
  const t = checkTimes(input.start, input.end);
  const id = generateId(await vault.allIds());
  const p: ParsedLine = {
    kind: t.start ? 'event' : 'allday',
    indent: '',
    bullet: '-',
    done: false,
    text: title,
    tags: [],
    id,
  };
  if (t.start) p.time = t.end ? { start: t.start, end: t.end } : { start: t.start };
  const doc = await vault.modify(dailyPath(input.date), (d) =>
    appendToSection(d, TASK_SECTION, [formatLine(p)], { before: MEMO_SECTION }),
  );
  return findById(doc, id);
}

export async function updateTask(vault: Vault, ref: string, patch: UpdateTaskPatch): Promise<Item> {
  checkDate(patch.due, 'due');
  checkDate(patch.scheduled, 'scheduled');
  const text = patch.text !== undefined ? cleanText(patch.text) : undefined;
  return mutateLine(vault, ref, (p) => {
    if (text !== undefined) p.text = text;
    if (patch.due !== undefined) {
      if (patch.due) p.due = patch.due;
      else delete p.due;
    }
    if (patch.scheduled !== undefined) {
      if (patch.scheduled) p.scheduled = patch.scheduled;
      else delete p.scheduled;
    }
    if (patch.priority !== undefined) {
      if (patch.priority) p.priority = patch.priority;
      else delete p.priority;
    }
    return p;
  });
}

/** 시간 할당·변경. start가 없으면 시간을 뺀다 (일정은 종일로 바뀜) */
export async function setTaskTime(vault: Vault, ref: string, start?: string, end?: string): Promise<Item> {
  const t = checkTimes(start, end);
  return mutateLine(vault, ref, (p) => {
    if (p.kind === 'note') fail('체크박스나 시간이 없는 글머리에는 시간을 넣을 수 없음');
    if (t.start) {
      p.time = t.end ? { start: t.start, end: t.end } : { start: t.start };
      if (p.kind === 'allday') p.kind = 'event';
    } else {
      delete p.time;
      if (p.kind === 'event') p.kind = 'allday';
    }
    return p;
  });
}

export async function completeTask(vault: Vault, ref: string, today: string, done = true): Promise<Item> {
  checkDate(today, 'today');
  return mutateLine(vault, ref, (p) => {
    if (p.kind !== 'task') fail('체크박스가 있는 할 일만 완료 처리할 수 있음');
    p.done = done;
    if (done) {
      p.status = 'x';
      p.doneDate = today;
    } else {
      p.status = ' ';
      delete p.doneDate;
    }
    return p;
  });
}

/** 하위 항목까지 블록째 다른 날짜(또는 Inbox)로 옮긴다 */
export async function moveTask(vault: Vault, ref: string, toDate?: string): Promise<Item> {
  checkDate(toDate, 'toDate');
  // 먼저 ID를 확정해서 옮긴 뒤에도 찾을 수 있게 한다
  const withId = await mutateLine(vault, ref, (p) => p);
  const id = withId.id ?? fail('ID 없음');
  const target = toDate ? dailyPath(toDate) : INBOX_FILE;
  if (target === withId.file && !withId.parentLine) return withId;

  const srcDoc = (await vault.readDoc(withId.file)) ?? fail('파일이 사라짐');
  const src = findById(srcDoc, id);
  const [s, e] = itemBlock(srcDoc, src);
  const baseIndent = src.indent;
  const block = srcDoc.lines.slice(s, e).map((l) => (l.startsWith(baseIndent) ? l.slice(baseIndent.length) : l.trimStart()));

  if (target === withId.file) {
    // 같은 파일 안에서 하위 항목을 최상위로 올리는 경우
    await vault.modify(target, (doc) => {
      const it = findById(doc, id);
      const [bs, be] = itemBlock(doc, it);
      const removed = parseDocument(joinLines(replaceLines(doc.lines, bs, be, []), doc.eol), doc.file);
      return appendToSection(removed, TASK_SECTION, block, { before: MEMO_SECTION });
    });
  } else {
    // 대상에 먼저 쓰고 원본에서 지운다 (중간에 실패하면 사라지는 대신 중복이 남는다)
    await vault.modify(target, (doc) => appendToSection(doc, TASK_SECTION, block, { before: MEMO_SECTION }));
    await vault.modify(withId.file, (doc) => {
      const it = findById(doc, id);
      const [bs, be] = itemBlock(doc, it);
      return replaceLines(doc.lines, bs, be, []);
    });
  }
  const doc = (await vault.readDoc(target)) ?? fail('파일이 사라짐');
  return findById(doc, id);
}

export async function deleteTask(vault: Vault, ref: string): Promise<void> {
  const { item: found } = await locate(vault, ref);
  await vault.modify(found.file, (doc) => {
    const item = relocate(doc, found);
    const [s, e] = itemBlock(doc, item);
    return replaceLines(doc.lines, s, e, []);
  });
}

/**
 * 종류 바꾸기: 할 일(체크박스) ↔ 일정(체크박스 없음, 시간 필요) ↔ 종일 일정.
 * 일정으로 바꾸는데 시간이 없으면 종일 일정이 된다.
 */
export async function setKind(vault: Vault, ref: string, kind: 'task' | 'event' | 'allday'): Promise<Item> {
  return mutateLine(vault, ref, (p) => {
    if (kind === 'task') {
      p.kind = 'task';
      p.status ??= ' ';
      p.done = p.status !== ' ';
    } else {
      p.kind = kind === 'event' && p.time ? 'event' : 'allday';
      if (p.kind === 'allday') delete p.time;
      delete p.status;
      delete p.doneDate;
      p.done = false;
    }
    return p;
  });
}

/** 연(YYYY) 또는 월(YYYY-MM) 목표 하나 추가 */
export async function addGoal(vault: Vault, period: string, text: string): Promise<Item> {
  const file = isMonthString(period) ? monthlyPath(period) : isYearString(period) ? yearlyPath(period) : fail(`기간 형식이 잘못됨 (YYYY 또는 YYYY-MM): ${period}`);
  const id = generateId(await vault.allIds());
  const line = formatLine({ kind: 'task', indent: '', bullet: '-', done: false, text: cleanText(text), tags: [], id });
  const doc = await vault.modify(file, (d) => appendToSection(d, GOAL_SECTION, [line], { before: MEMO_SECTION }));
  return findById(doc, id);
}

export async function setHeadline(vault: Vault, date: string, text: string | null): Promise<void> {
  checkDate(date, 'date');
  const value = text?.replace(/[\r\n]+/g, ' ').trim() || undefined;
  await vault.modify(dailyPath(date), (doc) => setFrontmatterField(doc, 'headline', value));
}

/**
 * 연(YYYY) 또는 월(YYYY-MM) 목표 목록을 통째로 정한다.
 * 같은 내용의 기존 목표는 줄(완료 상태, ID 포함)을 그대로 유지한다.
 */
export async function setGoals(vault: Vault, period: string, goals: string[]): Promise<Item[]> {
  const file = isMonthString(period) ? monthlyPath(period) : isYearString(period) ? yearlyPath(period) : fail(`기간 형식이 잘못됨 (YYYY 또는 YYYY-MM): ${period}`);
  const texts = goals.map(cleanText);
  const ids = await vault.allIds();
  const doc = await vault.modify(file, (d) => {
    const existing = d.items.filter((i) => i.section === GOAL_SECTION && i.parentLine === undefined);
    const lines = texts.map((t) => {
      const keep = existing.find((i) => i.text === t);
      if (keep) return d.lines.slice(...itemBlock(d, keep)).join('\n');
      return formatLine({ kind: 'task', indent: '', bullet: '-', done: false, text: t, tags: [], id: generateId(ids) });
    }).flatMap((l) => l.split('\n'));

    const sec = d.sections.find((s) => s.title === GOAL_SECTION);
    if (!sec) return appendToSection(d, GOAL_SECTION, lines, { before: MEMO_SECTION });
    // 섹션 본문 중 목록 부분만 교체하고, 앞뒤 일반 문장은 남긴다
    const listLines = new Set<number>();
    for (const it of existing) {
      const [s, e] = itemBlock(d, it);
      for (let i = s; i < e; i++) listLines.add(i);
    }
    const body: string[] = [];
    let inserted = false;
    for (let i = sec.start; i < sec.end; i++) {
      if (listLines.has(i)) {
        if (!inserted) {
          body.push(...lines);
          inserted = true;
        }
        continue;
      }
      body.push(d.lines[i] ?? '');
    }
    if (!inserted) {
      let at = body.length;
      while (at > 0 && (body[at - 1] ?? '').trim() === '') at--;
      body.splice(at, 0, ...lines);
    }
    return replaceLines(d.lines, sec.start, sec.end, body);
  });
  return doc.items.filter((i) => i.section === GOAL_SECTION && i.parentLine === undefined);
}
