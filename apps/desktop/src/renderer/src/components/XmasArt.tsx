import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * 크리스마스 테마의 그림 조각들: 호랑가시, 리본(위젯 모서리), 눈 덮인 가장자리, 눈밭,
 * 그리고 크리스마스 달력 틀(XmasCalFrame)과 칸 장식(xmasCellDecor).
 * 달력은 위아래 눈만 또렷하고, 나머지는 가는 금선·글자로 은은하게 표현한다.
 */

export const BULBS = ['#e04048', '#e9c46a', '#3fae66', '#f4efe2'];

export function hashOf(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** 호랑가시 잎 두 장 + 빨간 열매 (약 28×18) */
export function Holly() {
  return (
    <g>
      <path d="M0 0 Q7 -6.5 15 -1.5 Q11 -0.5 9.5 2.5 Q5 0.5 0 0z" fill="#2f8a52" transform="translate(13 9) rotate(-18)" />
      <path d="M0 0 Q7 -6.5 15 -1.5 Q11 -0.5 9.5 2.5 Q5 0.5 0 0z" fill="#277446" transform="translate(13 9) rotate(200) scale(1 -1)" />
      <path d="M13 9 l9 -3.6 M13 9 l-8.6 -3" stroke="#1b5233" strokeWidth="0.8" strokeLinecap="round" />
      <circle cx="12" cy="11.6" r="2.5" fill="#d6393f" />
      <circle cx="15.6" cy="10.4" r="2.2" fill="#c32f36" />
      <circle cx="13.6" cy="8.2" r="2" fill="#e04048" />
      <circle cx="11.3" cy="10.8" r="0.7" fill="#fff" opacity="0.7" />
    </g>
  );
}

/** 금색 리본 (약 28×18) */
export function Bow() {
  return (
    <g stroke="var(--gold)" strokeWidth="1.2" strokeLinejoin="round" fill="rgb(233 196 106 / 0.22)">
      <path d="M14 8 Q6 1 5 7 Q6 12 14 8z" />
      <path d="M14 8 Q22 1 23 7 Q22 12 14 8z" />
      <path d="M13 9 L9.5 16.5 M15 9 L18.5 16.5" fill="none" strokeLinecap="round" />
      <circle cx="14" cy="8" r="1.8" fill="var(--gold)" stroke="none" />
    </g>
  );
}

/** 오늘 날짜를 두르는 작은 화환 */
export function Wreath({ size = 32 }: { size?: number }) {
  const n = 16;
  const r = 12.2;
  return (
    <svg viewBox="-16 -16 32 32" width={size} height={size} aria-hidden className="pointer-events-none">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 360;
        return <ellipse key={i} cx={0} cy={-r} rx={3.4} ry={1.7} fill={i % 2 ? '#2f8a52' : '#3fae66'} transform={`rotate(${a}) rotate(${i % 2 ? 28 : -28} 0 ${-r})`} />;
      })}
      {[-40, 0, 40, 150, 200, 250].map((a, i) => (
        <circle key={a} cx={0} cy={-r} r={i < 3 ? 1.3 : 1} fill={i % 2 ? '#e9c46a' : '#e04048'} transform={`rotate(${a + 180})`} />
      ))}
      <g transform="translate(0 12.5) scale(0.42) translate(-14 -8)">
        <path d="M14 8 Q6 1 5 7 Q6 12 14 8z M14 8 Q22 1 23 7 Q22 12 14 8z" fill="#d6393f" />
        <path d="M13 9 L9.5 16.5 M15 9 L18.5 16.5" stroke="#d6393f" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="14" cy="8" r="2" fill="#e9c46a" />
      </g>
    </svg>
  );
}

