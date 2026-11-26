import { describe, expect, it } from 'vitest';
import { holidaysOn, isOffDay, koreanHolidays } from '../src/index.js';

const subs = (year: number) => koreanHolidays(year).filter((h) => h.kind === 'substitute').map((h) => `${h.date} ${h.name}`);

describe('한국 공휴일', () => {
  it('2024 대체공휴일: 설날(일요일), 어린이날(일요일)', () => {
    expect(subs(2024)).toEqual(['2024-02-12 대체공휴일 (설날)', '2024-05-06 대체공휴일 (어린이날)']);
  });

  it('2025 대체공휴일: 삼일절(토), 어린이날·부처님오신날 겹침, 추석(일요일)', () => {
    expect(subs(2025)).toEqual(['2025-03-03 대체공휴일 (삼일절)', '2025-05-06 대체공휴일 (어린이날)', '2025-10-08 대체공휴일 (추석)']);
  });

  it('2026 대체공휴일: 삼일절(일), 부처님오신날(일), 광복절(토), 개천절(토)', () => {
    expect(subs(2026)).toEqual([
      '2026-03-02 대체공휴일 (삼일절)',
      '2026-05-25 대체공휴일 (부처님오신날)',
      '2026-08-17 대체공휴일 (광복절)',
      '2026-10-05 대체공휴일 (개천절)',
    ]);
  });

  it('2026 설·추석 연휴와 지방선거', () => {
    const names = (d: string) => holidaysOn(d).map((h) => h.name);
    expect(names('2026-02-16')).toEqual(['설날 연휴']);
    expect(names('2026-02-17')).toEqual(['설날']);
    expect(names('2026-02-18')).toEqual(['설날 연휴']);
    expect(names('2026-09-25')).toEqual(['추석']);
    expect(names('2026-06-03')).toEqual(['전국동시지방선거일']);
  });

  it('2028 추석과 개천절이 겹치면 대체공휴일', () => {
    expect(holidaysOn('2028-10-03').map((h) => h.name).sort()).toEqual(['개천절', '추석']);
    expect(subs(2028)).toContain('2028-10-05 대체공휴일 (추석)');
  });

  it('쉬는 날 판단', () => {
    expect(isOffDay('2026-11-25')).toBe(false); // 수요일
    expect(isOffDay('2026-11-28')).toBe(true); // 토요일
    expect(isOffDay('2026-12-25')).toBe(true); // 성탄절
  });

  it('표에 없는 해는 양력 공휴일만', () => {
    const names = koreanHolidays(2040).map((h) => h.name);
    expect(names).toContain('광복절');
    expect(names).not.toContain('추석');
  });
});
