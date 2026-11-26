import type { ParsedLine, Priority, TimeRange } from '../model.js';

const LIST_RE = /^(\s*)([-*+])\s+(.*)$/;
const CHECKBOX_RE = /^\[(.)\]\s?(.*)$/;
const TIME_RE = /^(\d{1,2}:\d{2})(?:\s*[-~]\s*(\d{1,2}:\d{2}))?(?:\s+|$)(.*)$/;
const ALLDAY_RE = /^종일(?:\s+|$)(.*)$/;

const VS = '\\uFE0F?';
const DATE = '(\\d{4}-\\d{2}-\\d{2})';

const PRIORITY_EMOJI: Record<string, Priority> = {
  '🔺': 'highest',
  '⏫': 'high',
  '🔼': 'medium',
  '🔽': 'low',
  '⏬': 'lowest',
};
export const PRIORITY_TO_EMOJI: Record<Priority, string> = {
  highest: '🔺',
  high: '⏫',
  medium: '🔼',
  low: '🔽',
  lowest: '⏬',
};

/** Tasks 기호 중 이 앱이 아는 것. 반복 규칙의 끝을 찾을 때도 쓴다 */
const SIGNIFIERS = ['📅', '⏳', '🛫', '➕', '✅', '❌', '🆔', '⛔', '🔁', '🔺', '⏫', '🔼', '🔽', '⏬'];
const SIGNIFIER_CLASS = SIGNIFIERS.join('|');

const DATE_FIELDS = [
  ['due', '📅'],
  ['scheduled', '⏳'],
  ['startDate', '🛫'],
  ['created', '➕'],
  ['doneDate', '✅'],
] as const;

export function normalizeTime(t: string): string {
  const [h = '0', m = '00'] = t.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

export function isValidTime(t: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 24 && min >= 0 && min < 60 && !(h === 24 && min > 0);
}

function takeField(s: string, emoji: string, valuePattern: string): [string, string | undefined] {
  const re = new RegExp(`\\s*${emoji}${VS}\\s*${valuePattern}`, 'u');
  const m = re.exec(s);
  if (!m) return [s, undefined];
  return [s.slice(0, m.index) + s.slice(m.index + m[0].length), m[1]];
}

/**
 * 목록 줄 하나를 읽는다. 목록 줄이 아니면 null.
 */
export function parseLine(line: string): ParsedLine | null {
  const lm = LIST_RE.exec(line.replace(/\r$/, ''));
  if (!lm) return null;
  const indent = lm[1] ?? '';
  const bullet = lm[2] ?? '-';
  let rest = lm[3] ?? '';

  let status: string | undefined;
  const cm = CHECKBOX_RE.exec(rest);
  if (cm) {
    status = cm[1];
    rest = cm[2] ?? '';
  }

  let time: TimeRange | undefined;
  let allday = false;
  const tm = TIME_RE.exec(rest);
  if (tm && tm[1]) {
    const start = normalizeTime(tm[1]);
    const end = tm[2] ? normalizeTime(tm[2]) : undefined;
    if (isValidTime(start) && (!end || isValidTime(end))) {
      time = end ? { start, end } : { start };
      rest = tm[3] ?? '';
    }
  } else if (status === undefined) {
    const am = ALLDAY_RE.exec(rest);
    if (am) {
      allday = true;
      rest = am[1] ?? '';
    }
  }

  const result: ParsedLine = {
    kind: status !== undefined ? 'task' : time ? 'event' : allday ? 'allday' : 'note',
    indent,
    bullet,
    done: status !== undefined && status !== ' ',
    text: '',
    tags: [],
  };
  if (status !== undefined) result.status = status;
  if (time) result.time = time;

  // 기호 읽기
  let s = rest;
  let v: string | undefined;
  for (const [field, emoji] of DATE_FIELDS) {
    [s, v] = takeField(s, emoji, DATE);
    if (v) result[field] = v;
  }
  [s, v] = takeField(s, '🆔', '([A-Za-z0-9_-]+)');
  if (v) result.id = v;
  [s, v] = takeField(s, '🔁', `([^\\n]*?)(?=\\s*(?:${SIGNIFIER_CLASS})|\\s*$)`);
  if (v) result.recurrence = v.trim();
  for (const [emoji, p] of Object.entries(PRIORITY_EMOJI)) {
    const re = new RegExp(`\\s*${emoji}${VS}`, 'u');
    if (re.test(s)) {
      s = s.replace(re, '');
      result.priority ??= p;
    }
  }

  result.text = s.replace(/\s+/g, ' ').trim();
  result.tags = [...result.text.matchAll(/(?:^|\s)#([^\s#]+)/gu)].map((m) => m[1] ?? '');
  return result;
}

function formatTime(t: TimeRange): string {
  return t.end ? `${t.start}-${t.end}` : t.start;
}

/**
 * 항목을 한 줄로 쓴다. 기호 순서: 본문 → 우선순위 → 🔁 → ➕ → 🛫 → ⏳ → 📅 → 🆔 → ✅
 */
export function formatLine(item: ParsedLine): string {
  const parts: string[] = [];
  const head = `${item.indent}${item.bullet}`;
  if (item.kind === 'task') {
    const status = item.done ? (item.status && item.status !== ' ' ? item.status : 'x') : ' ';
    parts.push(`${head} [${status}]`);
  } else {
    parts.push(head);
  }
  if (item.kind === 'allday') parts.push('종일');
  if (item.time && item.kind !== 'allday') parts.push(formatTime(item.time));
  if (item.text) parts.push(item.text);
  if (item.priority) parts.push(PRIORITY_TO_EMOJI[item.priority]);
  if (item.recurrence) parts.push(`🔁 ${item.recurrence}`);
  if (item.created) parts.push(`➕ ${item.created}`);
  if (item.startDate) parts.push(`🛫 ${item.startDate}`);
  if (item.scheduled) parts.push(`⏳ ${item.scheduled}`);
  if (item.due) parts.push(`📅 ${item.due}`);
  if (item.id) parts.push(`🆔 ${item.id}`);
  if (item.doneDate) parts.push(`✅ ${item.doneDate}`);
  return parts.join(' ');
}