/** 가로로 늘어진 전구 줄. 은은하게 (흐린 전구, 작은 빛) */
function LightString({ w, y = 0 }: { w: number; y?: number }) {
  const swags = Math.max(2, Math.round(w / 130));
  const sw = w / swags;
  const sag = 11;
  const per = 4;
  const wire = `M0 ${y} ${Array.from({ length: swags }, (_, i) => `Q ${(i + 0.5) * sw} ${y + sag * 2} ${(i + 1) * sw} ${y}`).join(' ')}`;
  const bulbs: { x: number; y: number; c: string; d: string }[] = [];
  let k = 0;
  for (let i = 0; i < swags; i++) {
    for (let j = 1; j <= per; j++) {
      const t = j / (per + 1);
      bulbs.push({ x: i * sw + t * sw, y: y + 2 * (1 - t) * t * sag * 2, c: BULBS[k % BULBS.length]!, d: `${((k * 0.47) % 2.4).toFixed(2)}s` });
      k++;
    }
  }
  return (
    <svg aria-hidden width={w} height={y + sag + 14} className="pointer-events-none absolute top-0 left-0 z-[2]">
      <path d={wire} fill="none" stroke="#2a5239" strokeWidth="1.1" />
      {bulbs.map((b, i) => (
        <g key={i} className="bulb" style={{ animationDelay: b.d }}>
          <circle cx={b.x} cy={b.y + 5} r={6.5} fill={b.c} opacity={0.07} />
          <rect x={b.x - 1.3} y={b.y - 0.3} width={2.6} height={2.2} rx={0.5} fill="#8f7742" opacity={0.8} />
          <ellipse cx={b.x} cy={b.y + 4.6} rx={2.2} ry={3.2} fill={b.c} opacity={0.6} />
        </g>
      ))}
    </svg>
  );
}

function Snowflake({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M4.2 10.6l3.3.9-.9-3.3M19.8 13.4l-3.3-.9.9 3.3M4.2 13.4l3.3-.9-.9 3.3M19.8 10.6l-3.3.9.9-3.3" />
    </svg>
  );
}

/** 틀 위쪽에 소복이 쌓인 눈 + 고드름. k = 크기 배율 (위젯은 작게) */
function SnowCap({ w, k = 1 }: { w: number; k?: number }) {
  const rnd = seeded(11);
  const step = 16 * k;
  const pts: string[] = [`M0 0 L0 ${6 * k}`];
  for (let x = step; x <= w + step; x += step) {
    const xx = Math.min(x, w);
    const y = (5 + rnd() * 6) * k;
    pts.push(`Q ${xx - step / 2} ${y + (4 + rnd() * 3) * k} ${xx} ${y}`);
    // 가끔 고드름
    if (rnd() < 0.22 && xx < w - 8) {
      const len = (5 + rnd() * 8) * k;
      pts.push(`L ${xx + 1.6 * k} ${y + len} L ${xx + 3.2 * k} ${y + 0.5}`);
    }
  }
  pts.push(`L ${w} 0 Z`);
  const d = pts.join(' ');
  return (
    <svg aria-hidden width={w} height={26 * k} className="pointer-events-none absolute top-0 left-0 z-[3]">
      <path d={d} fill="#c9d6e2" transform={`translate(0 ${1.6 * k})`} opacity="0.5" />
      <path d={d} fill="#f2f6fb" />
    </svg>
  );
}

