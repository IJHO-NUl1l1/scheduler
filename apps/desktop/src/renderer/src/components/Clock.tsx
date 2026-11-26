import { useEffect, useState } from 'react';

function useTick(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * 아날로그 시계: 배경 없음, 숫자 대신 막대 눈금(3·6·9·12시는 긴 막대), 흰 시침·분침. 초침 없음.
 */
export function AnalogClock({ size = 120 }: { size?: number }) {
  const now = useTick(10_000);
  const m = now.getMinutes() + now.getSeconds() / 60;
  const h = (now.getHours() % 12) + m / 60;
  const hand = (deg: number, len: number, w: number) => (
    <line x1="50" y1="50" x2="50" y2={50 - len} stroke="var(--clock-hand)" strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg} 50 50)`} />
  );
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${now.getHours()}시 ${now.getMinutes()}분`}>
      {Array.from({ length: 12 }, (_, i) => {
        const long = i % 3 === 0;
        return (
          <line
            key={i}
            x1="50"
            y1="3"
            x2="50"
            y2={long ? 15 : 9}
            stroke="var(--clock-hand)"
            strokeWidth={long ? 3 : 2}
            strokeLinecap="round"
            opacity={long ? 1 : 0.55}
            transform={`rotate(${i * 30} 50 50)`}
          />
        );
      })}
      {hand(h * 30, 23, 4.6)}
      {hand(m * 6, 35, 3.4)}
      <circle cx="50" cy="50" r="3" fill="var(--clock-hand)" />
    </svg>
  );
}

/** 디지털 시계: 배경 없이 시·분만 (초 없음). 글자 크기는 자리 크기에 맞춘다 */
export function DigitalClock({ size = 120 }: { size?: number }) {
  const now = useTick(5000);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <span className="font-light text-ink tabular-nums leading-none" style={{ fontSize: Math.round(size * 0.46), letterSpacing: '-0.04em' }}>
      {hh}
      <span className="animate-pulse opacity-60">:</span>
      {mm}
    </span>
  );
}

/**
 * 시계. 디지털/아날로그를 바꿔도 바깥 크기(size × size)는 그대로이고 안쪽만 바뀐다.
 */
export function Clock({ style, size = 120 }: { style: 'digital' | 'analog'; size?: number }) {
  return (
    <div className="mx-auto flex items-center justify-center" style={{ width: size, height: size }}>
      {style === 'analog' ? <AnalogClock size={size} /> : <DigitalClock size={size} />}
    </div>
  );
}
