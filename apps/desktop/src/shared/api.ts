import type { FontId, ThemeId } from './themes';
import type { AddEventInput, AddTaskInput, DayView, HomeView, Item, MonthSummary, UpdateTaskPatch, YearView } from '@scheduler/core';

/** main ↔ renderer 사이의 약속. preload가 window.planner로 노출한다. */

export type ChatMode = 'quick' | 'plan';

export interface ClaudeStatus {
  installed: boolean;
  path?: string;
  version?: string;
  /** 마지막 실행에서 인증 오류가 났으면 false. 아직 모르면 undefined */
  loggedIn?: boolean;
}

export interface AppState {
  vault: string | null;
  claude: ClaudeStatus;
  dayStart: string;
  dayEnd: string;
}

// ── 대시보드 위젯 레이아웃 (볼트의 .planner/layout.json) ──
export type WidgetType = 'heading' | 'now' | 'attention' | 'todayList' | 'timeline' | 'week' | 'month' | 'goals' | 'inbox' | 'record' | 'clock';
/** 12열 격자 위의 위치와 크기 (칸 단위) */
export interface GridWidget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  options?: { clockStyle?: 'digital' | 'analog'; title?: string };
}
export interface DashLayout {
  version: 3;
  widgets: GridWidget[];
}

/** 이 PC의 화면 설정 */
export interface Prefs {
  clockStyle: 'digital' | 'analog';
  theme: ThemeId;
  font: FontId;
  weatherCity: string;
  dayStart: string;
  dayEnd: string;
}

export interface Weather {
  place: string;
  temp: number;
  feels: number;
  /** WMO 날씨 코드 */
  code: number;
  isDay: boolean;
  max: number;
  min: number;
  /** 오늘 최대 강수 확률 (%) */
  rain: number | null;
  updatedAt: string;
}

export interface HomeData extends HomeView {
  /** 오늘부터 7일 */
  week: DayView[];
}

/** 조회: 이름 → [인자, 결과] */
export interface Queries {
  home: [[], HomeData];
  day: [[date: string], DayView];
  range: [[from: string, to: string], DayView[]];
  month: [[month: string], MonthSummary];
  year: [[year: string], YearView];
  inbox: [[], Item[]];
}

/** 수정: 이름 → 인자. 결과는 모두 OpResult */
export interface Ops {
  quickAdd: [text: string, defaultDate: string | null];
  addTask: [input: AddTaskInput];
  addEvent: [input: AddEventInput];
  addGoal: [period: string, text: string];
  update: [ref: string, patch: UpdateTaskPatch];
  setTime: [ref: string, start?: string, end?: string];
  setKind: [ref: string, kind: 'task' | 'event' | 'allday'];
  complete: [ref: string, done: boolean];
  move: [ref: string, toDate: string | null];
  remove: [ref: string];
  headline: [date: string, text: string | null];
}

export interface OpResult {
  /** 사용자에게 보여줄 한 줄 */
  message: string;
  /** 있으면 되돌릴 수 있음 */
  undoId?: string;
  /** 작업 후 항목 (편집 패널 갱신용) */
  item?: Item;
}

export interface TurnUsage {
  model: string;
  turns: number;
  ms: number;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export type ChatEvent =
  | { type: 'start'; id: string; mode: ChatMode; injectedState: boolean }
  | { type: 'text'; id: string; delta: string }
  | { type: 'tool'; id: string; name: string; summary: string }
  | { type: 'done'; id: string; text: string; usage: TurnUsage; sessionTurns: number }
  | { type: 'error'; id: string; kind: 'missing' | 'auth' | 'cancelled' | 'other'; message: string }
  | { type: 'reset'; reason: string };

export interface UsageSummary {
  today: { requests: number; input: number; output: number };
  session: { turns: number; lastContext: number };
}

export interface VaultChange {
  files: string[];
  /** 앱이 아닌 곳(Claude, Obsidian, git 등)에서 바뀜 */
  external: boolean;
}

export interface PlannerApi {
  getState(): Promise<AppState>;
  chooseVault(): Promise<string | null>;
  query<K extends keyof Queries>(name: K, ...args: Queries[K][0]): Promise<Queries[K][1]>;
  op<K extends keyof Ops>(name: K, ...args: Ops[K]): Promise<OpResult>;
  undo(id: string): Promise<OpResult>;
  onVaultChanged(cb: (c: VaultChange) => void): () => void;

  chatSend(text: string, mode: ChatMode): Promise<void>;
  chatCancel(): Promise<void>;
  chatReset(): Promise<void>;
  onChatEvent(cb: (e: ChatEvent) => void): () => void;
  getUsage(): Promise<UsageSummary>;
  openClaudeLogin(): Promise<void>;
  recheckClaude(): Promise<ClaudeStatus>;

  getLayout(): Promise<DashLayout | null>;
  saveLayout(layout: DashLayout): Promise<void>;
  getPrefs(): Promise<Prefs>;
  setPrefs(patch: Partial<Prefs>): Promise<Prefs>;
  getWeather(force?: boolean): Promise<Weather>;
  previewAlert(): Promise<void>;
}

/** IPC 채널 이름 */
export const CH = {
  getState: 'state:get',
  chooseVault: 'vault:choose',
  query: 'query',
  op: 'op',
  undo: 'undo',
  previewAlert: 'alert:preview',
  vaultChanged: 'vault:changed',
  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  chatReset: 'chat:reset',
  chatEvent: 'chat:event',
  getUsage: 'usage:get',
  openClaudeLogin: 'claude:login',
  recheckClaude: 'claude:recheck',
  getLayout: 'layout:get',
  saveLayout: 'layout:save',
  getPrefs: 'prefs:get',
  setPrefs: 'prefs:set',
  getWeather: 'weather:get',
} as const;
