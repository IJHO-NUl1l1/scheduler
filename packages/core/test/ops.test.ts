import { afterEach, describe, expect, it } from 'vitest';
import {
  addEvent,
  addTask,
  completeTask,
  deleteTask,
  moveTask,
  setGoals,
  setHeadline,
  setTaskTime,
  updateTask,
  VaultError,
  addGoal,
  setKind,
} from '../src/index.js';
import { makeVault } from './helpers.js';

const DAY = 'Daily/2026-11-24.md';
const DAILY = [
  '---',
  'date: 2026-11-24',
  'headline: 기존',
  'custom: 사용자 필드',
  '---',
  '## 할 일',
  '- [ ] 10:00-11:00 프린터 점검 🆔 a7k2m9',
  '- [ ] 학업계획서 초안 📅 2026-11-28 ⏫ 🆔 k3f9a2',
  '  - [ ] 자료 조사 🆔 k3f9b0',
  '- [ ] 손으로 쓴 할 일',
  '',
  '## 메모',
  '자유롭게 쓴 글',
  '<!-- 주석 -->',
  '',
  '## 내가 만든 섹션',
  '- 건드리면 안 됨',
  '',
].join('\n');

let ctx: Awaited<ReturnType<typeof makeVault>>;
afterEach(() => ctx?.cleanup());

/** 두 문자열에서 바뀐 줄만 뽑기 */
function changedLines(before: string, after: string): { removed: string[]; added: string[] } {
  const b = before.split('\n');
  const a = after.split('\n');
  return { removed: b.filter((l) => !a.includes(l)), added: a.filter((l) => !b.includes(l)) };
}

describe('addTask', () => {
  it('없는 Daily 파일은 기본 내용으로 만든다', async () => {
    ctx = await makeVault();
    const item = await addTask(ctx.vault, { text: '새 할 일', date: '2026-12-01', start: '9:00', end: '10:30', priority: 'high' });
    expect(item.id).toMatch(/^[a-z0-9]{6}$/);
    expect(item.time).toEqual({ start: '09:00', end: '10:30' });
    expect(await ctx.read('Daily/2026-12-01.md')).toBe(
      `---\ndate: 2026-12-01\n---\n## 할 일\n- [ ] 09:00-10:30 새 할 일 ⏫ 🆔 ${item.id}\n\n## 메모\n`,
    );
  });

  it('기존 파일에서는 할 일 섹션 끝에 한 줄만 추가', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    const item = await addTask(ctx.vault, { text: '추가', date: '2026-11-24' });
    const after = await ctx.read(DAY);
    expect(changedLines(DAILY, after)).toEqual({ removed: [], added: [`- [ ] 추가 🆔 ${item.id}`] });
    expect(after.indexOf('추가')).toBeLessThan(after.indexOf('## 메모'));
  });

  it('날짜 없으면 Inbox', async () => {
    ctx = await makeVault();
    const item = await addTask(ctx.vault, { text: '언젠가' });
    expect(item.file).toBe('Inbox.md');
    expect(await ctx.read('Inbox.md')).toBe(`## 할 일\n- [ ] 언젠가 🆔 ${item.id}\n`);
  });

  it('하위 항목으로 추가', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    const item = await addTask(ctx.vault, { text: '목차', parentRef: 'k3f9a2', start: '16:00' });
    const lines = (await ctx.read(DAY)).split('\n');
    const i = lines.indexOf('  - [ ] 자료 조사 🆔 k3f9b0');
    expect(lines[i + 1]).toBe(`  - [ ] 16:00 목차 🆔 ${item.id}`);
  });

  it('잘못된 입력은 거부', async () => {
    ctx = await makeVault();
    await expect(addTask(ctx.vault, { text: ' ' })).rejects.toThrow(VaultError);
    await expect(addTask(ctx.vault, { text: 'a', date: '2026-13-01' })).rejects.toThrow(/날짜/);
    await expect(addTask(ctx.vault, { text: 'a', start: '11:00', end: '10:00' })).rejects.toThrow(/빠름/);
  });
});

