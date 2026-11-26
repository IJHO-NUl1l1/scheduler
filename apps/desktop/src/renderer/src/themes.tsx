import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Snowfall from 'react-snowfall';
import type { ThemeId } from '@shared/themes';
import { useStore } from './store';
import { GREETING, daysBetween, dateStr, type Period } from './lib';
import { SpiralTree } from './components/SpiralTree';
import { PlainCheck, SparkleCheck, type TaskCheckProps } from './components/TaskCheck';
import { BULBS, Bow, Holly, Wreath, XmasCalFrame, hashOf, xmasCellClass, xmasCellDecor } from './components/XmasArt';

/**
 * 테마 = 통째로 바뀌는 스킨 (docs/themes.md).
 * 색은 styles.css의 [data-theme] 블록, 모양·장식·문구는 여기의 슬롯.
 * 화면 코드는 useTheme()으로 슬롯을 꺼내 쓰고, 테마 이름으로 분기하지 않는다.
 */
/** 월 달력(큰 달력·위젯)의 꾸밈. 없으면 기본 모양 */
export interface CalendarSkin {
  /** 달력 전체를 감싸는 틀. compact = 위젯 */
  Frame?: ComponentType<{ month: string; compact?: boolean; children: ReactNode }>;
  /** 요일 줄 */
  weekHeadClass?: string;
  /** 칸 배경 (기본 배경 대신) */
  cellClass?(date: string, inMonth: boolean): string;
  /** 오늘 날짜 숫자 뒤에 두르는 그림과 숫자 모양 (기본 빨간 원 대신) */
  todayRing?(size: number): ReactNode;
  todayNumClass?: string;
  /** 칸 내용 뒤에 깔리는 장식 */
  cellDecor?(date: string, ctx: { today: string; inMonth: boolean; compact: boolean }): ReactNode;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  /** 화면 뒤 배경 장면 */
  Background?: ComponentType;
  /** 사이드바 장식 (사이드바 안에 겹쳐 그린다) */
  SidebarOrnament?: ComponentType;
  /** 각 화면 머리줄 장식 */
  HeaderDecor?: ComponentType;
  /** 대시보드 인사 */
  greeting(period: Period, now: Date): string;
  /** 인사 아래 한 줄 */
  subline?(now: Date): string;
  /** 할 일 체크박스 모양 */
  TaskCheck: ComponentType<TaskCheckProps>;
  /** 대시보드 위젯 상자 위쪽 모서리 장식. id로 상자마다 모양을 달리한다 */
  CardDecor?: ComponentType<{ id: string }>;
  calendar?: CalendarSkin;
  /** 기록 잔디에서 할 일을 모두 끝낸 날(100%) 칸 대신 그릴 그림. 없으면 4단계 색 칸 */
  heatFull?: ReactNode;
  /** 달력 칸에 붙는 작은 표시 */
  dayMark?(date: string): ReactNode;
  /** 빈 상태 앞에 붙는 그림 */
  emptyArt?: ReactNode;
  /** 사이드바 메뉴 아래 빈 공간을 채우는 장식 */
  SidebarFeature?: ComponentType;
  /** 대시보드 섹션 제목 앞 아이콘 (순서대로 돌려 쓴다) */
  headingIcons?: ReactNode[];
  /** 이 테마를 켜는 순간 화면 전체에 한 번 보여주는 장면. 끝나면 onDone */
  Intro?: ComponentType<{ onDone: () => void }>;
}

const defaultTheme: ThemeDef = {
  id: 'default',
  name: '기본',
  greeting: (p) => `${GREETING[p]}.`,
  TaskCheck: PlainCheck,
};

// ── 크리스마스 ──

function daysToChristmas(now: Date): number {
  const today = dateStr(now);
  let xmas = `${now.getFullYear()}-12-25`;
  if (today > xmas) xmas = `${now.getFullYear() + 1}-12-25`;
  return daysBetween(today, xmas);
}

const XMAS_GREETING: Record<Period, string> = {
  morning: '포근한 아침이에요',
  day: '따뜻한 오후 보내세요',
  evening: '반짝이는 저녁이에요',
  night: '고요한 밤이에요',
};

