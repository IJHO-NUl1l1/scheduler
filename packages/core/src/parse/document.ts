import YAML from 'yaml';
import type { Item, NoteType } from '../model.js';
import { parseLine } from './line.js';

/** 항목을 읽는 섹션. 그 밖의 섹션(메모 등)은 보존만 한다 */
export const ITEM_SECTIONS = ['할 일', '일정', '목표'] as const;
export const TASK_SECTION = '할 일';
export const GOAL_SECTION = '목표';
export const MEMO_SECTION = '메모';

export interface Section {
  title: string;
  /** 제목 줄 번호. 제목 없는 맨 앞 부분이면 -1 */
  headingLine: number;
  /** 본문 첫 줄 */
  start: number;
  /** 본문 끝 (다음 제목 줄 또는 파일 끝, 미포함) */
  end: number;
}

export interface ParsedDocument {
  file: string;
  type: NoteType;
  /** 날짜 계열 파일의 날짜 키 (YYYY-MM-DD / YYYY-MM / YYYY) */
  key?: string;
  eol: '\n' | '\r\n';
  lines: string[];
  frontmatter: Record<string, unknown>;
  /** frontmatter 범위 [시작 `---`, 끝 `---`] 줄 번호. 없으면 undefined */
  frontmatterRange?: [number, number];
  sections: Section[];
  items: Item[];
}

const DAILY_RE = /^Daily\/(\d{4}-\d{2}-\d{2})\.md$/;
const MONTHLY_RE = /^Monthly\/(\d{4}-\d{2})\.md$/;
const YEARLY_RE = /^Yearly\/(\d{4})\.md$/;

export function classifyPath(file: string): { type: NoteType; key?: string } {
  let m: RegExpExecArray | null;
  if ((m = DAILY_RE.exec(file))) return { type: 'daily', key: m[1] };
  if ((m = MONTHLY_RE.exec(file))) return { type: 'monthly', key: m[1] };
  if ((m = YEARLY_RE.exec(file))) return { type: 'yearly', key: m[1] };
  if (file === 'Inbox.md') return { type: 'inbox' };
  return { type: 'other' };
}

export function splitLines(content: string): { lines: string[]; eol: '\n' | '\r\n' } {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  return { lines: content.split(/\r?\n/), eol };
}

function parseFrontmatter(lines: string[]): { data: Record<string, unknown>; range?: [number, number] } {
  if (lines[0]?.trim() !== '---') return { data: {} };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      const raw = lines.slice(1, i).join('\n');
      let data: Record<string, unknown> = {};
      try {
        const parsed: unknown = YAML.parse(raw, { schema: 'core' });
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          data = parsed as Record<string, unknown>;
        }
      } catch {
        // 깨진 frontmatter는 빈 값으로 보고 원문은 그대로 둔다
      }
      return { data, range: [0, i] };
    }
  }
  return { data: {} };
}

/** 코드 블록 안의 줄은 제목·항목으로 읽지 않는다 */
function codeBlockMask(lines: string[], from: number): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let inFence = false;
  for (let i = from; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (/^\s*(```|~~~)/.test(l)) {
      mask[i] = true;
      inFence = !inFence;
      continue;
    }
    mask[i] = inFence;
  }
  return mask;
}

export function parseDocument(content: string, file: string): ParsedDocument {
  const { lines, eol } = splitLines(content);
  const { type, key } = classifyPath(file);
  const fm = parseFrontmatter(lines);
  const bodyStart = fm.range ? fm.range[1] + 1 : 0;
  const inCode = codeBlockMask(lines, bodyStart);

  const sections: Section[] = [];
  let current: Section = { title: '', headingLine: -1, start: bodyStart, end: lines.length };
  for (let i = bodyStart; i < lines.length; i++) {
    if (inCode[i]) continue;
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(lines[i] ?? '');
    if (m && !/^###/.test(lines[i] ?? '')) {
      current.end = i;
      sections.push(current);
      current = { title: m[1] ?? '', headingLine: i, start: i + 1, end: lines.length };
    }
  }
  sections.push(current);

  const items: Item[] = [];
  for (const sec of sections) {
    const isItemSection = (ITEM_SECTIONS as readonly string[]).includes(sec.title);
    if (!isItemSection) continue;
    const legacyEvents = sec.title === '일정';
    const stack: { indent: number; line: number }[] = [];
    for (let i = sec.start; i < sec.end; i++) {
      if (inCode[i]) continue;
      const raw = lines[i] ?? '';
      const parsed = parseLine(raw);
      if (!parsed) continue;
      if (legacyEvents && parsed.kind === 'note') {
        // 예전 `## 일정`의 시간 없는 줄은 종일 일정으로 본다
        parsed.kind = 'allday';
      }
      const indent = parsed.indent.replace(/\t/g, '    ').length;
      while (stack.length && (stack[stack.length - 1]?.indent ?? 0) >= indent) stack.pop();
      const parent = stack[stack.length - 1];
      const item: Item = {
        ...parsed,
        file,
        line: i,
        section: sec.title,
        raw,
        ref: parsed.id ?? `${file}#L${i + 1}`,
      };
      if (parent) item.parentLine = parent.line;
      if (type === 'daily' && key) item.fileDate = key;
      items.push(item);
      stack.push({ indent, line: i });
    }
  }

  const doc: ParsedDocument = {
    file,
    type,
    eol,
    lines,
    frontmatter: fm.data,
    sections,
    items,
  };
  if (key) doc.key = key;
  if (fm.range) doc.frontmatterRange = fm.range;
  return doc;
}

/** 항목과 그 하위 항목들이 차지하는 줄 범위 [start, end) */
export function itemBlock(doc: ParsedDocument, item: Item): [number, number] {
  const baseIndent = item.indent.replace(/\t/g, '    ').length;
  const sec = doc.sections.find((s) => s.title === item.section && item.line >= s.start && item.line < s.end);
  const limit = sec ? sec.end : doc.lines.length;
  let end = item.line + 1;
  while (end < limit) {
    const l = doc.lines[end] ?? '';
    if (l.trim() === '') break;
    const ind = (/^\s*/.exec(l)?.[0] ?? '').replace(/\t/g, '    ').length;
    if (ind <= baseIndent) break;
    end++;
  }
  return [item.line, end];
}

export function getHeadline(doc: ParsedDocument): string | undefined {
  const h = doc.frontmatter['headline'];
  return typeof h === 'string' && h.trim() ? h.trim() : undefined;
}
