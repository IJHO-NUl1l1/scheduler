import { describe, expect, it } from 'vitest';
import { formatLine, parseLine } from '../src/index.js';

describe('parseLine', () => {
  it('시간 없는 할 일 + 기호', () => {
    const p = parseLine('- [ ] 학업계획서 초안 📅 2026-11-28 ⏫ 🆔 k3f9a2');
    expect(p).toMatchObject({ kind: 'task', done: false, text: '학업계획서 초안', due: '2026-11-28', priority: 'high', id: 'k3f9a2' });
    expect(p?.time).toBeUndefined();
  });

  it('시간 범위 있는 할 일', () => {
    const p = parseLine('- [ ] 10:00-11:00 프린터 점검 🆔 a7k2m9');
    expect(p).toMatchObject({ kind: 'task', time: { start: '10:00', end: '11:00' }, text: '프린터 점검' });
  });

  it('공백 있는 시간 범위와 한 자리 시', () => {
    expect(parseLine('- [ ] 9:30 - 10:00 스탠드업')?.time).toEqual({ start: '09:30', end: '10:00' });
  });

  it('체크박스 없는 일정', () => {
    expect(parseLine('- 14:00 회의')).toMatchObject({ kind: 'event', time: { start: '14:00' }, text: '회의' });
  });

  it('종일 일정', () => {
    expect(parseLine('- 종일 연차')).toMatchObject({ kind: 'allday', text: '연차' });
  });

  it('완료 + 완료일', () => {
    expect(parseLine('- [x] 네트워크 장애 보고 🆔 p01c7d ✅ 2026-11-24')).toMatchObject({ done: true, doneDate: '2026-11-24' });
  });

  it('반복 규칙과 태그', () => {
    const p = parseLine('- [ ] 주간 보고 #업무 🔁 every week 📅 2026-11-27');
    expect(p).toMatchObject({ recurrence: 'every week', due: '2026-11-27', text: '주간 보고 #업무', tags: ['업무'] });
  });

  it('체크박스·시간 없는 글머리는 note', () => {
    expect(parseLine('- 그냥 메모')?.kind).toBe('note');
  });

  it('목록이 아니면 null', () => {
    expect(parseLine('## 할 일')).toBeNull();
    expect(parseLine('일반 문장')).toBeNull();
  });

  it('잘못된 시간은 본문으로 둔다', () => {
    expect(parseLine('- [ ] 25:99 이상한 시간')).toMatchObject({ text: '25:99 이상한 시간' });
  });

  it('들여쓰기 보존', () => {
    expect(parseLine('  - [ ] 하위')?.indent).toBe('  ');
  });
});

describe('formatLine 왕복', () => {
  const canonical = [
    '- [ ] 10:00-11:00 프린터 점검 🆔 a7k2m9',
    '- 14:00-15:00 회의 🆔 c4n8q1',
    '- 종일 연차',
    '- [ ] 학업계획서 초안 ⏫ 📅 2026-11-28 🆔 k3f9a2',
    '  - [ ] 16:00 자료 조사 🆔 k3f9b0',
    '- [x] 네트워크 장애 보고 🆔 p01c7d ✅ 2026-11-24',
    '- [ ] 주간 보고 🔼 🔁 every week ⏳ 2026-11-26 📅 2026-11-27',
  ];
  for (const line of canonical) {
    it(line, () => expect(formatLine(parseLine(line)!)).toBe(line));
  }
});