function useReducedMotion(): boolean {
  const [v, setV] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setV(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return v;
}

/** 밤하늘 + 눈. 눈은 위젯 뒤(사이드바·위젯 사이)로 내린다. 클릭·드래그는 막지 않는다 */
function ChristmasBackground() {
  const still = useReducedMotion();
  const introOn = useStore((s) => s.introOn);
  const motion = still ? { speed: [0, 0] as [number, number], wind: [0, 0] as [number, number] } : {};
  const layer = { position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none' } as const;
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(900px 480px at 85% -8%, rgb(67 168 101 / 0.20), transparent 70%), radial-gradient(760px 420px at 8% -6%, rgb(214 57 63 / 0.16), transparent 70%), radial-gradient(1200px 600px at 50% 120%, rgb(233 196 106 / 0.06), transparent 70%), linear-gradient(180deg, #0d1c15 0%, #0a1510 55%, #08110d 100%)',
        }}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        {!introOn && <Snowfall color="#eef3ff" snowflakeCount={90} radius={[0.6, 2.4]} speed={[0.3, 1.1]} wind={[-0.3, 0.8]} opacity={[0.35, 0.85]} style={layer} {...motion} />}
      </div>
    </>
  );
}

/**
 * 위젯 상자 위쪽 모서리에 살짝 두른 전구 줄 + 호랑가시/리본.
 * 상자마다 id로 왼쪽/오른쪽, 장식, 길이가 달라진다. 제목을 가리지 않게 맨 위 10px 안쪽에만 걸친다.
 */
function CardGarland({ id }: { id: string }) {
  const h = hashOf(id);
  const right = h % 2 === 1;
  const swags = 2 + ((h >> 1) % 2);
  const deco = (h >> 2) % 2 === 0 ? <Holly /> : <Bow />;
  const sw = 44;
  const x0 = 16;
  const w = x0 + swags * sw + 4;
  const wire = `M${x0 - 6} 4 ${Array.from({ length: swags }, (_, i) => `Q ${x0 + (i + 0.5) * sw} 8 ${x0 + (i + 1) * sw} 1.5`).join(' ')}`;
  const bulbs: { x: number; y: number }[] = [];
  for (let i = 0; i < swags; i++) {
    // 한 줄 처짐마다 전구 3개: 처짐을 따라 매단다
    for (const f of [0.22, 0.5, 0.78]) {
      const t = f;
      const xa = x0 + i * sw;
      const ya = i === 0 ? 4 : 1.5;
      const x = (1 - t) * (1 - t) * xa + 2 * (1 - t) * t * (xa + sw / 2) + t * t * (xa + sw);
      const y = (1 - t) * (1 - t) * ya + 2 * (1 - t) * t * 8 + t * t * 1.5;
      bulbs.push({ x, y });
    }
  }
  return (
    <svg
      aria-hidden
      width={w}
      height={14}
      viewBox={`0 0 ${w} 14`}
      className="pointer-events-none absolute top-0 z-10"
      style={right ? { right: 0, transform: 'scaleX(-1)' } : { left: 0 }}
    >
      <path d={wire} fill="none" stroke="#3a7350" strokeWidth="1.1" />
      {bulbs.map((b, i) => {
        const c = BULBS[(i + (h % 4)) % BULBS.length]!;
        return (
          <g key={i} className="bulb" style={{ animationDelay: `${((i * 0.53 + (h % 7) * 0.3) % 2.4).toFixed(2)}s` }}>
            <circle cx={b.x} cy={b.y + 3.4} r={4.6} fill={c} opacity={0.16} />
            <rect x={b.x - 1} y={b.y} width={2} height={1.5} rx={0.4} fill="#a8894a" />
            <ellipse cx={b.x} cy={b.y + 3.4} rx={1.8} ry={2.5} fill={c} />
          </g>
        );
      })}
      <g transform="translate(-1.5 -1.5) scale(0.72)">{deco}</g>
    </svg>
  );
}

/** 작은 별 (12/25 칸, 시계) */
export function Star({ size = 10, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} aria-hidden className={className}>
      <path d="M5 0.6l1.25 2.85 3.1.3-2.35 2.06.7 3.04L5 7.27 2.3 8.85l.7-3.04L.65 3.75l3.1-.3z" fill="currentColor" />
    </svg>
  );
}

function Snowflake({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5" />
    </svg>
  );
}

// ── 금색 선 아이콘 (트리·전구·별·선물) ──

const GOLD = 'var(--gold)';

export function GoldTree({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M12 2.2l.9 1.9 2 .3-1.5 1.4.4 2L12 6.8l-1.8 1 .4-2-1.5-1.4 2-.3z" fill={GOLD} stroke="none" />
      <path d="M12 8.6L8 13.4h2.4L6.4 18.6h11.2l-4-5.2H16z" />
      <path d="M12 18.6v2.8" />
    </svg>
  );
}

export function GoldBulb({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M10 3h4v3h-4z" />
      <path d="M12 6c3.3 0 5 2.6 5 6.2 0 3.9-2.4 8.3-5 8.3s-5-4.4-5-8.3C7 8.6 8.7 6 12 6z" />
      <path d="M10 10.5c-.6.8-.9 1.8-.9 2.8" opacity="0.6" />
    </svg>
  );
}

