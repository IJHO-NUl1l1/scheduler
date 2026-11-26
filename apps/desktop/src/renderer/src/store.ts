import { create } from 'zustand';
import type { DayView, Item, MonthSummary, YearView } from '@scheduler/core';
import type { AppState, ChatEvent, ChatMode, DashLayout, HomeData, OpResult, Ops, Prefs, TurnUsage, UsageSummary, Weather } from '@shared/api';
import { defaultLayout, migrate } from './widgets/layout';
import { addDaysStr, addMonths, monthDays, todayStr, weekStartOf } from './lib';

export type Tab = 'dashboard' | 'day' | 'calendar' | 'goals' | 'inbox';
export type CalendarView = 'month' | 'week';
export type GoalsView = 'month' | 'year' | 'record';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'notice';
  text: string;
  tools: { name: string; summary: string }[];
  usage?: TurnUsage;
  error?: { kind: string; message: string };
  pending?: boolean;
  injectedState?: boolean;
}

export interface ConfirmReq {
  title: string;
  body?: string;
  ok?: string;
  cancel?: string;
  danger?: boolean;
}

export interface Toast {
  id: number;
  kind: 'ok' | 'error';
  message: string;
  undoId?: string;
}

interface Store {
  app: AppState | null;

  // 탐색
  tab: Tab;
  day: string;
  calView: CalendarView;
  month: string;
  weekStart: string;
  goalsView: GoalsView;
  goalsMonth: string;
  year: string;

  // 데이터
  home: HomeData | null;
  dayView: DayView | null;
  calDays: DayView[];
  monthSummary: MonthSummary | null;
  goalsMonthSummary: MonthSummary | null;
  yearView: YearView | null;
  inbox: Item[];
  loading: boolean;

  /** 바깥(Claude 등)에서 바뀐 항목 ref → 강조 */
  highlight: Set<string>;
  lastExternalAt: number;
  toasts: Toast[];
  editing: Item | null;
  hideDone: boolean;

  /** 데이터를 다시 불러올 때마다 1씩 증가 (위젯이 자기 데이터를 다시 가져오는 신호) */
  rev: number;
  layout: DashLayout;
  editLayout: boolean;
  /** 테마 인트로가 화면을 덮고 있는 동안: 뒤에서 도는 애니메이션(눈·사이드바 트리)을 멈춘다 */
  introOn: boolean;
  prefs: Prefs | null;
  weather: Weather | null;
  weatherError: string | null;
  settingsOpen: boolean;
  confirmReq: ConfirmReq | null;
  /** 우리 디자인의 확인 창. 확인이면 true */
  ask(req: ConfirmReq): Promise<boolean>;
  answer(ok: boolean): void;

  // 채팅
  chatOpen: boolean;
  chatMode: ChatMode;
  messages: ChatMessage[];
  busy: boolean;
  usage: UsageSummary | null;

