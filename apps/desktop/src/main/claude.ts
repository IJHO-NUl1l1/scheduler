import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getToday, renderToday, toDateString, type Vault } from '@scheduler/core';
import type { ChatEvent, ChatMode, ClaudeStatus, TurnUsage, UsageSummary } from '../shared/api';
import { dataDir, loadSettings } from './settings';

/**
 * 앱 내장 채팅: 설치된 Claude Code(claude -p)를 실행한다. (docs/PLAN.md 10장)
 *
 * 토큰 절약 (docs/token-strategy.md)
 *  1. 기본 Claude Code 시스템 프롬프트(약 2.7만 토큰) 대신 짧은 플래너 전용 프롬프트
 *  2. 기본 내장 도구·스킬·사용자 설정·다른 MCP 끔 → planner 도구만 남김
 *  3. 시스템 프롬프트는 글자 하나 안 바뀌게 고정 (날짜·상태는 넣지 않음) → 프롬프트 캐시 재사용
 *  4. 오늘 상황을 앱이 미리 넣어줌 → 조회 왕복 1회 절약. 바뀌었을 때만 다시 넣음
 *  5. 모드별 모델·effort: 빠른(sonnet, low) / 계획(opus, high)
 *  6. 대화가 길어지면(턴 수) 새 대화로 → 매 턴 다시 보내는 기록이 커지는 것 방지
 *  7. 답은 짧게, 수정 후 재조회 금지, 여러 개는 add_tasks 한 번으로
 */

export const SYSTEM_PROMPT = [
  '너는 Claude다. 사용자의 플래너 앱 안에서 대화하고 있다.',
  '연결 방식: 이 앱은 사용자의 Claude Code 구독 로그인으로 Claude Code(claude -p)를 실행한다. API 키 과금이 아니고, 사용량은 사용자의 Claude 구독 한도에서 나간다. 토큰을 아끼려고 짧은 전용 시스템 프롬프트와 planner 도구만 쓰고, 대화는 8턴마다 새로 시작한다.',
  '플래너와 상관없는 질문(일반 지식, 업무 상담, 글쓰기, 잡담, Claude나 토큰에 대한 질문 등)도 평소처럼 성실하게 답한다. 범위 밖이라고 거절하지 않는다.',
  '플래너 데이터(일정·할 일·목표)는 planner 도구로만 읽고 쓴다.',
  '플래너 작업 규칙:',
  '- 메시지의 <현재 상태>는 방금 앱이 조회한 최신 정보다. 이미 있는 정보를 다시 조회하지 않는다.',
  '- 수정은 조회 결과의 ref를 쓴다. 날짜 YYYY-MM-DD, 시간 HH:mm(24시간).',
  '- 여러 개를 추가할 때는 add_task를 반복하지 말고 add_tasks 한 번으로.',
  '- 수정한 뒤 확인용 재조회를 하지 않는다. 도구 결과로 충분하다.',
  '- 회의처럼 완료 개념이 없는 건 일정(event)으로, 나머지는 할 일로.',
  '- 큰 재계획(여러 날, 5개 이상 변경)은 먼저 변경안을 보여주고 확인받는다.',
  '- 지난 미완료 할 일을 임의로 옮기지 않는다.',
  '- 플래너를 수정했을 때는 한 일과 결과만 짧게 말한다.',
  '답은 한국어로, 인사나 같은 말 반복 없이. 그 밖의 질문은 필요한 만큼 답한다.',
].join('\n');

interface ModeConfig {
  model: string;
  effort: 'low' | 'medium' | 'high';
}

function modeConfig(mode: ChatMode): ModeConfig {
  const s = loadSettings();
  return mode === 'plan' ? { model: s.planModel, effort: 'high' } : { model: s.quickModel, effort: 'low' };
}