export function GoldStar({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M12 2.8l2.7 5.7 6.2.8-4.5 4.3 1.1 6.2L12 16.8l-5.5 3 1.1-6.2-4.5-4.3 6.2-.8z" />
    </svg>
  );
}

export function GoldGift({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13" />
      <path d="M12 7c-1.5-3-5-3.2-5-1.2C7 7 9.5 7 12 7zm0 0c1.5-3 5-3.2 5-1.2C17 7 14.5 7 12 7z" />
    </svg>
  );
}

/** 머리줄에 흩어 놓은 금색 아이콘 (별 몇 개는 반짝인다) */
/** 머리줄 아래 테두리에 쌓인 눈: 폭과 높이가 제각각인 둔덕 (고정 시드라 매번 같은 모양) */
const HEADER_SNOW = (() => {
  let a = 31;
  const rnd = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  const W = 1200;
  const H = 12;
  let d = `M0 ${H} L0 ${H - 3}`;
  let x = 0;
  while (x < W) {
    const w = 25 + rnd() * 90;
    const top = H - 3 - (1.5 + rnd() * 6.5);
    const nx = Math.min(W, x + w);
    // 둔덕 하나: 왼쪽 비탈 → 꼭대기 → 오른쪽 비탈 (비대칭)
    const peak = x + w * (0.3 + rnd() * 0.4);
    d += ` C ${x + (peak - x) * 0.4} ${H - 3} ${peak - w * 0.18} ${top} ${peak} ${top}`;
    d += ` C ${peak + w * 0.2} ${top} ${nx - (nx - peak) * 0.35} ${H - 3 - rnd() * 1.5} ${nx} ${H - 2.5 - rnd() * 1.5}`;
    x = nx;
  }
  return { d: `${d} L${W} ${H} Z`, W, H };
})();

