import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '../src/index.js';

const TODAY = '2026-11-25'; // 수요일

describe('parseQuickAdd', () => {
  it.each([
    ['서류 검토', { kind: 'task', text: '서류 검토', date: TODAY }],
    ['15:00-16:00 서류 검토', { text: '서류 검토', start: '15:00', end: '16:00' }],
    ['내일 오후 3시 회의 @', { kind: 'event', text: '회의', date: '2026-11-26', start: '15:00' }],
    ['오후 3시-4시 반 검토', { start: '15:00', end: '16:30' }],
    ['9시 반 스탠드업', { start: '09:30', text: '스탠드업' }],
    ['금요일 보고서 ~11/28 !', { date: '2026-11-27', due: '2026-11-28', priority: 'high', text: '보고서' }],
    ['수요일 주간회의', { date: '2026-12-02' }],
    ['인박스 언젠가 읽을 책', { date: null, text: '언젠가 읽을 책' }],
    ['12/3 10:00 치과 !!', { date: '2026-12-03', start: '10:00', priority: 'highest', text: '치과' }],
    ['1/5 신년 계획', { date: '2027-01-05' }],
    ['마감 2026-12-01 정산', { due: '2026-12-01', text: '정산' }],
  ])('%s', (input, expected) => {
    expect(parseQuickAdd(input, TODAY)).toMatchObject(expected);
  });

  it('잘못된 시간 범위는 본문으로 둔다', () => {
    expect(parseQuickAdd('16:00-15:00 이상함', TODAY)).toMatchObject({ text: '16:00-15:00 이상함' });
    expect(parseQuickAdd('16:00-15:00 이상함', TODAY).start).toBeUndefined();
  });

  it('기본 날짜를 Inbox로', () => {
    expect(parseQuickAdd('할 일', TODAY, null).date).toBeNull();
  });
});
