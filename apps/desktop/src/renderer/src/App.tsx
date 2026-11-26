import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { periodOf, useNow } from './lib';
import { ConfirmDialog, SettingsDialog, Sidebar, Toasts } from './components/Shell';
import { Editor } from './components/Editor';
import { DragLayer } from './drag';
import { ChatPanel } from './components/ChatPanel';
import { Dashboard } from './pages/Dashboard';
import { Day } from './pages/Day';
import { Calendar } from './pages/Calendar';
import { Goals } from './pages/Goals';
import { Inbox } from './pages/Inbox';
import { useTheme } from './themes';

export function App() {
  const { app, tab, init, load, chatOpen, onChatEvent, lastExternalAt, prefs } = useStore();
  const now = useNow();
  const theme = useTheme();
  const Background = theme.Background;

  // 테마·글꼴: <html data-theme / data-font>. 바뀔 때만 잠깐 색 전환 효과
  const themeId = prefs?.theme ?? 'default';
  const fontId = prefs?.font ?? 'pretendard';
  // 테마를 켜는 순간에만 보여주는 장면 (앱을 켤 때는 안 나온다)
  const [intro, setIntro] = useState(false);
  const Intro = theme.Intro;
  const prevTheme = useRef<string | null>(null);
  const loaded = prefs !== null;
  useEffect(() => {
    // 설정을 불러오기 전 값(기본)은 무시: 앱을 켤 때 '바뀜'으로 오인하지 않게
    if (!loaded) return;
    const root = document.documentElement;
    const changed = prevTheme.current !== null && prevTheme.current !== themeId;
    prevTheme.current = themeId;
    if (!changed) {
      root.dataset['theme'] = themeId;
      return;
    }
    // 인트로가 있는 테마: 인트로 덮개를 먼저 띄우고, 덮인 뒤에 색을 바꾼다 (전체 색 바꾸기는 한 번 멈칫하는 무거운 작업이라 가려서 한다).
    // 전체 색 전환 효과(모든 요소에 transition)도 생략한다
    if (Intro) {
      setIntro(true);
      const t = setTimeout(() => (root.dataset['theme'] = themeId), 120);
      return () => {
        clearTimeout(t);
        root.dataset['theme'] = themeId;
      };
    }
    root.dataset['theme'] = themeId;
    root.classList.add('theme-fading');
    const t = setTimeout(() => root.classList.remove('theme-fading'), 450);
    return () => {
      clearTimeout(t);
      root.classList.remove('theme-fading');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, loaded]);
  useEffect(() => {
    document.documentElement.dataset['font'] = fontId;
  }, [fontId]);
  const endIntro = useCallback(() => setIntro(false), []);
  // 인트로가 떠 있는 동안 뒤의 애니메이션을 멈춘다 (store.introOn, html[data-intro])
  useEffect(() => {
    useStore.setState({ introOn: intro });
    if (intro) document.documentElement.dataset['intro'] = 'on';
    else delete document.documentElement.dataset['intro'];
  }, [intro]);

  useEffect(() => {
    void init();
    const offVault = window.planner.onVaultChanged((c) => void load(c.external));
    const offChat = window.planner.onChatEvent(onChatEvent);
    return () => {
      offVault();
      offChat();
    };
  }, [init, load, onChatEvent]);

  // 진행 중/곧 시작/지남 상태는 시간이 흐르면 바뀌므로 1분마다 다시 불러온다
  useEffect(() => {
    if (!app?.vault) return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [app?.vault, load]);

  const period = periodOf(now);
  useEffect(() => {
    document.documentElement.dataset['period'] = period;
  }, [period]);

  if (!app) return null;
  if (!app.vault) return <Welcome />;
  const external = Date.now() - lastExternalAt < 7000;

  return (
    <>
    {Background && <Background />}
    <div className="relative z-10 flex h-full">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'day' && <Day />}
          {tab === 'calendar' && <Calendar />}
          {tab === 'goals' && <Goals />}
          {tab === 'inbox' && <Inbox />}
        </div>
        <Editor />
        {external && <div className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-accent-soft px-3 py-1 text-[12px] text-accent">바깥에서 변경됨 · 바뀐 항목을 표시했어요</div>}
      </div>
      {chatOpen && <ChatPanel />}
      <Toasts />
      <SettingsDialog />
      <ConfirmDialog />
      <DragLayer />
    </div>
    {intro && Intro && <Intro onDone={endIntro} />}
    </>
  );
}

function Welcome() {
  const init = useStore((s) => s.init);
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded-2xl border border-line/60 bg-surface p-8 text-center">
        <h1 className="text-[20px] font-bold">Scheduler</h1>
        <p className="mt-2 text-[13px] text-muted">일정과 할 일을 저장할 볼트 폴더를 고르세요. 비어 있는 폴더면 기본 구조를 만들고, 기존 볼트면 그대로 엽니다.</p>
        <button
          type="button"
          onClick={() =>
            void window.planner.chooseVault().then((v) => {
              if (v) void init();
            })
          }
          className="mt-6 rounded-lg bg-accent px-5 py-2 text-[14px] font-medium text-on-accent"
        >
          볼트 폴더 선택
        </button>
      </div>
    </div>
  );
}