describe('줄 단위 수정', () => {
  it('completeTask는 그 줄만 바꾼다', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    await completeTask(ctx.vault, 'a7k2m9', '2026-11-24');
    expect(changedLines(DAILY, await ctx.read(DAY))).toEqual({
      removed: ['- [ ] 10:00-11:00 프린터 점검 🆔 a7k2m9'],
      added: ['- [x] 10:00-11:00 프린터 점검 🆔 a7k2m9 ✅ 2026-11-24'],
    });
    await completeTask(ctx.vault, 'a7k2m9', '2026-11-24', false);
    expect(await ctx.read(DAY)).toBe(DAILY);
  });

  it('ID 없는 항목은 수정할 때 ID가 붙는다', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    const item = await completeTask(ctx.vault, `${DAY}#L10`, '2026-11-24');
    expect(item.id).toMatch(/^[a-z0-9]{6}$/);
    expect(await ctx.read(DAY)).toContain(`- [x] 손으로 쓴 할 일 🆔 ${item.id} ✅ 2026-11-24`);
  });

  it('setTaskTime: 할당, 변경, 빼기', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    await setTaskTime(ctx.vault, 'k3f9b0', '15:00', '16:00');
    expect(await ctx.read(DAY)).toContain('  - [ ] 15:00-16:00 자료 조사 🆔 k3f9b0');
    await setTaskTime(ctx.vault, 'k3f9b0');
    expect(await ctx.read(DAY)).toBe(DAILY);
  });

  it('일정의 시간을 빼면 종일 일정', async () => {
    ctx = await makeVault();
    const ev = await addEvent(ctx.vault, { date: '2026-11-25', title: '회의', start: '14:00', end: '15:00' });
    expect(ev.kind).toBe('event');
    const after = await setTaskTime(ctx.vault, ev.ref);
    expect(after.kind).toBe('allday');
  });

  it('updateTask: 필드 추가·삭제', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    await updateTask(ctx.vault, 'k3f9a2', { due: null, priority: 'low', text: '학업계획서 완성' });
    expect(await ctx.read(DAY)).toContain('- [ ] 학업계획서 완성 🔽 🆔 k3f9a2');
  });

  it('일정은 완료 처리 불가', async () => {
    ctx = await makeVault();
    const ev = await addEvent(ctx.vault, { date: '2026-11-25', title: '회의', start: '14:00' });
    await expect(completeTask(ctx.vault, ev.ref, '2026-11-25')).rejects.toThrow(/체크박스/);
  });

  it('frontmatter와 모르는 섹션 보존', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    await setHeadline(ctx.vault, '2026-11-24', '새: 헤드라인');
    const after = await ctx.read(DAY);
    expect(changedLines(DAILY, after)).toEqual({ removed: ['headline: 기존'], added: ['headline: "새: 헤드라인"'] });
    await setHeadline(ctx.vault, '2026-11-24', null);
    expect(await ctx.read(DAY)).not.toContain('headline');
    expect(await ctx.read(DAY)).toContain('custom: 사용자 필드');
  });

  it('CRLF 파일은 CRLF로 저장', async () => {
    ctx = await makeVault({ 'Inbox.md': '## 할 일\r\n- [ ] a 🆔 aaaaaa\r\n' });
    await completeTask(ctx.vault, 'aaaaaa', '2026-11-24');
    expect(await ctx.read('Inbox.md')).toBe('## 할 일\r\n- [x] a 🆔 aaaaaa ✅ 2026-11-24\r\n');
  });
});

