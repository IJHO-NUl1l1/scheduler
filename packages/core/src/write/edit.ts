import YAML from 'yaml';
import type { ParsedDocument } from '../parse/document.js';

/**
 * 문서 편집용 순수 함수들. 모두 새 줄 배열을 돌려주고 원본은 건드리지 않는다.
 * 바뀐 줄 외에는 그대로 둔다는 원칙을 지킨다.
 */

export function joinLines(lines: string[], eol: '\n' | '\r\n'): string {
  return lines.join(eol);
}

export function replaceLines(lines: string[], start: number, end: number, insert: string[]): string[] {
  return [...lines.slice(0, start), ...insert, ...lines.slice(end)];
}

/**
 * 섹션 끝(뒤쪽 빈 줄 앞)에 줄을 넣을 위치를 찾는다. 섹션이 없으면 만든다.
 * `after`가 있으면 그 섹션 바로 뒤에, 없으면 메모 섹션 앞 또는 파일 끝에 만든다.
 */
export function ensureSection(
  doc: ParsedDocument,
  title: string,
  opts: { before?: string } = {},
): { lines: string[]; insertAt: number } {
  const sec = doc.sections.find((s) => s.title === title);
  if (sec) {
    let insertAt = sec.end;
    while (insertAt > sec.start && (doc.lines[insertAt - 1] ?? '').trim() === '') insertAt--;
    return { lines: doc.lines, insertAt };
  }

  const lines = [...doc.lines];
  const beforeSec = opts.before ? doc.sections.find((s) => s.title === opts.before) : undefined;
  if (beforeSec && beforeSec.headingLine >= 0) {
    const at = beforeSec.headingLine;
    lines.splice(at, 0, `## ${title}`, '');
    // 새 제목 바로 다음 줄(빈 줄 자리)에 넣는다
    return { lines, insertAt: at + 1 };
  }

  // 파일 끝에 추가. 끝의 빈 줄은 정리하고 한 줄 띄운다
  while (lines.length && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
  if (lines.length) lines.push('');
  lines.push(`## ${title}`);
  const insertAt = lines.length;
  lines.push('');
  return { lines, insertAt };
}

/**
 * 섹션 끝에 줄들을 추가한 결과를 돌려준다.
 */
export function appendToSection(
  doc: ParsedDocument,
  title: string,
  newLines: string[],
  opts: { before?: string } = {},
): string[] {
  const { lines, insertAt } = ensureSection(doc, title, opts);
  const out = [...lines];
  // 새로 만든 섹션의 자리표시 빈 줄은 그대로 두고 그 앞에 넣는다
  out.splice(insertAt, 0, ...newLines);
  return out;
}

function formatYamlScalar(value: string): string {
  return YAML.stringify(value, { lineWidth: 0 }).trimEnd();
}

/**
 * frontmatter의 한 필드만 바꾼다. 값이 undefined면 그 필드 줄을 지운다.
 * 한 줄짜리 스칼라 필드만 다룬다.
 */
export function setFrontmatterField(doc: ParsedDocument, key: string, value: string | undefined): string[] {
  const lines = [...doc.lines];
  const line = value === undefined ? undefined : `${key}: ${formatYamlScalar(value)}`;
  const keyRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);

  if (!doc.frontmatterRange) {
    if (line === undefined) return lines;
    return ['---', line, '---', ...lines];
  }
  const [s, e] = doc.frontmatterRange;
  for (let i = s + 1; i < e; i++) {
    if (keyRe.test(lines[i] ?? '')) {
      // 여러 줄 값(들여쓴 다음 줄들)도 함께 교체
      let j = i + 1;
      while (j < e && /^\s+\S/.test(lines[j] ?? '')) j++;
      return replaceLines(lines, i, j, line === undefined ? [] : [line]);
    }
  }
  if (line === undefined) return lines;
  lines.splice(e, 0, line);
  return lines;
}
