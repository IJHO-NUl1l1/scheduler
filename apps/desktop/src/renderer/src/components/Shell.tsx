import { useEffect, useState, type ReactNode } from 'react';
import { Clock } from './Clock';
import { WeatherBlock } from './WeatherView';
import { useTheme } from '../themes';
import { FONTS } from '@shared/themes';
import { useStore, type Tab } from '../store';
import { WEEK, dayInfo, parseD, todayStr, useNow } from '../lib';
import { Icon, type IconName } from './ui';
import { QuickAdd } from './QuickAdd';

const NAV: { tab: Tab; label: string; icon: IconName }[] = [
  { tab: 'dashboard', label: '대시보드', icon: 'dashboard' },
  { tab: 'day', label: '오늘', icon: 'day' },
  { tab: 'calendar', label: '캘린더', icon: 'calendar' },
  { tab: 'goals', label: '목표', icon: 'goals' },
  { tab: 'inbox', label: '인박스', icon: 'inbox' },
];

/**
 * 하루 호: 근무 시작~끝을 곡선으로 그리고 지금 위치에 해를 놓는다 (시간에 따른 변화 요소).
 */
function DayArc({ now, start, end }: { now: Date; start: string; end: string }) {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const s = toMin(start);
  const e = toMin(end);
  const m = now.getHours() * 60 + now.getMinutes();
  const t = Math.max(0, Math.min(1, (m - s) / Math.max(1, e - s)));
  const outside = m < s || m > e;
  // 2차 베지어 곡선 위의 점
  const P0 = [6, 46];
  const P1 = [88, -8];
  const P2 = [170, 46];
  const pt = (k: number, i: 0 | 1) => (1 - k) ** 2 * P0[i]! + 2 * (1 - k) * k * P1[i]! + k ** 2 * P2[i]!;
  const d = `M ${P0[0]} ${P0[1]} Q ${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`;
  const left = Math.max(0, e - m);
  return (
    <div className="mt-4">
      <svg viewBox="0 0 176 52" className="w-full overflow-visible">
        <line x1="0" y1="46.5" x2="176" y2="46.5" stroke="var(--line)" strokeWidth="1" />
        <path d={d} fill="none" stroke="var(--line)" strokeWidth="1.25" strokeDasharray="2 3" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" pathLength={1} strokeDasharray={`${t} 1`} opacity={outside ? 0.35 : 0.9} />
        <circle cx={pt(t, 0)} cy={pt(t, 1)} r="7" fill="var(--accent)" opacity={outside ? 0.08 : 0.15} />
        <circle cx={pt(t, 0)} cy={pt(t, 1)} r="3.25" fill={outside ? 'var(--faint)' : 'var(--accent)'} />
      </svg>
      <div className="tabular mt-1 flex justify-between text-[10px] text-faint">
        <span>{start}</span>
        <span>{outside ? (m < s ? '시작 전' : '근무 끝') : `${Math.floor(left / 60)}시간 ${left % 60}분 남음`}</span>
        <span>{end}</span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { tab, go, home, app, chatOpen, setChatOpen, prefs, setPrefs, weather, weatherError, loadWeather, setSettingsOpen } = useStore();
  const now = useNow();
  const open = home?.today.items.filter((x) => x.item.kind === 'task' && !x.item.done).length ?? 0;
  const counts: Partial<Record<Tab, number>> = { day: open, inbox: home?.inbox.length ?? 0 };
  const p = home?.progress;
  const clockStyle = prefs?.clockStyle ?? 'digital';
  const { SidebarOrnament: Ornament, SidebarFeature: Feature } = useTheme();

  return (
    <nav className="relative flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line bg-sidebar px-4 py-5">
      {Ornament && <Ornament />}
      {/* 날씨 */}
      <div className="rounded-xl border border-line bg-surface px-3 py-3">
        <WeatherBlock weather={weather} error={weatherError} onRetry={() => void loadWeather(true)} onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      {/* 시계 (누르면 모양 바꾸기) */}
      <button type="button" title="눌러서 시계 모양 바꾸기" onClick={() => void setPrefs({ clockStyle: clockStyle === 'digital' ? 'analog' : 'digital' })} className="mt-3 block w-full">
        <Clock style={clockStyle} size={112} />
      </button>

      <div className="mt-4 px-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold">
            {now.getMonth() + 1}월 {now.getDate()}일
          </span>
          <span className="text-[13px] text-muted">{WEEK[now.getDay()]}요일</span>
        </div>
        {dayInfo(todayStr()).holiday && <div className="mt-1 text-[12px] font-medium text-sun">{dayInfo(todayStr()).holiday}</div>}
        <DayArc now={now} start={app?.dayStart ?? '08:00'} end={app?.dayEnd ?? '19:00'} />
        {p && (
          <div className="tabular mt-2 flex gap-3 text-[10.5px] text-faint">
            <span>
              이번 달 <span className="text-muted">{Math.round(p.month * 100)}%</span>
            </span>
            <span>
              올해 <span className="text-muted">{Math.round(p.year * 100)}%</span>
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-px">
        {NAV.map((n) => {
          const active = tab === n.tab;
          return (
            <button
              key={n.tab}
              type="button"
              onClick={() => go(n.tab, n.tab === 'day' ? { day: todayStr() } : {})}
              className={`relative flex w-full items-center gap-3 rounded-md py-2 pr-2 pl-3 text-[13px] transition-colors ${active ? 'bg-surface font-medium text-ink' : 'text-muted hover:text-ink'}`}
            >
              {active && <span className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />}
              <Icon name={n.icon} size={15} className={active ? 'text-ink' : 'text-faint'} />
              {n.label}
              {!!counts[n.tab] && <span className="tabular ml-auto text-[11px] text-faint">{counts[n.tab]}</span>}
            </button>
          );
        })}
      </div>

      {Feature && <Feature />}

      <div className="mt-auto space-y-px border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setChatOpen(!chatOpen)}
          className={`flex w-full items-center gap-3 rounded-md py-2 pr-2 pl-3 text-[13px] ${chatOpen ? 'text-ink' : 'text-muted hover:text-ink'}`}
        >
          <Icon name="chat" size={15} className={chatOpen ? 'text-accent' : 'text-faint'} />
          Claude
          <span className={`ml-auto h-1.5 w-1.5 rounded-full ${chatOpen ? 'bg-accent' : 'bg-line'}`} />
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} className="flex w-full items-center gap-3 rounded-md py-2 pr-2 pl-3 text-[13px] text-muted hover:text-ink">
          <Icon name="settings" size={15} className="text-faint" />
          설정
          <span className="ml-auto max-w-[80px] truncate text-[10.5px] text-faint" title={app?.vault ?? ''}>
            {app?.vault?.split(/[\\/]/).pop()}
          </span>
        </button>
      </div>
    </nav>
  );
}

/** 설정: 시계, 날씨 지역, 근무 시간, 볼트 */
export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, prefs, setPrefs, app, init } = useStore();
  const [city, setCity] = useState('');
  useEffect(() => setCity(prefs?.weatherCity ?? ''), [prefs?.weatherCity, settingsOpen]);
  if (!settingsOpen || !prefs) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => setSettingsOpen(false)}>
      <div className="w-[440px] rounded-2xl border border-line bg-surface shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">설정</h2>
          <button type="button" onClick={() => setSettingsOpen(false)} className="ml-auto text-faint hover:text-ink" aria-label="닫기">
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="max-h-[72vh] space-y-5 overflow-y-auto px-5 py-5">
          <SettingRow label="시계">
            <div className="flex gap-2">
              {(['digital', 'analog'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => void setPrefs({ clockStyle: st })}
                  className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-3 ${prefs.clockStyle === st ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'}`}
                >
                  <div className="pointer-events-none flex h-[84px] w-full items-center justify-center">
                    <Clock style={st} size={80} />
                  </div>
                  <span className="text-[12px]">{st === 'digital' ? '디지털' : '아날로그'}</span>
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow label="테마">
            <button
              type="button"
              role="switch"
              aria-checked={prefs.theme === 'christmas'}
              onClick={() => void setPrefs({ theme: prefs.theme === 'christmas' ? 'default' : 'christmas' })}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${prefs.theme === 'christmas' ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'}`}
            >
              <span className="flex-1">
                <span className="block text-[13px]">크리스마스 테마</span>
                <span className="block text-[11px] text-faint">끄면 기본 테마. 색·배경·장식이 통째로 바뀌어요</span>
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${prefs.theme === 'christmas' ? 'bg-accent' : 'bg-surface-2'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink transition-[left] ${prefs.theme === 'christmas' ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </button>
          </SettingRow>
          <SettingRow label="글꼴">
            <div className="space-y-1.5">
              {FONTS.map((f) => {
                const on = prefs.font === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => void setPrefs({ font: f.id })}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px]" style={{ fontFamily: f.family }}>
                        {f.name}
                      </span>
                      <span className="block truncate text-[12px] text-muted" style={{ fontFamily: f.family }}>
                        오늘 할 일 3개 · 12월 25일 14:00
                      </span>
                    </span>
                    {f.tag && <span className={`shrink-0 rounded-md border px-1.5 py-px text-[10.5px] ${on ? 'border-accent/60 text-accent' : 'border-line text-faint'}`}>{f.tag}</span>}
                  </button>
                );
              })}
            </div>
          </SettingRow>
          <SettingRow label="날씨 지역">
            <div className="flex gap-2">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void setPrefs({ weatherCity: city })}
                placeholder="예: 서울, 수원, 부산"
                className="flex-1 rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] outline-none focus:bg-hover"
              />
              <button type="button" onClick={() => void setPrefs({ weatherCity: city })} className="rounded-lg bg-surface-2 px-3 text-[12px] text-muted hover:text-ink">
                적용
              </button>
            </div>
            <p className="mt-1 text-[11px] text-faint">날씨는 Open-Meteo에서 받아와요. 보내는 정보는 지역 좌표뿐이에요.</p>
          </SettingRow>
          <SettingRow label="근무 시간 (타임라인·하루 호·빈 시간 계산)">
            <div className="flex items-center gap-2">
              <input type="time" value={prefs.dayStart} onChange={(e) => e.target.value && void setPrefs({ dayStart: e.target.value })} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none" />
              <span className="text-faint">–</span>
              <input type="time" value={prefs.dayEnd} onChange={(e) => e.target.value && void setPrefs({ dayEnd: e.target.value })} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none" />
            </div>
          </SettingRow>
          <SettingRow label="시간 알림">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[12px] text-muted">시작 전·시작·종료 때 화면 오른쪽 아래에 떠요</span>
              <button type="button" onClick={() => void window.planner.previewAlert()} className="shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 text-[12px] text-muted hover:text-ink">
                미리보기
              </button>
            </div>
          </SettingRow>
          <SettingRow label="볼트 폴더">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted" title={app?.vault ?? ''}>
                {app?.vault}
              </span>
              <button
                type="button"
                onClick={() =>
                  void window.planner.chooseVault().then((v) => {
                    if (v) void init();
                  })
                }
                className="shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 text-[12px] text-muted hover:text-ink"
              >
                바꾸기
              </button>
            </div>
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11.5px] font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}