/** 머리줄 배경: 금색 아이콘을 내용과 상관없이 흩어 놓고 (별은 반짝임), 아래 테두리에 눈이 쌓여 있다 */
function HeaderOrnaments() {
  const items: { C: typeof GoldTree; left: string; top: string; size: number; o: number; rot: number }[] = [
    { C: GoldStar, left: '7%', top: '14%', size: 12, o: 0.5, rot: -14 },
    { C: GoldBulb, left: '19%', top: '62%', size: 19, o: 0.32, rot: 24 },
    { C: GoldTree, left: '38%', top: '30%', size: 32, o: 0.3, rot: -4 },
    { C: GoldStar, left: '51%', top: '76%', size: 15, o: 0.55, rot: 9 },
    { C: GoldGift, left: '66%', top: '20%', size: 18, o: 0.3, rot: -12 },
    { C: GoldStar, left: '83%', top: '84%', size: 11, o: 0.5, rot: 30 },
    { C: GoldStar, left: '94%', top: '26%', size: 16, o: 0.55, rot: -6 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {items.map(({ C, left, top, size, o, rot }, i) => (
        // 바깥은 위치·진하기, 안쪽은 반짝임 (반짝임이 진하기를 덮어쓰지 않게)
        <span key={i} className="absolute" style={{ left, top, opacity: o, transform: `translate(-50%,-50%) rotate(${rot}deg)` }}>
          <span className="bulb block" style={{ animationDelay: `${(i * 0.83) % 2.4}s`, animationDuration: `${2.2 + (i % 3) * 0.5}s` }}>
            <C size={size} />
          </span>
        </span>
      ))}
      <svg viewBox={`0 0 ${HEADER_SNOW.W} ${HEADER_SNOW.H}`} preserveAspectRatio="none" className="absolute right-0 bottom-0 left-0 h-[10px] w-full">
        <defs>
          <linearGradient id="hsnow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6f9fc" stopOpacity="0.85" />
            <stop offset="1" stopColor="#cfdbe6" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <path d={HEADER_SNOW.d} fill="url(#hsnow)" />
      </svg>
    </div>
  );
}

/** 사이드바 빈 공간의 은하수 트리. 앱을 켜면 그려지고, 탭을 바꿀 때마다 빛이 나선을 타고 올라간다 */
function SidebarTree() {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tab = useStore((s) => s.tab);
  const introOn = useStore((s) => s.introOn);
  const [pulse, setPulse] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 탭이 실제로 바뀔 때만 (StrictMode의 두 번 실행에도 처음에는 안 올라가게 이전 탭과 비교)
  const seenTab = useRef(tab);
  useEffect(() => {
    if (seenTab.current === tab) return;
    seenTab.current = tab;
    setPulse((n) => n + 1);
  }, [tab]);
  // 가로:세로 비율을 늘 같게 (공간이 길어져도 홀쭉해지지 않게): 폭이 모자라면 높이를 줄인다
  const RATIO = 0.8;
  const h = Math.round(Math.min(size.h - 24, 300, size.w / RATIO));
  return (
    <div ref={box} className="flex min-h-0 flex-1 items-end justify-center overflow-hidden py-3">
      {h >= 80 && size.w > 0 && <SpiralTree width={Math.round(h * RATIO)} height={h} pulse={pulse} build={2600} paused={introOn} />}
    </div>
  );
}

/** 크리스마스 테마를 켤 때: 화면 가득 은하수 트리가 감아 올라가고, 다 그려지면 인사가 뜬다. 누를 때까지 떠 있다 */
function ChristmasIntro({ onDone }: { onDone: () => void }) {
  const [built, setBuilt] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // 테마 색이 바뀌는 순간(App이 120ms 뒤에 바꾼다)의 멈칫이 지난 다음에 트리를 그리기 시작한다
  const [start, setStart] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStart(true), 380);
    return () => clearTimeout(t);
  }, []);
  const h = Math.round(window.innerHeight * 0.62);
  // 저절로 닫히지 않는다: 누르면 부드럽게 사라진 뒤 닫힌다
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDone, 500);
  };
  return (
    <div
      onClick={close}
      className={`fixed inset-0 z-[80] flex cursor-pointer flex-col items-center justify-center transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'radial-gradient(60% 60% at 50% 55%, rgb(16 40 28 / 0.94), rgb(6 12 9 / 0.97))' }}
    >
      {start ? <SpiralTree width={Math.round(h * 0.72)} height={h} build={2300} density={1.05} onBuilt={() => setBuilt(true)} /> : <div style={{ width: Math.round(h * 0.72), height: h }} />}
      <div className={`mt-5 text-center transition-all duration-700 ${built ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
        <div className="text-[30px] tracking-wide text-gold" style={{ fontFamily: "'Gowun Batang', serif" }}>
          Merry Christmas
        </div>
        <div className="mt-1 text-[12px] text-muted">아무 곳이나 눌러서 닫기</div>
      </div>
    </div>
  );
}

const christmasTheme: ThemeDef = {
  id: 'christmas',
  name: '크리스마스',
  Background: ChristmasBackground,
  greeting: (p, now) => {
    const md = dateStr(now).slice(5);
    if (md === '12-25') return '메리 크리스마스!';
    if (md === '12-24' && (p === 'evening' || p === 'night')) return '크리스마스 이브예요';
    return XMAS_GREETING[p];
  },
  subline: (now) => {
    const d = daysToChristmas(now);
    if (d === 0) return '오늘은 크리스마스';
    if (d === 1) return '내일은 크리스마스';
    return `크리스마스까지 ${d}일`;
  },
  TaskCheck: SparkleCheck,
  CardDecor: CardGarland,
  HeaderDecor: HeaderOrnaments,
  heatFull: (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden className="twinkle-soft block" style={{ overflow: 'visible', filter: 'drop-shadow(0 0 2.5px rgb(233 196 106 / 0.8))' }}>
      <path d="M6 0.3l1.65 3.65 3.95.4-2.95 2.65.85 3.9L6 8.95l-3.5 1.95.85-3.9L.4 4.35l3.95-.4z" fill="#f3d27a" />
    </svg>
  ),
  calendar: {
    Frame: XmasCalFrame,
    weekHeadClass: 'xcal-weekhead',
    cellClass: xmasCellClass,
    todayRing: (size) => <Wreath size={size} />,
    todayNumClass: 'font-bold text-gold',
    cellDecor: xmasCellDecor,
  },
  SidebarFeature: SidebarTree,
  Intro: ChristmasIntro,
  headingIcons: [<GoldTree key="t" size={15} />, <GoldStar key="s" size={14} />, <GoldBulb key="b" size={14} />, <GoldGift key="g" size={14} />],
  dayMark: (date) => (date.endsWith('-12-25') ? <GoldTree size={12} /> : null),
  emptyArt: (
    <span className="mr-1.5 inline-block align-[-2px] text-gold/80">
      <Snowflake size={13} />
    </span>
  ),
};

export const THEMES: Record<ThemeId, ThemeDef> = { default: defaultTheme, christmas: christmasTheme };

export function useTheme(): ThemeDef {
  const id = useStore((s) => s.prefs?.theme ?? 'default');
  return THEMES[id] ?? defaultTheme;
}
