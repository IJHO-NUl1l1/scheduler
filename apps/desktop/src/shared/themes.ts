/**
 * 테마·글꼴 목록. main(창 바탕색, 알림 팝업)과 renderer가 같이 쓴다.
 * 화면 색 자체는 renderer의 styles.css `[data-theme=...]` 블록에 있고, 여기에는 main이 알아야 하는 값만 둔다.
 */

export type ThemeId = 'default' | 'christmas';
export type FontId = 'pretendard' | 'gowun-batang' | 'malgun';

export interface NativeTheme {
  /** 창 바탕색 (로딩 전 깜빡임 방지) */
  bg: string;
  /** 알림 팝업 */
  card: string;
  cardLine: string;
  cardHover: string;
  ink: string;
  muted: string;
  faint: string;
  tones: Record<'soon' | 'now' | 'end' | 'review', string>;
}

export const NATIVE_THEMES: Record<ThemeId, NativeTheme> = {
  default: {
    bg: '#0f0f0e',
    card: '#1d1d1b',
    cardLine: '#33322e',
    cardHover: '#2a2927',
    ink: '#ecebe6',
    muted: '#9a9891',
    faint: '#62615c',
    tones: { soon: '#e3a857', now: '#e5654f', end: '#8fb48a', review: '#8fb0d6' },
  },
  christmas: {
    bg: '#0a1510',
    card: '#10231a',
    cardLine: '#24432f',
    cardHover: '#1b3326',
    ink: '#f6f0e1',
    muted: '#b2bba8',
    faint: '#6e7c6b',
    tones: { soon: '#e9c46a', now: '#d6393f', end: '#43a865', review: '#e9c46a' },
  },
};

export interface FontDef {
  id: FontId;
  name: string;
  /** 설정 화면에 붙이는 표시 (테두리 있는 작은 꼬리표) */
  tag?: string;
  /** CSS font-family */
  family: string;
  /** 알림 팝업이 쓸 글꼴 파일 (node 모듈 경로). 없으면 시스템 글꼴 */
  file?: string;
}

export const FONTS: FontDef[] = [
  {
    id: 'pretendard',
    name: 'Pretendard',
    tag: 'default',
    family: "'Pretendard Variable', 'Pretendard', 'Malgun Gothic', system-ui, sans-serif",
    file: 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  },
  {
    id: 'gowun-batang',
    name: '고운바탕',
    tag: '크리스마스',
    family: "'Gowun Batang', 'Pretendard Variable', serif",
    file: '@fontsource/gowun-batang/files/gowun-batang-korean-400-normal.woff2',
  },
  {
    id: 'malgun',
    name: '맑은 고딕',
    family: "'Malgun Gothic', system-ui, sans-serif",
  },
];

export const fontOf = (id: FontId | undefined): FontDef => FONTS.find((f) => f.id === id) ?? FONTS[0]!;