  init(): Promise<void>;
  load(external?: boolean): Promise<void>;
  go(tab: Tab, patch?: Partial<Pick<Store, 'day' | 'month' | 'weekStart' | 'calView' | 'goalsView' | 'goalsMonth' | 'year'>>): void;
  op<K extends keyof Ops>(name: K, ...args: Ops[K]): Promise<OpResult | null>;
  undo(id: string): Promise<void>;
  toast(t: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
  edit(item: Item | null): void;
  setHideDone(v: boolean): void;

  setLayout(fn: (l: DashLayout) => DashLayout): void;
  setEditLayout(v: boolean): void;
  setPrefs(patch: Partial<Prefs>): Promise<void>;
  loadWeather(force?: boolean): Promise<void>;
  setSettingsOpen(v: boolean): void;

  setChatOpen(v: boolean): void;
  setChatMode(m: ChatMode): void;
  sendChat(text: string): Promise<void>;
  onChatEvent(e: ChatEvent): void;
}

const api = () => window.planner;

function cleanError(e: unknown): string {
  return String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': /, '').replace(/^(VaultError|Error): /, '');
}

/** 강조 비교용: 화면에 보이는 항목의 ref → 원문 */
function snapshot(s: Pick<Store, 'home' | 'dayView' | 'calDays' | 'inbox' | 'goalsMonthSummary' | 'yearView'>): Map<string, string> {
  const m = new Map<string, string>();
  const add = (i: Item) => m.set(i.ref, i.raw);
  s.home?.today.items.forEach((x) => add(x.item));
  s.home?.week.forEach((d) => d.items.forEach(add));
  s.dayView?.items.forEach(add);
  s.calDays.forEach((d) => d.items.forEach(add));
  s.inbox.forEach(add);
  s.goalsMonthSummary?.goals.goals.forEach(add);
  s.yearView?.goals.goals.forEach(add);
  return m;
}

let confirmResolve: ((ok: boolean) => void) | null = null;
let toastSeq = 0;

export const useStore = create<Store>((set, get) => ({
  app: null,
  tab: 'dashboard',
  day: todayStr(),
  calView: 'month',
  month: todayStr().slice(0, 7),
  weekStart: weekStartOf(todayStr()),
  goalsView: 'month',
  goalsMonth: todayStr().slice(0, 7),
  year: todayStr().slice(0, 4),

  home: null,
  dayView: null,
  calDays: [],
  monthSummary: null,
  goalsMonthSummary: null,
  yearView: null,
  inbox: [],
  loading: false,

  highlight: new Set(),
  lastExternalAt: 0,
  toasts: [],
  editing: null,
  hideDone: false,

  rev: 0,
  layout: defaultLayout(),
  editLayout: false,
  introOn: false,
  prefs: null,
  weather: null,
  weatherError: null,
  settingsOpen: false,
  confirmReq: null,
  ask(req) {
    confirmResolve?.(false);
    return new Promise<boolean>((resolve) => {
      confirmResolve = resolve;
      set({ confirmReq: req });
    });
  },
  answer(ok) {
    const r = confirmResolve;
    confirmResolve = null;
    set({ confirmReq: null });
    r?.(ok);
  },

  chatOpen: false,
  chatMode: 'quick',
  messages: [],
  busy: false,
  usage: null,

  async init() {
    const [app, prefs] = await Promise.all([api().getState(), api().getPrefs()]);
    set({ app, prefs });
    if (app.vault) {
      const saved = await api().getLayout();
      set({ layout: migrate(saved) });
      await get().load();
    }
    set({ usage: await api().getUsage() });
    void get().loadWeather();
  },

  /** 홈 요약 + 지금 탭에 필요한 데이터 */
  async load(external = false) {
    const s = get();
    if (!s.app?.vault) return;
    const before = external ? snapshot(s) : null;
    try {
      const patch: Partial<Store> = {};
      const jobs: Promise<void>[] = [api().query('home').then((h) => void (patch.home = h))];
      if (s.tab === 'day') jobs.push(api().query('day', s.day).then((d) => void (patch.dayView = d)));
      if (s.tab === 'calendar') {
        if (s.calView === 'month') {
          const days = monthDays(s.month);
          jobs.push(api().query('range', days[0]!, days[days.length - 1]!).then((d) => void (patch.calDays = d)));
          jobs.push(api().query('month', s.month).then((m) => void (patch.monthSummary = m)));
        } else {
          jobs.push(api().query('range', s.weekStart, addDaysStr(s.weekStart, 6)).then((d) => void (patch.calDays = d)));
          jobs.push(api().query('month', s.weekStart.slice(0, 7)).then((m) => void (patch.monthSummary = m)));
        }
      }
      if (s.tab === 'goals') {
        jobs.push(api().query('month', s.goalsMonth).then((m) => void (patch.goalsMonthSummary = m)));
        jobs.push(api().query('year', s.year).then((y) => void (patch.yearView = y)));
      }
      if (s.tab === 'inbox') jobs.push(api().query('inbox').then((i) => void (patch.inbox = i)));
      await Promise.all(jobs);

      if (before && before.size) {
        const after = snapshot({ ...get(), ...patch } as Store);
        const changed = new Set<string>();
        for (const [ref, raw] of after) if (before.get(ref) !== raw) changed.add(ref);
        if (changed.size) {
          patch.highlight = changed;
          patch.lastExternalAt = Date.now();
          setTimeout(() => {
            if (get().highlight === changed) set({ highlight: new Set() });
          }, 7000);
        }
      }
      set({ ...patch, rev: get().rev + 1 });
    } catch (e) {
      get().toast({ kind: 'error', message: cleanError(e) });
    }
  },

  setLayout(fn) {
    const layout = fn(get().layout);
    set({ layout });
    void api().saveLayout(layout);
  },
  setEditLayout: (v) => set({ editLayout: v }),
  async setPrefs(patch) {
    const prefs = await api().setPrefs(patch);
    const app = await api().getState();
    set({ prefs, app });
    if (patch.weatherCity !== undefined) void get().loadWeather(true);
    void get().load();
  },
  async loadWeather(force = false) {
    try {
      set({ weather: await api().getWeather(force), weatherError: null });
    } catch (e) {
      set({ weatherError: cleanError(e) });
    }
  },
  setSettingsOpen: (v) => set({ settingsOpen: v }),

  go(tab, patch = {}) {
    set({ tab, ...patch, editing: null });
    void get().load();
  },

  async op(name, ...args) {
    try {
      const r = await api().op(name, ...args);
      // 되돌리기는 직전 작업만: 이전 알림의 되돌리기 버튼은 없앤다
      set((s) => ({ toasts: s.toasts.map(({ undoId: _, ...t }) => t) }));
      get().toast({ kind: 'ok', message: r.message, ...(r.undoId ? { undoId: r.undoId } : {}) });
      const editing = get().editing;
      if (editing) {
        if (name === 'remove') set({ editing: null });
        else if (r.item && (r.item.ref === editing.ref || r.item.id === editing.id || args[0] === editing.ref)) set({ editing: r.item });
      }
      await get().load();
      return r;
    } catch (e) {
      get().toast({ kind: 'error', message: cleanError(e) });
      return null;
    }
  },

  async undo(id) {
    try {
      await api().undo(id);
      set((s) => ({ toasts: s.toasts.filter((t) => t.undoId !== id), editing: null }));
      await get().load();
    } catch (e) {
      get().toast({ kind: 'error', message: cleanError(e) });
    }
  },

  toast(t) {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), t.kind === 'error' ? 7000 : 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  edit: (item) => set({ editing: item }),
  setHideDone: (v) => set({ hideDone: v }),

  setChatOpen: (v) => set({ chatOpen: v }),
  setChatMode: (m) => set({ chatMode: m }),

  async sendChat(text) {
    const t = text.trim();
    if (!t || get().busy) return;
    set((s) => ({ busy: true, messages: [...s.messages, { id: `u${Date.now()}`, role: 'user', text: t, tools: [] }] }));
    await api().chatSend(t, get().chatMode);
  },

  onChatEvent(e) {
    if (e.type === 'reset') {
      set((s) => ({ messages: [...s.messages, { id: `r${Date.now()}`, role: 'notice', text: e.reason, tools: [] }] }));
      return;
    }
    const update = (fn: (m: ChatMessage) => ChatMessage) => set((s) => ({ messages: s.messages.map((m) => (m.id === e.id ? fn(m) : m)) }));
    switch (e.type) {
      case 'start':
        set((s) => ({ messages: [...s.messages, { id: e.id, role: 'assistant', text: '', tools: [], pending: true, injectedState: e.injectedState }] }));
        break;
      case 'text':
        update((m) => ({ ...m, text: m.text + e.delta }));
        break;
      case 'tool':
        update((m) => ({ ...m, tools: [...m.tools, { name: e.name, summary: e.summary }] }));
        break;
      case 'done':
        update((m) => ({ ...m, text: e.text || m.text, usage: e.usage, pending: false }));
        set({ busy: false });
        void api().getUsage().then((usage) => set({ usage }));
        void api().getState().then((app) => set({ app }));
        break;
      case 'error': {
        if (get().messages.some((m) => m.id === e.id)) update((m) => ({ ...m, pending: false, error: { kind: e.kind, message: e.message } }));
        else set((s) => ({ messages: [...s.messages, { id: e.id, role: 'assistant', text: '', tools: [], error: { kind: e.kind, message: e.message } }] }));
        set({ busy: false });
        void api().getState().then((app) => set({ app }));
        break;
      }
    }
  },
}));

export { addMonths };
