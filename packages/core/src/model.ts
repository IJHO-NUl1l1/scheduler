/** 우선순위 (Obsidian Tasks 기호와 1:1) */
export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';

/** HH:mm 24시간제 */
export interface TimeRange {
  start: string;
  end?: string;
}

/**
 * - task: 체크박스가 있는 할 일
 * - event: 체크박스 없이 시간이 있는 일정 (회의 등)
 * - allday: `- 종일 내용`
 * - note: 체크박스도 시간도 없는 글머리 (예: 체크박스 없는 목표). 보존만 하고 집계에서 빠진다.
 */
export type ItemKind = 'task' | 'event' | 'allday' | 'note';

/** 줄 하나에서 읽어낸 항목. 파일 위치 정보는 없다. */
export interface ParsedLine {
  kind: ItemKind;
  indent: string;
  bullet: string;
  /** 체크박스 안 문자. task일 때만 */
  status?: string;
  done: boolean;
  time?: TimeRange;
  /** 기호와 시간을 뺀 본문 (태그 포함) */
  text: string;
  priority?: Priority;
  due?: string;
  scheduled?: string;
  startDate?: string;
  created?: string;
  doneDate?: string;
  recurrence?: string;
  id?: string;
  tags: string[];
}

/** 파일 안에 있는 항목 */
export interface Item extends ParsedLine {
  /** 볼트 기준 상대 경로, `/` 구분 */
  file: string;
  /** 0부터 시작하는 줄 번호 */
  line: number;
  /** 같은 섹션 안 부모 항목의 줄 번호 */
  parentLine?: number;
  section: string;
  raw: string;
  /** 🆔이 있으면 그 값, 없으면 `file#L<line+1>` */
  ref: string;
  /** Daily 파일이면 그 날짜 */
  fileDate?: string;
}

export type NoteType = 'daily' | 'monthly' | 'yearly' | 'inbox' | 'other';
