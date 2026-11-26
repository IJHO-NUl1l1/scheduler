import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Vault } from '@scheduler/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

let root: string;
let client: Client;

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as { type: string; text: string }[];
  return { text: content.map((c) => c.text).join('\n'), isError: res.isError === true };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'planner-mcp-'));
  const server = createServer(new Vault(root), { now: () => new Date(2026, 10, 24, 14, 20), dayEnd: '18:00' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
});

afterEach(async () => {
  await client.close();
  await rm(root, { recursive: true, force: true });
});

describe('planner MCP', () => {
  it('도구 목록', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_event',
        'add_task',
        'add_tasks',
        'complete_task',
        'delete_task',
        'get_day',
        'get_inbox',
        'get_month_summary',
        'get_now',
        'get_range',
        'get_today',
        'get_year_goals',
        'move_task',
        'search_tasks',
        'set_goals',
        'set_headline',
        'set_task_time',
        'update_task',
      ].sort(),
    );
  });

  it('추가 → 조회 → 시간 할당 → 완료 흐름이 파일에 반영된다', async () => {
    const added = await call('add_task', { text: '자료 조사', date: '2026-11-24', priority: 'high' });
    expect(added.isError).toBe(false);
    const id = /ref: ([a-z0-9]{6})/.exec(added.text)?.[1];
    expect(id).toBeDefined();

    await call('add_event', { date: '2026-11-24', title: '회의', start: '16:00', end: '17:00' });
    await call('set_task_time', { ref: id, start: '14:00', end: '15:00' });

    const today = await call('get_today');
    expect(today.text).toContain('14:00-15:00 자료 조사');
    expect(today.text).toContain('진행 중');
    expect(today.text).toContain('(일정) 회의');

    const now = await call('get_now');
    expect(now.text).toContain('다음: 16:00-17:00 (일정) 회의');
    expect(now.text).toContain('빈 시간: 15:00-16:00(60분), 17:00-18:00(60분)');

    await call('complete_task', { ref: id });
    const file = await readFile(path.join(root, 'Daily/2026-11-24.md'), 'utf8');
    expect(file).toContain(`- [x] 14:00-15:00 자료 조사 ⏫ 🆔 ${id} ✅ 2026-11-24`);
  });

  it('목표와 월 요약', async () => {
    await call('set_goals', { period: '2026-11', goals: ['학업계획서 제출', '시안 확정'] });
    await call('set_headline', { date: '2026-11-24', text: '게시판 시안' });
    const month = await call('get_month_summary', {});
    expect(month.text).toContain('목표 0/2 (0%)');
    expect(month.text).toContain('2026-11-24 게시판 시안');
  });

  it('add_tasks: 여러 개를 한 번에, 실패는 개별 보고', async () => {
    const r = await call('add_tasks', {
      items: [
        { text: '보고서', date: '2026-11-26', start: '10:00', end: '11:00' },
        { text: '회의', date: '2026-11-26', start: '14:00', event: true },
        { text: '날짜 없는 일정', event: true },
      ],
    });
    expect(r.text.split('\n')).toHaveLength(3);
    expect(r.text).toContain('실패: 날짜 없는 일정');
    const file = await readFile(path.join(root, 'Daily/2026-11-26.md'), 'utf8');
    expect(file).toMatch(/- \[ \] 10:00-11:00 보고서 🆔 \w{6}\n- 14:00 회의 🆔 \w{6}/u);
  });

  it('오류는 isError와 문장으로', async () => {
    const r = await call('complete_task', { ref: 'zzzzzz' });
    expect(r).toEqual({ text: '항목을 찾지 못함: zzzzzz', isError: true });
  });

  it('형식 리소스와 프롬프트', async () => {
    const res = await client.readResource({ uri: 'planner://format' });
    expect((res.contents[0] as { text: string }).text).toContain('# 플래너 볼트 형식');
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['plan-month', 'weekly-review']);
  });
});