/** 탭 상단: 제목(또는 날짜 이동) + 빠른 추가 */
/**
 * 모든 탭 공통 머리줄. 스크롤되지 않고, 배경·본문은 이 아래부터 시작한다.
 * 늘 들어가는 것: 오늘 날짜(회색 한 줄) · 빠른 추가 · 테마 장식(HeaderDecor).
 * - addDate: 빠른 추가 기본 날짜 (생략 = 오늘, null = 인박스)
 */
export function PageHeader({ title, sub, right, addDate, addPlaceholder }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; addDate?: string | null; addPlaceholder?: string }) {
  const Decor = useTheme().HeaderDecor;
  useNow(); // 자정이 지나면 날짜 줄이 바뀌게
  const today = todayStr();
  const d = parseD(today);
  const holiday = dayInfo(today).holiday;
  return (
    <header className="relative z-20 shrink-0 overflow-hidden border-b border-line bg-bg px-8 pt-4 pb-4">
      {Decor && <Decor />}
      <div className="relative flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">
            {d.getFullYear()} · {d.getMonth() + 1}월 {d.getDate()}일 {WEEK[d.getDay()]}요일
            {holiday && <span className="ml-2 text-sun">{holiday}</span>}
          </div>
          <div className="mt-1.5 text-[18px] font-semibold tracking-tight">{title}</div>
          {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-3">{right}</div>}
        <QuickAdd defaultDate={addDate === undefined ? today : addDate} placeholder={addPlaceholder} className="w-[360px] shrink-0" />
      </div>
    </header>
  );
}

/** 머리줄 아래 스크롤되는 본문 */
export function PageBody({ children }: { children: ReactNode }) {
  return <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>;
}

/** 확인 창 (브라우저 기본 confirm 대신). store.ask()로 연다 */
export function ConfirmDialog() {
  const req = useStore((s) => s.confirmReq);
  const answer = useStore((s) => s.answer);
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false);
      if (e.key === 'Enter') answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, answer]);
  if (!req) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim" onClick={() => answer(false)}>
      <div className="pop-in w-[360px] rounded-2xl border border-line bg-surface p-5 shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <h2 className="text-[15px] font-semibold">{req.title}</h2>
        {req.body && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{req.body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => answer(false)} className="rounded-lg px-3.5 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-ink">
            {req.cancel ?? '취소'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => answer(true)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ${req.danger ? 'bg-warn text-on-accent hover:brightness-110' : 'bg-accent text-on-accent hover:brightness-110'}`}
          >
            {req.ok ?? '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, undo, dismiss } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] shadow-xl shadow-black/50 ${
            t.kind === 'error' ? 'border-warn/40 bg-surface text-warn' : 'border-line bg-surface-2 text-ink'
          }`}
        >
          <span className="truncate">{t.message}</span>
          {t.undoId && (
            <button type="button" onClick={() => void undo(t.undoId!)} className="shrink-0 font-semibold text-accent hover:underline">
              되돌리기
            </button>
          )}
          <button type="button" onClick={() => dismiss(t.id)} className="shrink-0 text-faint hover:text-ink" aria-label="닫기">
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
