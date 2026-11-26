import type { Weather } from '@shared/api';

/** WMO 날씨 코드 → 이름, 그림 종류 */
export function weatherInfo(code: number, isDay: boolean): { label: string; kind: 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' } {
  if (code === 0) return { label: '맑음', kind: isDay ? 'sun' : 'moon' };
  if (code <= 2) return { label: code === 1 ? '대체로 맑음' : '구름 조금', kind: 'partly' };
  if (code === 3) return { label: '흐림', kind: 'cloud' };
  if (code === 45 || code === 48) return { label: '안개', kind: 'fog' };
  if (code >= 51 && code <= 57) return { label: '이슬비', kind: 'rain' };
  if (code >= 61 && code <= 67) return { label: '비', kind: 'rain' };
  if (code >= 71 && code <= 77) return { label: '눈', kind: 'snow' };
  if (code >= 80 && code <= 82) return { label: '소나기', kind: 'rain' };
  if (code === 85 || code === 86) return { label: '눈 소나기', kind: 'snow' };
  if (code >= 95) return { label: '뇌우', kind: 'storm' };
  return { label: '—', kind: 'cloud' };
}

/** 선으로만 그린 날씨 그림 */
export function WeatherIcon({ kind, size = 28 }: { kind: ReturnType<typeof weatherInfo>['kind']; size?: number }) {
  const cloud = 'M7 17h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 9.5 3.75 3.75 0 0 0 7 17z';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      {kind === 'sun' && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
        </>
      )}
      {kind === 'moon' && <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />}
      {kind === 'partly' && (
        <>
          <path d="M9 5.5V4M4.5 9H3M5.3 5.3l1 1M13 6.2l1-1" />
          <path d="M6.2 11.2A3.5 3.5 0 0 1 12.4 8" />
          <path d="M9 19h8a3.5 3.5 0 0 0 .4-6.98A4.8 4.8 0 0 0 8.4 13 3 3 0 0 0 9 19z" />
        </>
      )}
      {kind === 'cloud' && <path d={cloud} />}
      {kind === 'fog' && <path d="M4 9h16M6 13h12M4 17h16" />}
      {kind === 'rain' && (
        <>
          <path d="M7 14h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 6.5 3.75 3.75 0 0 0 7 14z" />
          <path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" />
        </>
      )}
      {kind === 'snow' && (
        <>
          <path d="M7 14h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 6.5 3.75 3.75 0 0 0 7 14z" />
          <path d="M8 18h.01M12 19h.01M16 18h.01M10 21h.01M14 21h.01" strokeWidth={2.2} />
        </>
      )}
      {kind === 'storm' && (
        <>
          <path d="M7 14h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 6.5 3.75 3.75 0 0 0 7 14z" />
          <path d="M12.5 15l-2 3.5h3l-2 3.5" />
        </>
      )}
    </svg>
  );
}

export function WeatherBlock({ weather, error, onRetry, onOpenSettings }: { weather: Weather | null; error: string | null; onRetry: () => void; onOpenSettings: () => void }) {
  if (!weather) {
    return (
      <button type="button" onClick={error ? onRetry : onOpenSettings} className="w-full text-left text-[11px] text-faint hover:text-muted">
        {error ? `날씨를 못 불러옴 · 다시 시도` : '날씨 불러오는 중…'}
      </button>
    );
  }
  const info = weatherInfo(weather.code, weather.isDay);
  return (
    <button type="button" onClick={onOpenSettings} title={`${weather.place} · 체감 ${weather.feels}° · 지역 바꾸기`} className="flex w-full items-center gap-3 text-left">
      <span className="text-ink">
        <WeatherIcon kind={info.kind} size={30} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="tabular text-[22px] leading-none font-light tracking-tight">{weather.temp}°</span>
          <span className="truncate text-[12px] text-muted">{info.label}</span>
        </span>
        <span className="tabular mt-1 block truncate text-[10.5px] text-faint">
          {weather.place} · {weather.max}° / {weather.min}°{weather.rain !== null ? ` · 비 ${weather.rain}%` : ''}
        </span>
      </span>
    </button>
  );
}
