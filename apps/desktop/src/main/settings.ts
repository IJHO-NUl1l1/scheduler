import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FontId, ThemeId } from '../shared/themes';

export interface Settings {
  vault: string | null;
  /** 미니 타임라인·빈 시간 계산 범위 */
  dayStart: string;
  dayEnd: string;
  /** 시작 몇 분 전에 알릴지 */
  alertBeforeMinutes: number;
  /** 하루 마무리 알림 시각 */
  dayReviewTime: string;
  /** claude.exe 경로를 직접 지정할 때 */
  claudePath?: string;
  /** 빠른/계획 모드 모델 */
  quickModel: string;
  planModel: string;
  /** 이 턴 수를 넘으면 새 대화로 */
  maxSessionTurns: number;
  /** 사이드바 시계 모양 */
  clockStyle: 'digital' | 'analog';
  /** 날씨 지역 (도시 이름). 좌표는 처음 조회할 때 찾아서 저장 */
  weatherCity: string;
  weatherLat?: number;
  weatherLon?: number;
  weatherPlace?: string;
  /** 화면 테마 (통째로 바뀜) */
  theme: ThemeId;
  /** 글꼴 (테마와 별개) */
  font: FontId;
}

const DEFAULTS: Settings = {
  vault: null,
  dayStart: '08:00',
  dayEnd: '19:00',
  alertBeforeMinutes: 10,
  dayReviewTime: '18:00',
  quickModel: 'sonnet',
  planModel: 'opus',
  maxSessionTurns: 8,
  clockStyle: 'digital',
  weatherCity: '서울',
  theme: 'default',
  font: 'pretendard',
};

export const dataDir = () => app.getPath('userData');
const file = () => path.join(dataDir(), 'settings.json');

let cache: Settings | null = null;

export function loadSettings(): Settings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  if (!existsSync(dataDir())) mkdirSync(dataDir(), { recursive: true });
  writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8');
  cache = next;
  return next;
}