/** claude.exe 찾기. npm 설치(.cmd 래퍼)와 네이티브 설치 둘 다 */
export function findClaude(): string | undefined {
  const override = loadSettings().claudePath;
  if (override && existsSync(override)) return override;
  const candidates: string[] = [];
  const appData = process.env['APPDATA'];
  const home = process.env['USERPROFILE'] ?? process.env['HOME'];
  if (appData) candidates.push(path.join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));
  if (home) candidates.push(path.join(home, '.local', 'bin', 'claude.exe'), path.join(home, '.claude', 'local', 'claude.exe'));
  for (const c of candidates) if (existsSync(c)) return c;
  // PATH에서 찾기
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  for (const line of (where.stdout ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (line.endsWith('.exe') && existsSync(line)) return line;
    if (line.endsWith('.cmd')) {
      const exe = path.join(path.dirname(line), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

export function claudeVersion(exe: string): string | undefined {
  const r = spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 15000 });
  return r.stdout?.trim().split(/\s+/)[0] || undefined;
}

/** 우리 MCP 서버 실행 설정. Electron 실행 파일을 Node로 써서 별도 Node 설치가 필요 없다 */
function writeMcpConfig(vaultRoot: string, mcpEntry: string): string {
  const file = path.join(dataDir(), 'planner-mcp.json');
  const config = {
    mcpServers: {
      planner: {
        command: process.execPath,
        args: [mcpEntry],
        env: { ELECTRON_RUN_AS_NODE: '1', PLANNER_VAULT: vaultRoot, PLANNER_DAY_END: loadSettings().dayEnd },
      },
    },
  };
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
  return file;
}

interface UsageRecord extends TurnUsage {
  at: string;
  mode: ChatMode;
}

const usageFile = () => path.join(dataDir(), 'usage.jsonl');

function shortJson(v: unknown, max = 80): string {
  const s = JSON.stringify(v ?? {});
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export class ClaudeChat {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private sessionId: string | null = null;
  private sessionTurns = 0;
  private lastActivity = 0;
  private lastContext = 0;
  /** 마지막으로 Claude에게 상태를 넣어준 뒤 볼트가 바뀌었는지 */
  private stateDirty = true;
  status: ClaudeStatus = { installed: false };

  constructor(
    private readonly getVault: () => Vault | null,
    private readonly mcpEntry: string,
    private readonly emit: (e: ChatEvent) => void,
  ) {}

  checkInstall(): ClaudeStatus {
    const exe = findClaude();
    const prev = this.status.loggedIn;
    this.status = exe ? { installed: true, path: exe, ...(claudeVersion(exe) ? { version: claudeVersion(exe)! } : {}) } : { installed: false };
    if (prev !== undefined) this.status.loggedIn = prev;
    return this.status;
  }

  /** 볼트가 바뀌면 다음 메시지에 상태를 다시 넣는다 */
  markDirty(): void {
    this.stateDirty = true;
  }

  reset(reason = '새 대화'): void {
    this.cancel();
    this.sessionId = null;
    this.sessionTurns = 0;
    this.stateDirty = true;
    this.lastContext = 0;
    this.emit({ type: 'reset', reason });
  }

  cancel(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  get busy(): boolean {
    return this.proc !== null;
  }

  async send(text: string, mode: ChatMode): Promise<void> {
    const id = randomUUID();
    const vault = this.getVault();
    if (!vault) return this.emit({ type: 'error', id, kind: 'other', message: '볼트가 열려 있지 않음' });
    if (this.proc) return this.emit({ type: 'error', id, kind: 'other', message: '이전 요청을 처리 중' });
    const exe = this.status.path ?? this.checkInstall().path;
    if (!exe) return this.emit({ type: 'error', id, kind: 'missing', message: 'Claude Code가 설치돼 있지 않음' });

    // 6. 긴 대화·오래 쉰 대화는 새로 시작
    const s = loadSettings();
    const idle = Date.now() - this.lastActivity > 30 * 60_000;
    if (this.sessionId && (this.sessionTurns >= s.maxSessionTurns || idle)) {
      this.reset(idle ? '30분 이상 지나서 새 대화로 시작' : `${s.maxSessionTurns}턴을 넘어서 새 대화로 시작 (토큰 절약)`);
    }

    // 4. 상태 미리 넣기 (첫 메시지이거나 볼트가 바뀌었을 때만)
    let input = text;
    const inject = this.stateDirty;
    if (inject) {
      const state = renderToday(await getToday(vault, new Date()));
      input = `<현재 상태>\n${state}\n</현재 상태>\n\n${text}`;
    }

    const cfg = modeConfig(mode);
    const args = [
      '-p',
      '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--system-prompt', SYSTEM_PROMPT,
      '--tools', '',
      '--disable-slash-commands',
      '--setting-sources', '',
      '--mcp-config', writeMcpConfig(vault.root, this.mcpEntry),
      '--strict-mcp-config',
      '--allowedTools', 'mcp__planner__*',
      '--model', cfg.model,
      '--effort', cfg.effort,
    ];
    if (this.sessionId) args.push('--resume', this.sessionId);

    this.emit({ type: 'start', id, mode, injectedState: inject });
    const proc = spawn(exe, args, { cwd: vault.root, windowsHide: true });
    this.proc = proc;
    proc.stdin.end(input);

    let buf = '';
    let finalText = '';
    let streamed = '';
    let gotResult = false;
    let stderr = '';

    const handle = (j: Record<string, unknown>) => {
      const type = j['type'];
      if (type === 'stream_event') {
        const ev = j['event'] as { type?: string; delta?: { type?: string; text?: string } } | undefined;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          streamed += ev.delta.text;
          this.emit({ type: 'text', id, delta: ev.delta.text });
        }
      } else if (type === 'assistant') {
        const content = (j['message'] as { content?: { type: string; name?: string; input?: unknown }[] })?.content ?? [];
        for (const c of content) {
          if (c.type === 'tool_use' && c.name) {
            this.emit({ type: 'tool', id, name: c.name.replace(/^mcp__planner__/, ''), summary: shortJson(c.input) });
          }
        }
      } else if (type === 'result') {
        gotResult = true;
        const r = j as {
          is_error?: boolean;
          result?: string;
          session_id?: string;
          num_turns?: number;
          duration_ms?: number;
          usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };
          modelUsage?: Record<string, unknown>;
          api_error_status?: number;
        };
        finalText = r.result ?? streamed;
        if (r.is_error) {
          const auth = /auth|login|401|403|credential|로그인/i.test(finalText);
          if (auth) this.status.loggedIn = false;
          this.emit({ type: 'error', id, kind: auth ? 'auth' : 'other', message: finalText || '요청 실패' });
          return;
        }
        this.status.loggedIn = true;
        if (r.session_id) this.sessionId = r.session_id;
        this.sessionTurns++;
        this.lastActivity = Date.now();
        if (inject) this.stateDirty = false;
        const models = Object.keys(r.modelUsage ?? {}).filter((m) => !m.includes('haiku'));
        const usage: TurnUsage = {
          model: models[0] ?? cfg.model,
          turns: r.num_turns ?? 1,
          ms: r.duration_ms ?? 0,
          input: r.usage?.input_tokens ?? 0,
          cacheWrite: r.usage?.cache_creation_input_tokens ?? 0,
          cacheRead: r.usage?.cache_read_input_tokens ?? 0,
          output: r.usage?.output_tokens ?? 0,
        };
        this.lastContext = usage.input + usage.cacheWrite + usage.cacheRead;
        const rec: UsageRecord = { ...usage, at: new Date().toISOString(), mode };
        try {
          appendFileSync(usageFile(), `${JSON.stringify(rec)}\n`, 'utf8');
        } catch {
          // 사용량 기록 실패는 무시
        }
        this.emit({ type: 'done', id, text: finalText, usage, sessionTurns: this.sessionTurns });
      }
    };

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d: string) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        try {
          handle(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // 깨진 줄은 건너뜀
        }
      }
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (d: string) => {
      stderr += d;
    });

    await new Promise<void>((resolve) => {
      proc.on('close', (code, signal) => {
        this.proc = null;
        if (!gotResult) {
          if (signal) this.emit({ type: 'error', id, kind: 'cancelled', message: '취소됨' });
          else {
            const msg = stderr.trim() || `Claude Code가 결과 없이 종료됨 (코드 ${code})`;
            const auth = /auth|login|log in|credential/i.test(msg);
            if (auth) this.status.loggedIn = false;
            this.emit({ type: 'error', id, kind: auth ? 'auth' : 'other', message: msg.slice(0, 500) });
          }
        }
        resolve();
      });
      proc.on('error', (err) => {
        this.proc = null;
        this.emit({ type: 'error', id, kind: 'missing', message: err.message });
        resolve();
      });
    });
  }

  usage(): UsageSummary {
    const today = toDateString(new Date());
    const out: UsageSummary = { today: { requests: 0, input: 0, output: 0 }, session: { turns: this.sessionTurns, lastContext: this.lastContext } };
    try {
      for (const line of readFileSync(usageFile(), 'utf8').split('\n')) {
        if (!line.startsWith('{')) continue;
        const r = JSON.parse(line) as UsageRecord;
        if (toDateString(new Date(r.at)) !== today) continue;
        out.today.requests++;
        out.today.input += r.input + r.cacheWrite + r.cacheRead;
        out.today.output += r.output;
      }
    } catch {
      // 기록 없음
    }
    return out;
  }
}
