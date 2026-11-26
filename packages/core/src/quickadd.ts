import type { Priority } from './model.js';
import { addDays, isDateString, parseDate, toDateString } from './dates.js';
import { isValidTime, normalizeTime } from './parse/line.js';

/**
 * 빠른 추가 입력을 AI 없이 해석한다 (토큰 0).
 *
 *   "15:00-16:00 서류 검토"        → 오늘, 시간 할 일
 *   "내일 오후 3시 회의 @"          → 내일 15:00, 일정(체크박스 없음)
 *   "금요일 보고서 ~11/28 !"       → 이번/다음 금요일, 마감 11-28, 우선순위 높음
 *   "인박스 언젠가 할 일"           → Inbox
 *
 * - 날짜: 오늘 내일 모레 글피, 월요일~일요일(오늘 이후 가장 가까운 날, "요일"까지 써야 함), M/D, M-D, YYYY-MM-DD, 인박스|inbox
 * - 시간: HH:mm, HH:mm-HH:mm, N시, N시 반, N시-M시, 오전/오후 붙이기
 * - 마감: ~M/D, ~YYYY-MM-DD, 마감 M/D
 * - 우선순위: ! 높음, !! 최상
 * - @ 가 있으면 일정(체크박스 없음)
 */
export interface QuickAdd {
  kind: 'task' | 'event';
  text: string;
  /** null이면 Inbox */
  date: string | null;
  start?: string;
  end?: string;
  due?: string;
  priority?: Priority;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function resolveMonthDay(m: number, d: number, today: string): string | undefined {
  const y = Number(today.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, '0');
  let s = `${y}-${pad(m)}-${pad(d)}`;
  if (!isDateString(s)) return undefined;
  // 이미 지난 날짜면 내년으로 (한 달 이상 지났을 때만)
  if (s < addDays(today, -31)) s = `${y + 1}-${pad(m)}-${pad(d)}`;
  return s;
}

function parseDateToken(tok: string, today: string): string | null | undefined {
  if (tok === '오늘') return today;
  if (tok === '내일') return addDays(today, 1);
  if (tok === '모레') return addDays(today, 2);
  if (tok === '글피') return addDays(today, 3);
  if (/^(인박스|inbox)$/i.test(tok)) return null;
  // "일"만 쓰면 "할 일"과 헷갈리므로 요일은 반드시 "X요일"로
  const wm = /^([월화수목금토일])요일$/.exec(tok);
  if (wm) {
    const target = WEEKDAYS.indexOf(wm[1] ?? '');
    const cur = parseDate(today).getDay();
    const diff = (target - cur + 7) % 7 || 7;
    return addDays(today, diff);
  }
  if (isDateString(tok)) return tok;
  const md = /^(\d{1,2})[/-](\d{1,2})$/.exec(tok);
  if (md) return resolveMonthDay(Number(md[1]), Number(md[2]), today);
  return undefined;
}

/** "오후 3시 반", "15:30", "3시" → HH:mm */
function toTime(ampm: string | undefined, h: number, m: number): string | undefined {
  let hour = h;
  if (ampm === '오후' && hour < 12) hour += 12;
  if (ampm === '오전' && hour === 12) hour = 0;
  const t = normalizeTime(`${hour}:${String(m).padStart(2, '0')}`);
  return isValidTime(t) ? t : undefined;
}

const ONE_TIME = String.raw`(?:(오전|오후)\s*)?(?:(\d{1,2}):(\d{2})|(\d{1,2})시(?:\s*(반|\d{1,2}분))?)`;
const TIME_RE = new RegExp(String.raw`(?:^|\s)${ONE_TIME}(?:\s*[-~]\s*${ONE_TIME})?(?=\s|$)`, 'u');

function timeFrom(groups: (string | undefined)[], offset: number, inheritAmPm?: string): string | undefined {
  const ampm = groups[offset] ?? inheritAmPm;
  const hh = groups[offset + 1];
  const mm = groups[offset + 2];
  const hOnly = groups[offset + 3];
  const half = groups[offset + 4];
  if (hh !== undefined && mm !== undefined) return toTime(ampm, Number(hh), Number(mm));
  if (hOnly !== undefined) {
    const min = half === '반' ? 30 : half ? Number(half.replace('분', '')) : 0;
    return toTime(ampm, Number(hOnly), min);
  }
  return undefined;
}

export function parseQuickAdd(input: string, today: string, defaultDate: string | null = today): QuickAdd {
  let s = ` ${input.replace(/\s+/g, ' ').trim()} `;
  const out: QuickAdd = { kind: 'task', text: '', date: defaultDate };

  // 일정 표시
  if (/(^|\s)@(?=\s|$)/.test(s)) {
    out.kind = 'event';
    s = s.replace(/(^|\s)@(?=\s|$)/g, ' ');
  }

  // 우선순위
  const pm = /(^|\s)(!{1,2})(?=\s|$)/.exec(s);
  if (pm) {
    out.priority = pm[2] === '!!' ? 'highest' : 'high';
    s = s.replace(pm[0], ' ');
  }

  // 마감
  const dm = /(?:^|\s)(?:~|마감\s*)(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2})(?=\s|$)/.exec(s);
  if (dm?.[1]) {
    const d = isDateString(dm[1]) ? dm[1] : (() => {
      const [m, day] = dm[1].split(/[/-]/).map(Number);
      return resolveMonthDay(m ?? 0, day ?? 0, today);
    })();
    if (d) {
      out.due = d;
      s = s.replace(dm[0], ' ');
    }
  }

  // 날짜 (첫 번째로 해석되는 토큰 하나만)
  for (const tok of s.trim().split(' ')) {
    const d = parseDateToken(tok, today);
    if (d !== undefined) {
      out.date = d;
      s = s.replace(new RegExp(`(^|\\s)${tok.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?=\\s|$)`), ' ');
      break;
    }
  }

  // 시간
  const tm = TIME_RE.exec(s);
  if (tm) {
    const g = tm.slice(1);
    const start = timeFrom(g, 0);
    const end = timeFrom(g, 5, g[0]);
    if (start && (!end || end > start)) {
      out.start = start;
      if (end) out.end = end;
      s = s.replace(tm[0], ' ');
    }
  }

  out.text = s.replace(/\s+/g, ' ').trim();
  if (out.kind === 'event' && !out.start && out.date === null) out.kind = 'task';
  return out;
}

/** 오늘 날짜 문자열 (테스트에서 덮어쓰기 쉽게 분리) */
export const todayString = () => toDateString(new Date());
