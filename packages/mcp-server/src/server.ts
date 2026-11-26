import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  Vault,
  VaultError,
  addDays,
  addEvent,
  addTask,
  completeTask,
  deleteTask,
  getDay,
  getInbox,
  getMonthSummary,
  getNow,
  getRange,
  getToday,
  goalProgress,
  moveTask,
  searchTasks,
  setGoals,
  setHeadline,
  setTaskTime,
  toDateString,
  toMonthString,
  updateTask,
  yearlyPath,
  type Priority,
  renderDay,
  renderGoalsFor,
  renderItem,
  renderList,
  renderMonth,
  renderNow,
  renderToday,
} from '@scheduler/core';
import { FORMAT_GUIDE } from './guide.js';


export interface ServerOptions {
  /** 테스트용 시계 */
  now?: () => Date;
  /** get_now의 하루 끝 시각 (빈 시간 계산용) */
  dayEnd?: string;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const time = z.string().regex(/^\d{1,2}:\d{2}$/, 'HH:mm');
const priority = z.enum(['highest', 'high', 'medium', 'low', 'lowest']);
const ref = z.string().min(1).describe('조회 결과에 나온 ref 값 (🆔 또는 파일#L줄)');

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });

/** 도구 오류를 Claude에게 문장으로 돌려준다 */
async function run(fn: () => Promise<string>): Promise<CallToolResult> {
  try {
    return text(await fn());
  } catch (e) {
    const msg = e instanceof VaultError ? e.message : `처리 중 오류: ${(e as Error).message}`;
    return { content: [{ type: 'text', text: msg }], isError: true };
  }
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function createServer(vault: Vault, opts: ServerOptions = {}): McpServer {
  const now = opts.now ?? (() => new Date());
  const today = () => toDateString(now());

  const server = new McpServer(
    { name: 'planner', version: '0.1.0' },
    {
      instructions:
        '사용자의 플래너(.md 볼트)를 다루는 도구. 처음에는 get_today로 오늘 상황을 본다. ' +
        '수정할 때는 조회 결과의 ref를 쓴다. 형식과 원칙은 planner://format 리소스 참고.',
    },
  );

  // ── 조회 ─────────────────────────────────────────────

  server.registerTool(
    'get_today',
    {
      title: '오늘 보기',
      description: '오늘 전체 목록(현재 시각 기준 상태 포함), 밀린 할 일, 앞으로 7일 마감.',
      inputSchema: {},
      annotations: READ,
    },
    () => run(async () => renderToday(await getToday(vault, now()))),
  );

  server.registerTool(
    'get_now',
    {
      title: '지금 할 일',
      description: '진행 중인 항목, 다음 항목, 시간 지난 미완료, 시간 없는 미완료, 남은 빈 시간.',
      inputSchema: {},
      annotations: READ,
    },
    () => run(async () => renderNow(await getNow(vault, now(), opts.dayEnd ? { dayEnd: opts.dayEnd } : {}))),
  );

  server.registerTool(
    'get_day',
    {
      title: '하루 보기',
      description: '특정 날짜의 headline, 전체 항목, 메모.',
      inputSchema: { date },
      annotations: READ,
    },
    ({ date: d }) => run(async () => renderDay(await getDay(vault, d))),
  );

  server.registerTool(
    'get_range',
    {
      title: '기간 보기',
      description: '기간 안의 날짜별 항목 (기록이 있는 날만). 최대 62일.',
      inputSchema: { from: date, to: date },
      annotations: READ,
    },
    ({ from, to }) =>
      run(async () => {
        if (to < from) throw new VaultError('to가 from보다 빠름');
        if (addDays(from, 62) < to) throw new VaultError('기간은 최대 62일');
        const days = await getRange(vault, from, to);
        return days.length ? days.map(renderDay).join('\n\n') : `${from} ~ ${to}: 기록 없음`;
      }),
  );

  server.registerTool(
    'get_month_summary',
    {
      title: '월 요약',
      description: '월 목표와 달성률, 날짜별 headline과 할 일 수, 이번 달 마감 미완료.',
      inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM').optional().describe('없으면 이번 달') },
      annotations: READ,
    },
    ({ month }) => run(async () => renderMonth(await getMonthSummary(vault, month ?? toMonthString(now())))),
  );

  server.registerTool(
    'get_year_goals',
    {
      title: '연간 목표',
      description: '연 목표와 달성률.',
      inputSchema: { year: z.string().regex(/^\d{4}$/).optional().describe('없으면 올해') },
      annotations: READ,
    },
    ({ year }) =>
      run(async () => {
        const y = year ?? String(now().getFullYear());
        return renderGoalsFor(y, goalProgress(await vault.readDoc(yearlyPath(y))));
      }),
  );

  server.registerTool(
    'get_inbox',
    {
      title: 'Inbox 보기',
      description: '날짜가 정해지지 않은 할 일.',
      inputSchema: { includeDone: z.boolean().optional() },
      annotations: READ,
    },
    ({ includeDone }) =>
      run(async () => {
        const items = (await getInbox(vault)).filter((i) => includeDone || !(i.kind === 'task' && i.done));
        return renderList('Inbox', items, false);
      }),
  );

  server.registerTool(
    'search_tasks',
    {
      title: '할 일 검색',
      description: '볼트 전체에서 조건에 맞는 할 일 검색.',
      inputSchema: {
        query: z.string().optional().describe('본문 포함 문자열'),
        status: z.enum(['open', 'done', 'all']).optional().describe('기본 open'),
        dueBefore: date.optional(),
        dueAfter: date.optional(),
        priority: priority.optional(),
        from: date.optional().describe('Daily 날짜 범위 시작'),
        to: date.optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional().describe('기본 50'),
      },
      annotations: READ,
    },
    (args) =>
      run(async () => {
        const filter = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
        const items = await searchTasks(vault, { limit: 50, ...filter });
        return renderList('검색 결과', items);
      }),
  );

  // ── 수정 ─────────────────────────────────────────────

  server.registerTool(
    'add_task',
    {
      title: '할 일 추가',
      description: '할 일 추가. date가 없으면 Inbox. start/end를 주면 타임라인에 표시. parentRef를 주면 그 할 일의 하위 항목.',
      inputSchema: {
        text: z.string().min(1),
        date: date.optional(),
        start: time.optional(),
        end: time.optional(),
        due: date.optional(),
        scheduled: date.optional(),
        priority: priority.optional(),
        parentRef: ref.optional(),
      },
      annotations: WRITE,
    },
    (args) =>
      run(async () => {
        const input = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)) as typeof args;
        const item = await addTask(vault, input as Parameters<typeof addTask>[1]);
        return `추가함: ${renderItem(item, { showFile: true }).slice(2)}`;
      }),
  );

  const taskItem = z.object({
    text: z.string().min(1),
    date: date.optional(),
    start: time.optional(),
    end: time.optional(),
    due: date.optional(),
    priority: priority.optional(),
    event: z.boolean().optional().describe('true면 체크박스 없는 일정 (date 필요)'),
  });

  server.registerTool(
    'add_tasks',
    {
      title: '여러 개 한 번에 추가',
      description: '할 일·일정 여러 개를 한 번의 호출로 추가. 계획을 반영할 때는 add_task를 반복하지 말고 이걸 쓴다.',
      inputSchema: { items: z.array(taskItem).min(1).max(50) },
      annotations: WRITE,
    },
    ({ items }) =>
      run(async () => {
        const lines: string[] = [];
        for (const it of items) {
          try {
            if (it.event) {
              if (!it.date) throw new VaultError('일정에는 date가 필요');
              const ev: Parameters<typeof addEvent>[1] = { date: it.date, title: it.text };
              if (it.start) ev.start = it.start;
              if (it.end) ev.end = it.end;
              lines.push(`추가함: ${renderItem(await addEvent(vault, ev), { showFile: true }).slice(2)}`);
            } else {
              const { event: _e, ...rest } = it;
              const input = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as typeof rest;
              lines.push(`추가함: ${renderItem(await addTask(vault, input as Parameters<typeof addTask>[1]), { showFile: true }).slice(2)}`);
            }
          } catch (e) {
            lines.push(`실패: ${it.text} — ${(e as Error).message}`);
          }
        }
        return lines.join('\n');
      }),
  );

  server.registerTool(
    'add_event',
    {
      title: '일정 추가',
      description: '체크박스 없는 일정(회의 등) 추가. start가 없으면 종일 일정.',
      inputSchema: { date, title: z.string().min(1), start: time.optional(), end: time.optional() },
      annotations: WRITE,
    },
    (args) =>
      run(async () => {
        const input: Parameters<typeof addEvent>[1] = { date: args.date, title: args.title };
        if (args.start) input.start = args.start;
        if (args.end) input.end = args.end;
        const item = await addEvent(vault, input);
        return `추가함: ${renderItem(item, { showFile: true }).slice(2)}`;
      }),
  );

  server.registerTool(
    'update_task',
    {
      title: '할 일 수정',
      description: '내용, 마감, 예정일, 우선순위 수정. null을 주면 그 값을 지운다.',
      inputSchema: {
        ref,
        text: z.string().min(1).optional(),
        due: date.nullable().optional(),
        scheduled: date.nullable().optional(),
        priority: priority.nullable().optional(),
      },
      annotations: WRITE,
    },
    ({ ref: r, ...patch }) =>
      run(async () => {
        const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as {
          text?: string;
          due?: string | null;
          scheduled?: string | null;
          priority?: Priority | null;
        };
        const item = await updateTask(vault, r, clean);
        return `수정함: ${renderItem(item, { showFile: true }).slice(2)}`;
      }),
  );

  server.registerTool(
    'set_task_time',
    {
      title: '시간 할당',
      description: '할 일·일정의 시간을 정하거나 바꾼다. start를 비우면 시간을 뺀다(타임라인에서 빠지고 목록에는 남음).',
      inputSchema: { ref, start: time.optional(), end: time.optional() },
      annotations: WRITE,
    },
    ({ ref: r, start, end }) =>
      run(async () => {
        const item = await setTaskTime(vault, r, start, end);
        return `시간 변경함: ${renderItem(item, { showFile: true }).slice(2)}`;
      }),
  );

  server.registerTool(
    'complete_task',
    {
      title: '완료 처리',
      description: '할 일을 완료(또는 done=false로 완료 취소). 완료일은 오늘.',
      inputSchema: { ref, done: z.boolean().optional().describe('기본 true') },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ ref: r, done }) =>
      run(async () => {
        const item = await completeTask(vault, r, today(), done ?? true);
        return `${item.done ? '완료함' : '완료 취소함'}: ${renderItem(item, { showFile: true }).slice(2)}`;
      }),
  );

  server.registerTool(
    'move_task',
    {
      title: '날짜 옮기기',
      description: '할 일을 하위 항목째 다른 날짜로 옮긴다. toDate가 없으면 Inbox로.',
      inputSchema: { ref, toDate: date.optional() },
      annotations: WRITE,
    },
    ({ ref: r, toDate }) =>
      run(async () => {
        const item = await moveTask(vault, r, toDate);
        return `옮김: ${renderItem(item, { showFile: true }).slice(2)}`;
      }),
  );

  server.registerTool(
    'delete_task',
    {
      title: '삭제',
      description: '항목을 하위 항목째 삭제. 되돌릴 수 없으니 사용자가 요청했을 때만.',
      inputSchema: { ref },
      annotations: { ...WRITE, destructiveHint: true },
    },
    ({ ref: r }) =>
      run(async () => {
        const found = await vault.findItem(r);
        if (!found) throw new VaultError(`항목을 찾지 못함: ${r}`);
        await deleteTask(vault, r);
        return `삭제함: ${found.item.text}`;
      }),
  );

  server.registerTool(
    'set_headline',
    {
      title: '헤드라인 설정',
      description: '그날의 한 줄 요약 (월 달력에 표시). text를 비우면 지운다.',
      inputSchema: { date, text: z.string().optional() },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ date: d, text: t }) =>
      run(async () => {
        await setHeadline(vault, d, t ?? null);
        return t ? `${d} headline: ${t}` : `${d} headline 지움`;
      }),
  );

  server.registerTool(
    'set_goals',
    {
      title: '목표 설정',
      description: '연(YYYY) 또는 월(YYYY-MM) 목표 목록을 통째로 정한다. 같은 내용의 기존 목표는 완료 상태가 유지되고, 목록에 없는 목표는 지워진다.',
      inputSchema: { period: z.string().regex(/^\d{4}(-\d{2})?$/), goals: z.array(z.string().min(1)).max(30) },
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
    },
    ({ period, goals }) =>
      run(async () => {
        const items = await setGoals(vault, period, goals);
        return renderList(`${period} 목표`, items, false);
      }),
  );

  // ── 리소스 / 프롬프트 ────────────────────────────────

  server.registerResource(
    'format',
    'planner://format',
    { title: '볼트 형식과 도구 사용 원칙', mimeType: 'text/markdown' },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: FORMAT_GUIDE }] }),
  );

  server.registerPrompt(
    'weekly-review',
    { title: '주간 정리', description: '지난주 정리와 이번 주 계획' },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `오늘은 ${today()}야. 지난 7일(${addDays(today(), -7)} ~ ${addDays(today(), -1)})을 get_range로 보고 ` +
              '완료한 것과 못 한 것을 정리해줘. 그다음 get_today와 get_month_summary를 보고 이번 주 계획안을 제안해줘. ' +
              '밀린 할 일은 하나씩 오늘로/다른 날/Inbox/삭제 중 무엇이 좋을지 추천하고, 내가 확인한 다음에만 수정 도구를 써.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'plan-month',
    {
      title: '월 계획',
      description: '월 목표와 주요 일정 계획',
      argsSchema: { month: z.string().optional().describe('YYYY-MM, 없으면 다음 달') },
    },
    ({ month }) => {
      const d = now();
      const target = month ?? toMonthString(new Date(d.getFullYear(), d.getMonth() + 1, 1));
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `${target} 계획을 같이 세우자. get_year_goals와 get_month_summary(${target})로 현재 상태를 보고, ` +
                '나에게 이번 달에 꼭 해야 할 일을 몇 가지 물어본 뒤 월 목표 3~5개와 주요 마감 일정을 제안해줘. ' +
                '내가 확정하면 set_goals와 add_task로 반영해.',
            },
          },
        ],
      };
    },
  );

  return server;
}
