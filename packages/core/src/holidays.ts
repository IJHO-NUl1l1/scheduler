import { addDays, parseDate } from './dates.js';

/**
 * 한국 공휴일 (관공서의 공휴일에 관한 규정, 2023년 개정 기준).
 *
 * - 양력 공휴일은 규칙으로 만든다.
 * - 음력 공휴일(설날·부처님오신날·추석)은 양력 날짜 표를 쓴다. 표에 없는 해는 음력 공휴일이 빠진다.
 * - 대체공휴일은 규칙으로 계산한다.
 *     설날·추석 연휴: 일요일 또는 다른 공휴일과 겹치면
 *     어린이날: 토·일요일 또는 다른 공휴일과 겹치면
 *     삼일절·광복절·개천절·한글날·부처님오신날·성탄절: 토·일요일과 겹치면
 *     → 그 공휴일(연휴는 마지막 날) 다음의 첫 번째 평일(공휴일이 아닌 날)
 * - 임시공휴일·선거일은 정해진 것만 표로 넣는다.
 */

export type HolidayKind = 'holiday' | 'substitute' | 'temporary';

export interface Holiday {
  date: string;
  name: string;
  kind: HolidayKind;
}

/** 음력 공휴일의 양력 날짜: [설날 당일, 부처님오신날, 추석 당일] */
const LUNAR: Record<number, [string, string, string]> = {
  2024: ['02-10', '05-15', '09-17'],
  2025: ['01-29', '05-05', '10-06'],
  2026: ['02-17', '05-24', '09-25'],
  2027: ['02-07', '05-13', '09-15'],
  2028: ['01-27', '05-02', '10-03'],
  2029: ['02-13', '05-20', '09-22'],
  2030: ['02-03', '05-09', '09-12'],
};

/** 임시공휴일·선거일 */
const TEMPORARY: Holiday[] = [
  { date: '2024-04-10', name: '국회의원 선거일', kind: 'temporary' },
  { date: '2024-10-01', name: '국군의 날 (임시공휴일)', kind: 'temporary' },
  { date: '2025-01-27', name: '임시공휴일', kind: 'temporary' },
  { date: '2025-06-03', name: '대통령 선거일', kind: 'temporary' },
  { date: '2026-06-03', name: '전국동시지방선거일', kind: 'temporary' },
];

type Rule = 'none' | 'satSun' | 'children' | 'lunarBlock';

interface Base {
  date: string;
  name: string;
  rule: Rule;
  /** 연휴 묶음 (설·추석) */
  block?: string;
}

const dow = (date: string) => parseDate(date).getDay();
const isWeekend = (date: string) => dow(date) === 0 || dow(date) === 6;

function baseHolidays(year: number): Base[] {
  const y = String(year);
  const out: Base[] = [
    { date: `${y}-01-01`, name: '신정', rule: 'none' },
    { date: `${y}-03-01`, name: '삼일절', rule: 'satSun' },
    { date: `${y}-05-05`, name: '어린이날', rule: 'children' },
    { date: `${y}-06-06`, name: '현충일', rule: 'none' },
    { date: `${y}-08-15`, name: '광복절', rule: 'satSun' },
    { date: `${y}-10-03`, name: '개천절', rule: 'satSun' },
    { date: `${y}-10-09`, name: '한글날', rule: 'satSun' },
    { date: `${y}-12-25`, name: '성탄절', rule: 'satSun' },
  ];
  const lunar = LUNAR[year];
  if (lunar) {
    const [seol, buddha, chuseok] = lunar.map((md) => `${y}-${md}`) as [string, string, string];
    for (const [day, name, block] of [
      [seol, '설날', 'seol'],
      [chuseok, '추석', 'chuseok'],
    ] as const) {
      out.push({ date: addDays(day, -1), name: `${name} 연휴`, rule: 'lunarBlock', block });
      out.push({ date: day, name, rule: 'lunarBlock', block });
      out.push({ date: addDays(day, 1), name: `${name} 연휴`, rule: 'lunarBlock', block });
    }
    out.push({ date: buddha, name: '부처님오신날', rule: 'satSun' });
  }
  return out;
}

const cache = new Map<number, Holiday[]>();

/** 그해의 공휴일 목록 (날짜순). 같은 날 두 공휴일이 겹치면 둘 다 들어 있다 */
export function koreanHolidays(year: number): Holiday[] {
  const hit = cache.get(year);
  if (hit) return hit;
  const base = baseHolidays(year);
  const temps = TEMPORARY.filter((t) => t.date.startsWith(`${year}-`));
  const taken = new Set([...base.map((b) => b.date), ...temps.map((t) => t.date)]);
  const countOn = (date: string) => base.filter((b) => b.date === date).length + temps.filter((t) => t.date === date).length;

  // 대체공휴일이 필요한 경우 (연휴는 묶음당 한 번씩, 겹친 날 수만큼)
  const triggers: { after: string; name: string }[] = [];
  const blocks = new Map<string, Base[]>();
  for (const b of base) {
    if (b.rule === 'lunarBlock') {
      blocks.set(b.block!, [...(blocks.get(b.block!) ?? []), b]);
      continue;
    }
    const overlap = countOn(b.date) > 1;
    if (b.rule === 'satSun' && isWeekend(b.date)) triggers.push({ after: b.date, name: b.name });
    if (b.rule === 'children' && (isWeekend(b.date) || overlap)) triggers.push({ after: b.date, name: b.name });
  }
  for (const days of blocks.values()) {
    const last = days.map((d) => d.date).sort().at(-1)!;
    const main = days.find((d) => !d.name.endsWith('연휴'))!.name;
    for (const d of days) {
      if (dow(d.date) === 0 || countOn(d.date) > 1) triggers.push({ after: last, name: main });
    }
  }

  const subs: Holiday[] = [];
  for (const t of triggers.sort((a, b) => a.after.localeCompare(b.after))) {
    let d = addDays(t.after, 1);
    while (isWeekend(d) || taken.has(d)) d = addDays(d, 1);
    taken.add(d);
    subs.push({ date: d, name: `대체공휴일 (${t.name})`, kind: 'substitute' });
  }

  const list: Holiday[] = [...base.map((b) => ({ date: b.date, name: b.name, kind: 'holiday' as const })), ...temps, ...subs].sort((a, b) => a.date.localeCompare(b.date));
  cache.set(year, list);
  return list;
}

/** 그날의 공휴일 (없으면 빈 배열) */
export function holidaysOn(date: string): Holiday[] {
  return koreanHolidays(Number(date.slice(0, 4))).filter((h) => h.date === date);
}

/** 쉬는 날인지 (토·일·공휴일) */
export function isOffDay(date: string): boolean {
  return isWeekend(date) || holidaysOn(date).length > 0;
}

/** 음력 공휴일 표가 있는 해 */
export const LUNAR_YEARS = Object.keys(LUNAR).map(Number);
