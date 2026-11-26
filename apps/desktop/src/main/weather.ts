import type { Weather } from '../shared/api';
import { loadSettings, saveSettings } from './settings';

/**
 * 날씨: Open-Meteo (키 필요 없음). 지역 이름 → 좌표는 처음 한 번만 찾고 설정에 저장한다.
 * 보내는 정보는 도시 이름과 좌표뿐이다. 30분 동안 캐시.
 */

let cache: { at: number; key: string; value: Weather } | null = null;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Scheduler-desktop' } });
  if (!r.ok) throw new Error(`날씨 서버 응답 ${r.status}`);
  return (await r.json()) as T;
}

/** 자주 쓰는 도시는 바로 좌표로 (한글 짧은 이름은 검색이 부정확해서) */
const CITIES: Record<string, [number, number]> = {
  서울: [37.566, 126.978], 부산: [35.18, 129.075], 대구: [35.871, 128.601], 인천: [37.456, 126.705], 광주: [35.16, 126.851],
  대전: [36.351, 127.385], 울산: [35.539, 129.311], 세종: [36.48, 127.289], 수원: [37.278, 127.032], 성남: [37.42, 127.127],
  고양: [37.658, 126.832], 용인: [37.241, 127.178], 창원: [35.228, 128.681], 청주: [36.642, 127.489], 전주: [35.824, 127.148],
  천안: [36.815, 127.114], 포항: [36.019, 129.343], 제주: [33.5, 126.531], 춘천: [37.881, 127.73], 강릉: [37.752, 128.876],
  원주: [37.342, 127.92], 김해: [35.234, 128.881], 안산: [37.322, 126.831], 안양: [37.394, 126.957], 화성: [37.2, 126.831],
  평택: [36.992, 127.113], 의정부: [37.738, 127.034], 파주: [37.76, 126.78], 김포: [37.615, 126.716], 시흥: [37.38, 126.803],
  남양주: [37.636, 127.216], 구미: [36.12, 128.344], 목포: [34.812, 126.392], 여수: [34.76, 127.662], 순천: [34.951, 127.488],
};

type GeoHit = { latitude: number; longitude: number; name: string; feature_code?: string; country_code?: string };

async function locate(): Promise<{ lat: number; lon: number; place: string }> {
  const s = loadSettings();
  if (s.weatherLat !== undefined && s.weatherLon !== undefined) return { lat: s.weatherLat, lon: s.weatherLon, place: s.weatherPlace ?? s.weatherCity };
  const name = s.weatherCity.trim().replace(/(특별시|광역시|특별자치시|특별자치도|시|군)$/, '');
  const known = CITIES[name];
  if (known) {
    saveSettings({ weatherLat: known[0], weatherLon: known[1], weatherPlace: name });
    return { lat: known[0], lon: known[1], place: name };
  }
  // 검색: 시·도급 지명을 우선
  const search = async (q: string) =>
    (await getJson<{ results?: GeoHit[] }>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=ko&format=json`)).results ?? [];
  const results = [...(await search(s.weatherCity)), ...(await search(`${name}시`))];
  const rank = (h: GeoHit) => (h.country_code === 'KR' ? 0 : 10) + ({ PPLC: 0, PPLA: 1, PPLA2: 2, PPLA3: 3 }[h.feature_code ?? ''] ?? 5);
  const hit = results.sort((a, b) => rank(a) - rank(b))[0];
  if (!hit) throw new Error(`"${s.weatherCity}" 지역을 찾지 못함`);
  saveSettings({ weatherLat: hit.latitude, weatherLon: hit.longitude, weatherPlace: hit.name });
  return { lat: hit.latitude, lon: hit.longitude, place: hit.name };
}

export async function getWeather(force = false): Promise<Weather> {
  const { lat, lon, place } = await locate();
  const key = `${lat},${lon}`;
  if (!force && cache && cache.key === key && Date.now() - cache.at < 30 * 60_000) return cache.value;
  const j = await getJson<{
    current: { temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number };
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
  }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,apparent_temperature,weather_code,is_day' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto',
  );
  const value: Weather = {
    place,
    temp: Math.round(j.current.temperature_2m),
    feels: Math.round(j.current.apparent_temperature),
    code: j.current.weather_code,
    isDay: j.current.is_day === 1,
    max: Math.round(j.daily.temperature_2m_max[0] ?? j.current.temperature_2m),
    min: Math.round(j.daily.temperature_2m_min[0] ?? j.current.temperature_2m),
    rain: j.daily.precipitation_probability_max[0] ?? null,
    updatedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), key, value };
  return value;
}

/** 지역을 바꾸면 좌표를 다시 찾는다 */
export function setWeatherCity(city: string): void {
  saveSettings({ weatherCity: city.trim() || '서울', weatherLat: undefined, weatherLon: undefined, weatherPlace: undefined });
  cache = null;
}
