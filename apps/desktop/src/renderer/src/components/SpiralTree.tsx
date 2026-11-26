import { useEffect, useRef } from 'react';

/**
 * 은하수 나선 트리. 흰 빛 입자들이 두 갈래 나선을 타고 아래에서 위로 감아 올라가며 원뿔(트리)을 그리고,
 * 다 그려지면 꼭대기에 금색 별이 뜬 뒤 전체가 천천히 돌며 반짝인다.
 *
 * - build: 그려지는 데 걸리는 시간(ms). 0이면 처음부터 완성본.
 * - pulse: 값이 바뀔 때마다 밝은 빛 하나가 나선을 타고 올라가 별을 반짝이게 한다 (화면 전환 신호).
 */
export function SpiralTree({ width, height, build = 2400, pulse = 0, density = 1, paused = false, onBuilt }: { width: number; height: number; build?: number; pulse?: number; density?: number; paused?: boolean; onBuilt?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pulseAt = useRef<number | null>(null);
  // 크기가 바뀌어 다시 그려도 그리던 진행은 이어간다.
  // 시작 시각은 처음 그린 프레임에서 정한다: 테마 전환처럼 화면 전체가 잠깐 멈추는 동안 진행이 건너뛰지 않게
  const startAt = useRef<number | null>(null);
  // 마지막으로 본 pulse 값: 값이 실제로 바뀔 때만 빛을 올린다
  // ('처음은 건너뛰기' 방식은 개발 모드 StrictMode가 effect를 두 번 실행하면 첫 화면에서 빛이 올라가 버린다)
  const seenPulse = useRef(pulse);
  const builtCb = useRef(onBuilt);
  builtCb.current = onBuilt;
  // 가려져 있을 때는 그리지 않는다 (다시 보이면 이어서)
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (seenPulse.current === pulse) return;
    seenPulse.current = pulse;
    pulseAt.current = performance.now();
  }, [pulse]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width < 10 || height < 10) return;
    // 고해상도 화면에서 픽셀 수가 폭증하지 않게 해상도 배율은 1.5까지 (빛 번짐이라 차이가 거의 안 보인다)
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const buildMs = still ? 0 : build;

    // 빛 한 점: 미리 그려 둔 원형 그라데이션을 크기만 바꿔 찍는다
    const sprite = (rgb: string) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${rgb},1)`);
      grad.addColorStop(0.18, `rgba(${rgb},0.85)`);
      grad.addColorStop(0.45, `rgba(${rgb},0.22)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return c;
    };
    const WHITE = sprite('255,252,240');
    const COOL = sprite('210,230,255');
    const GOLD = sprite('245,205,110');

    // 트리 모양
    const cx = width / 2;
    const top = Math.max(14, height * 0.09);
    const base = height * 0.95;
    const H = base - top;
    const R = Math.min(width * 0.44, H * 0.42);
    const TURNS = 5.2;

    // 입자: 두 갈래 나선 + 원뿔 안의 흐린 먼지. 아래쪽이 넓으니 아래에 더 많이 둔다
    const rnd = mulberry(7);
    const n = Math.round(Math.min(620, Math.max(190, (width * height) / 46)) * density);
    type P = { t: number; arm: number; da: number; dr: number; dy: number; s: number; ph: number; sp: number; spr: HTMLCanvasElement; dust: boolean };
    const ps: P[] = [];
    for (let i = 0; i < n; i++) {
      const dust = i % 5 === 4;
      const t = 1 - Math.sqrt(1 - rnd() * 0.985);
      ps.push({
        t,
        arm: i % 2,
        da: dust ? rnd() * Math.PI * 2 : (rnd() - 0.5) * 0.5,
        dr: dust ? rnd() * 0.85 : (rnd() - 0.5) * 0.16,
        dy: (rnd() - 0.5) * (dust ? 10 : 4),
        s: dust ? 2 + rnd() * 3 : 3 + rnd() * 5.5,
        ph: rnd() * Math.PI * 2,
        sp: 1.2 + rnd() * 2.8,
        spr: rnd() < 0.82 ? WHITE : rnd() < 0.6 ? COOL : GOLD,
        dust,
      });
    }
    // 입자 크기도 트리 높이에 비례: 사이드바 작은 트리(H≈160)에서 0.55, 커지면 같은 비율로 커진다
    const scale = Math.min(1.25, H / 290);

    let built = buildMs === 0;
    if (built) builtCb.current?.();
    let raf = 0;
    let last = 0;

    const pos = (t: number, arm: number, da: number, dr: number, rot: number) => {
      const a = t * TURNS * Math.PI * 2 + arm * Math.PI + rot + da;
      const r = R * (1 - t) * (1 + dr);
      return { x: cx + r * Math.cos(a), z: Math.sin(a), y: base - t * H };
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 30fps면 충분하다
      if (now - last < 32 || pausedRef.current) return;
      if (startAt.current === null) startAt.current = now;
      // 그리는 도중 화면 전체가 멈췄다면(직전 프레임이 200ms 넘게 걸림) 멈춘 시간만큼 시작을 미룬다
      else if (last && now - last > 200 && now - startAt.current < buildMs) startAt.current += now - last - 32;
      last = now;
      const el = now - startAt.current;
      const p = buildMs ? easeInOut(Math.min(1, Math.max(0, el / buildMs))) : 1;
      if (!built && p >= 1) {
        built = true;
        builtCb.current?.();
      }
      const rot = still ? 0 : now / 9500;
      const pt = pulseAt.current === null ? -1 : (now - pulseAt.current) / 1300;
      if (pt > 1.6) pulseAt.current = null;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (const q of ps) {
        if (q.t > p) continue;
        const { x, y, z } = pos(q.t, q.arm, q.da, q.dr, rot);
        const depth = (z + 1) / 2; // 0 = 뒤, 1 = 앞
        const tw = still ? 0.8 : 0.55 + 0.45 * Math.sin(now / 1000 * q.sp + q.ph);
        let a = (q.dust ? 0.28 : 0.42 + 0.58 * depth) * tw;
        let s = q.s * scale * (0.55 + 0.6 * depth);
        // 막 그려진 입자는 잠깐 더 밝게
        const fresh = p - q.t;
        if (p < 1 && fresh < 0.06) {
          a = Math.min(1, a + (0.06 - fresh) * 12);
          s *= 1 + (0.06 - fresh) * 8;
        }
        // 화면 전환 빛이 지나가는 자리
        if (pt >= 0 && pt <= 1) {
          const d = Math.abs(q.t - pt);
          if (d < 0.07) {
            a = Math.min(1, a + (0.07 - d) * 10);
            s *= 1 + (0.07 - d) * 6;
          }
        }
        if (a < 0.04) continue; // 거의 안 보이는 입자는 건너뛴다
        ctx.globalAlpha = a;
        ctx.drawImage(q.spr, x - s, y - s, s * 2, s * 2);
      }

      // 그리는 중인 머리 (혜성)
      const head = (t: number, k: number) => {
        for (const arm of [0, 1]) {
          const { x, y } = pos(t, arm, 0, 0, rot);
          const s = 13 * scale * k;
          ctx.globalAlpha = 0.95;
          ctx.drawImage(WHITE, x - s, y - s, s * 2, s * 2);
        }
      };
      if (p < 1) head(p, 1);
      if (pt >= 0 && pt <= 1) head(pt, 0.8);

      // 꼭대기 별
      if (p >= 1 || p > 0.97) {
        const k = Math.min(1, (el - buildMs) / 500 + (p >= 1 ? 0 : 0));
        const pop = buildMs ? easeOutBack(Math.max(0, Math.min(1, k))) : 1;
        const flash = pt > 0.9 && pt < 1.6 ? 1 - Math.abs(pt - 1.1) / 0.5 : 0;
        const glow = 0.75 + 0.25 * Math.sin(now / 700) + Math.max(0, flash) * 0.6;
        const sy = top + H * 0.05; // 꼭대기는 입자가 드물어서 별을 조금 내린다
        // 별 크기는 트리 높이에 비례 (트리가 커지면 별도 같이 커진다)
        const starR = H * 0.046;
        const gs = starR * 3.3 * pop * (1 + Math.max(0, flash) * 0.5);
        ctx.globalAlpha = Math.min(1, 0.55 * glow);
        ctx.drawImage(GOLD, cx - gs, sy - gs, gs * 2, gs * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        drawStar(ctx, cx, sy, starR * pop, '#f6d47a');
        ctx.globalCompositeOperation = 'lighter';
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (still) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, build, density]);

  return <canvas ref={ref} style={{ width, height }} aria-hidden />;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  if (r <= 0) return;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(246,212,122,0.9)';
  ctx.shadowBlur = r * 1.6;
  ctx.fill();
  ctx.shadowBlur = 0;
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

/** 매번 같은 모양이 나오게 고정 시드 난수 */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
