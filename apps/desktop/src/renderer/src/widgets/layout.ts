import type { DashLayout, GridWidget, WidgetType } from '@shared/api';
import { compact, type SizeLimit } from './grid';

/** 격자 크기 (px). 열 너비는 화면 폭에 맞춰 계산 */
export const ROW_H = 40;
export const GAP = 14;

/** 위젯 종류별 이름·설명·기본 크기·최소 크기 (컴포넌트는 registry.tsx) */
export const WIDGET_META: Record<WidgetType, { title: string; desc: string; w: number; h: number; limit: SizeLimit; multiple?: boolean }> = {
  heading: { title: '제목', desc: '구역을 나누는 제목 줄', w: 12, h: 1, limit: { minW: 2, minH: 1, maxH: 1 }, multiple: true },
  now: { title: '다음 할 일', desc: '다음에 할 일 하나 (다음 일정, 없으면 맨 위 할 일)', w: 6, h: 3, limit: { minW: 3, minH: 3 } },
  attention: { title: '챙길 것', desc: '밀린 할 일과 7일 안 마감 (바로 오늘로 옮기기)', w: 3, h: 5, limit: { minW: 3, minH: 3 } },
  todayList: { title: '오늘 할 일', desc: '오늘 할 일·일정 목록 (완료한 것은 아래에)', w: 6, h: 9, limit: { minW: 3, minH: 4 } },
  timeline: { title: '오늘 타임라인', desc: '시간이 정해진 항목 (끌어서 조정)', w: 6, h: 9, limit: { minW: 3, minH: 5 } },
  week: { title: '앞으로 7일', desc: '날짜별 헤드라인과 할 일 수', w: 12, h: 4, limit: { minW: 6, minH: 3 } },
  month: { title: '월 달력', desc: '한 달 일정을 달력으로', w: 8, h: 10, limit: { minW: 4, minH: 6 } },
  goals: { title: '목표', desc: '이번 달·올해 목표 달성률', w: 4, h: 5, limit: { minW: 3, minH: 3 } },
  inbox: { title: '인박스', desc: '날짜 없는 할 일', w: 3, h: 5, limit: { minW: 3, minH: 3 } },
  record: { title: '기록', desc: '최근 몇 주 완료 잔디와 연속 일수', w: 4, h: 5, limit: { minW: 3, minH: 4 } },
  clock: { title: '시계', desc: '디지털 또는 아날로그', w: 3, h: 4, limit: { minW: 2, minH: 3 } },
};

let seq = 0;
export const newId = (p = 'w') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeWidget(type: WidgetType, pos: Partial<GridWidget> = {}): GridWidget {
  const m = WIDGET_META[type];
  return { id: newId(), type, x: 0, y: 0, w: m.w, h: m.h, ...pos };
}

export function defaultLayout(): DashLayout {
  const W = (type: WidgetType, x: number, y: number, w?: number, h?: number, options?: GridWidget['options']) => makeWidget(type, { x, y, ...(w ? { w } : {}), ...(h ? { h } : {}), ...(options ? { options } : {}) });
  return {
    version: 3,
    widgets: [
      // 오늘: 할 일 목록 + 그 아래 다음 할 일 / 시간표
      W('heading', 0, 0, 12, 1, { title: '오늘' }),
      W('todayList', 0, 1, 6, 7),
      W('now', 0, 8, 6, 3),
      W('timeline', 6, 1, 6, 10),
      // 앞으로: 일주일 흐름
      W('heading', 0, 11, 12, 1, { title: '앞으로' }),
      W('week', 0, 12, 12, 4),
      // 이번 달: 달력 · 목표 · 기록
      W('heading', 0, 16, 12, 1, { title: '이번 달' }),
      W('month', 0, 17, 8, 10),
      W('goals', 8, 17, 4, 4),
      W('record', 8, 21, 4, 6),
    ],
  };
}

/** 예전(v2: 섹션 > 위젯) 레이아웃을 격자로 옮긴다 */
interface V2 {
  version: 2;
  sections: { title: string; widgets: { type: WidgetType; size: 'sm' | 'md' | 'lg' | 'xl' | 'full'; options?: GridWidget['options'] }[] }[];
}
const V2_COLS = { sm: 3, md: 4, lg: 6, xl: 8, full: 12 } as const;

export function migrate(raw: unknown): DashLayout {
  const l = raw as DashLayout | V2 | null;
  if (l && l.version === 3 && Array.isArray(l.widgets)) {
    return { version: 3, widgets: compact(l.widgets.filter((w) => w.type in WIDGET_META)) };
  }
  if (l && l.version === 2 && Array.isArray(l.sections)) {
    const out: GridWidget[] = [];
    let y = 0;
    for (const s of l.sections) {
      out.push(makeWidget('heading', { x: 0, y, w: 12, h: 1, options: { title: s.title } }));
      y += 1;
      let x = 0;
      let rowH = 0;
      for (const w of s.widgets) {
        if (!(w.type in WIDGET_META)) continue;
        const cols = V2_COLS[w.size] ?? WIDGET_META[w.type].w;
        if (x + cols > 12) {
          y += rowH;
          x = 0;
          rowH = 0;
        }
        const h = WIDGET_META[w.type].h;
        out.push(makeWidget(w.type, { x, y, w: cols, h, ...(w.options ? { options: w.options } : {}) }));
        x += cols;
        rowH = Math.max(rowH, h);
      }
      y += rowH;
    }
    return { version: 3, widgets: compact(out) };
  }
  return defaultLayout();
}