/** 틀 바닥의 눈밭: 큰 달력은 작은 트리 실루엣·선물 상자가 양쪽 끝에 모여 있다 */
function SnowGround({ w, k = 1, trees = true }: { w: number; k?: number; trees?: boolean }) {
  const h = 30 * k;
  const rnd = seeded(23);
  const span = 60 * k;
  let ground = `M0 ${h} L0 ${h - 9 * k}`;
  for (let x = 0; x < w; x += span) {
    const x2 = Math.min(w, x + span);
    ground += ` Q ${x + span / 2} ${h - (15 + rnd() * 6) * k} ${x2} ${h - (8 + rnd() * 3) * k}`;
  }
  ground += ` L ${w} ${h} Z`;
  const tr = trees ? [0.03, 0.065, 0.95, 0.975].map((f, i) => ({ x: f * w, s: i % 2 ? 0.8 : 1.15 })) : [];
  const gifts = trees
    ? [
        { x: 0.11 * w, c: '#d6393f', r: '#e9c46a', s: 1 },
        { x: 0.905 * w, c: '#2f8a52', r: '#e9c46a', s: 1 },
        { x: 0.92 * w, c: '#e9c46a', r: '#d6393f', s: 0.7 },
      ]
    : [];
  return (
    <svg aria-hidden width={w} height={h + 40} className="pointer-events-none absolute bottom-0 left-0 z-[2]" style={{ overflow: 'visible' }}>
      <g transform="translate(0 40)">
        {tr.map((t, i) => (
          <g key={i} transform={`translate(${t.x} ${h - 10 * k}) scale(${t.s * Math.max(k, 0.55)})`}>
            <path d="M0 -34 L11 -12 L5 -12 L13 0 L-13 0 L-5 -12 L-11 -12 Z" fill="#1d4a30" />
            <path d="M0 -34 L5 -24 L1 -25 L-2 -23 L-5 -24 Z M-8 -12 L-5 -12 L-2 -14 L2 -12.5 L8 -12 L5 -15 L-5 -15 Z" fill="#eef3f8" opacity="0.9" />
            <circle cx={-4} cy={-7} r={1.3} fill="#e04048" className="bulb" />
            <circle cx={4} cy={-17} r={1.2} fill="#e9c46a" className="bulb" style={{ animationDelay: '0.8s' }} />
            <circle cx={5} cy={-5} r={1.2} fill="#e9c46a" className="bulb" style={{ animationDelay: '1.5s' }} />
            <path d="M0 -38.5 l1.2 2.4 2.6.3-1.9 1.8.5 2.6L0 -32.6l-2.4 1.3.5-2.6-1.9-1.8 2.6-.3z" fill="#e9c46a" />
          </g>
        ))}
        {gifts.map((g, i) => (
          <g key={i} transform={`translate(${g.x} ${h - 9 * k}) scale(${g.s * Math.max(k, 0.55)})`}>
            <rect x={-8} y={-12} width={16} height={12} rx={1.2} fill={g.c} />
            <rect x={-9} y={-15} width={18} height={4} rx={1} fill={g.c} />
            <rect x={-1.3} y={-15} width={2.6} height={15} fill={g.r} />
            <path d="M0 -15 Q-6 -21 -6 -16.5 Q-4 -15 0 -15 Q6 -21 6 -16.5 Q4 -15 0 -15" fill="none" stroke={g.r} strokeWidth="1.4" />
          </g>
        ))}
        <path d={ground} fill="#e9eff6" />
        <path d={ground} fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.6" />
        {Array.from({ length: Math.round(w / 70) }, (_, i) => (
          <circle key={i} cx={rnd() * w} cy={h - 4 * k - rnd() * 5 * k} r={0.9} fill="#fff" className="bulb" style={{ animationDelay: `${(i * 0.7) % 2.4}s` }} />
        ))}
      </g>
    </svg>
  );
}

/** 틀 위 가운데의 월 표시: 가는 금선 사이에 글자만 */
function Banner({ month }: { month: string }) {
  const m = Number(month.slice(5, 7));
  return (
    <div className="pointer-events-none absolute top-[30px] left-1/2 z-[4] flex -translate-x-1/2 items-center gap-3 text-[#efe4d2]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <span className="h-px w-10 bg-gradient-to-l from-gold/50 to-transparent" />
      <span className="text-[17px] font-semibold">{m}월</span>
      <span className="h-px w-10 bg-gradient-to-r from-gold/50 to-transparent" />
    </div>
  );
}

/**
 * 크리스마스 달력 틀: 눈 덮인 윗변과 바닥 눈밭.
 * 위젯(compact)은 같은 눈을 작게 (월 표시는 위젯 머리에 있으니 뺀다).
 */