describe('moveTask / deleteTask', () => {
  it('하위 항목까지 다른 날짜로 옮긴다', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    const moved = await moveTask(ctx.vault, 'k3f9a2', '2026-11-25');
    expect(moved.file).toBe('Daily/2026-11-25.md');
    const target = await ctx.read('Daily/2026-11-25.md');
    expect(target).toContain('- [ ] 학업계획서 초안 📅 2026-11-28 ⏫ 🆔 k3f9a2\n  - [ ] 자료 조사 🆔 k3f9b0');
    const src = await ctx.read(DAY);
    expect(src).not.toContain('학업계획서');
    expect(src).not.toContain('자료 조사');
  });

  it('하위 항목을 Inbox로 옮기면 최상위가 된다', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    await moveTask(ctx.vault, 'k3f9b0');
    expect(await ctx.read('Inbox.md')).toBe('## 할 일\n- [ ] 자료 조사 🆔 k3f9b0\n');
  });

  it('같은 파일 안 하위 항목을 최상위로', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    const item = await moveTask(ctx.vault, 'k3f9b0', '2026-11-24');
    expect(item.parentLine).toBeUndefined();
    expect(item.indent).toBe('');
  });

  it('deleteTask는 하위 항목까지 지운다', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    await deleteTask(ctx.vault, 'k3f9a2');
    expect(changedLines(DAILY, await ctx.read(DAY)).removed).toEqual([
      '- [ ] 학업계획서 초안 📅 2026-11-28 ⏫ 🆔 k3f9a2',
      '  - [ ] 자료 조사 🆔 k3f9b0',
    ]);
  });

  it('없는 ID는 오류', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    await expect(deleteTask(ctx.vault, 'zzzzzz')).rejects.toThrow(/찾지 못함/);
  });
});

describe('setGoals', () => {
  it('같은 목표는 상태·ID 유지, 새 목표는 추가, 빠진 목표는 삭제', async () => {
    const MONTH = 'Monthly/2026-11.md';
    ctx = await makeVault({
      [MONTH]: '---\nmonth: 2026-11\n---\n## 목표\n이번 달 방향 메모\n- [x] 시안 확정 🆔 m9q4z8 ✅ 2026-11-20\n- [ ] 버릴 목표 🆔 m0000a\n\n## 메모\n',
    });
    const goals = await setGoals(ctx.vault, '2026-11', ['시안 확정', '학업계획서 제출']);
    expect(goals.map((g) => [g.text, g.done])).toEqual([
      ['시안 확정', true],
      ['학업계획서 제출', false],
    ]);
    const after = await ctx.read(MONTH);
    expect(after).toContain('이번 달 방향 메모\n- [x] 시안 확정 🆔 m9q4z8 ✅ 2026-11-20\n- [ ] 학업계획서 제출 🆔');
    expect(after).not.toContain('버릴 목표');
  });
});

describe('setKind / addGoal', () => {
  it('할 일 ↔ 일정 ↔ 종일', async () => {
    ctx = await makeVault({ [DAY]: DAILY });
    expect((await setKind(ctx.vault, 'a7k2m9', 'event')).kind).toBe('event');
    expect(await ctx.read(DAY)).toContain('- 10:00-11:00 프린터 점검 🆔 a7k2m9');
    expect((await setKind(ctx.vault, 'a7k2m9', 'task')).kind).toBe('task');
    expect(await ctx.read(DAY)).toBe(DAILY);
    // 시간 없는 할 일을 일정으로 → 종일
    const it = await setKind(ctx.vault, 'k3f9b0', 'event');
    expect(it.kind).toBe('allday');
    expect(await ctx.read(DAY)).toContain('  - 종일 자료 조사 🆔 k3f9b0');
  });

  it('목표 추가 (파일 없으면 만듦)', async () => {
    ctx = await makeVault();
    const g = await addGoal(ctx.vault, '2026-12', '연말 정산');
    expect(g.section).toBe('목표');
    expect(await ctx.read('Monthly/2026-12.md')).toBe(`---\nmonth: 2026-12\n---\n## 목표\n- [ ] 연말 정산 🆔 ${g.id}\n\n## 메모\n`);
    await expect(addGoal(ctx.vault, '26-1', 'x')).rejects.toThrow(/기간/);
  });
});