export function XmasCalFrame({ month, compact, children }: { month: string; compact?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useWidth(ref);
  if (compact) {
    return (
      <div ref={ref} className="xcal-frame relative overflow-hidden rounded-xl px-1.5 pt-[18px] pb-[18px]">
        {w > 0 && (
          <>
            <SnowCap w={w} k={0.6} />
            <SnowGround w={w} k={0.45} />
          </>
        )}
        <svg aria-hidden width="26" height="17" viewBox="0 0 28 18" className="pointer-events-none absolute top-[5px] right-[4px] z-[4] -scale-x-100 opacity-85">
          <Holly />
        </svg>
        <div className="relative z-[1]">{children}</div>
      </div>
    );
  }
  return (
    <div ref={ref} className="xcal-frame relative overflow-hidden rounded-2xl px-3 pt-[70px] pb-[48px]">
      {w > 0 && (
        <>
          <SnowCap w={w} />
          <LightString w={w} y={12} />
          <SnowGround w={w} />
        </>
      )}
      <Banner month={month} />
      <svg aria-hidden width="40" height="26" viewBox="0 0 28 18" className="pointer-events-none absolute top-[16px] left-[8px] z-[4] opacity-90">
        <Holly />
      </svg>
      <svg aria-hidden width="40" height="26" viewBox="0 0 28 18" className="pointer-events-none absolute top-[16px] right-[8px] z-[4] -scale-x-100 opacity-90">
        <Holly />
      </svg>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

/** 칸 배경: 색 차이는 아주 작게 */
export function xmasCellClass(date: string, inMonth: boolean): string {
  if (!inMonth) return 'xcal-cell xcal-out';
  if (date.endsWith('-12-25')) return 'xcal-cell xcal-xmas';
  if (date.endsWith('-12-24')) return 'xcal-cell xcal-eve';
  return 'xcal-cell';
}

/**
 * 칸 장식 (칸 내용 뒤).
 * - 12/24: 오른쪽 위에 흐린 금빛 D-1
 * - 12/24: "Christmas Eve", 12/25: 흐린 트리 선 + "Merry Christmas"
 * - 그 밖: 군데군데 아주 흐린 눈송이
 */
export function xmasCellDecor(date: string, { inMonth, compact }: { today: string; inMonth: boolean; compact: boolean }): ReactNode {
  const md = date.slice(5);
  const day = Number(date.slice(8));
  const script = { fontFamily: "'Gowun Batang', serif" };
  if (inMonth && md.startsWith('12-') && day <= 24) {
    if (compact) return null;
    return (
      <>
        {md === '12-24' && (
          <span className="tabular absolute top-2 right-2 text-[10px] tracking-wide text-gold/60" style={script}>
            <span className="mr-0.5 text-[8px]">✦</span>D-1
          </span>
        )}
        {md === '12-24' && (
          <span className="absolute right-2 bottom-1.5 text-[11px] text-gold/60 italic" style={script}>
            Christmas Eve
          </span>
        )}
      </>
    );
  }
  if (inMonth && md === '12-25') {
    if (compact) return null;
    return (
      <>
        <svg viewBox="0 0 24 24" width="54" height="54" className="absolute right-1.5 bottom-5 opacity-20" fill="none" stroke="var(--gold)" strokeWidth="1" strokeLinejoin="round" aria-hidden>
          <path d="M12 2.2l.9 1.9 2 .3-1.5 1.4.4 2L12 6.8l-1.8 1 .4-2-1.5-1.4 2-.3z" />
          <path d="M12 8.6L8 13.4h2.4L6.4 18.6h11.2l-4-5.2H16z" />
          <path d="M12 18.6v2.8" />
        </svg>
        <span className="absolute right-2 bottom-1.5 text-[11px] text-gold/75" style={script}>
          Merry Christmas
        </span>
      </>
    );
  }
  if (hashOf(date) % 6 === 0) {
    return (
      <span className={`absolute text-white opacity-[0.06] ${compact ? 'right-0.5 bottom-0.5' : 'right-1.5 bottom-1.5'}`}>
        <Snowflake size={compact ? 14 : 30} />
      </span>
    );
  }
  return null;
}
