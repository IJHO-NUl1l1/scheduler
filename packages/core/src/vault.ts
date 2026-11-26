import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Item } from './model.js';
import { parseDocument, type ParsedDocument } from './parse/document.js';
import { joinLines } from './write/edit.js';

export const DAILY_DIR = 'Daily';
export const MONTHLY_DIR = 'Monthly';
export const YEARLY_DIR = 'Yearly';
export const INBOX_FILE = 'Inbox.md';

export const dailyPath = (date: string) => `${DAILY_DIR}/${date}.md`;
export const monthlyPath = (month: string) => `${MONTHLY_DIR}/${month}.md`;
export const yearlyPath = (year: string) => `${YEARLY_DIR}/${year}.md`;

/** 새 파일을 만들 때 쓰는 기본 내용 */
export function initialContent(rel: string): string {
  let m: RegExpExecArray | null;
  if ((m = /^Daily\/(\d{4}-\d{2}-\d{2})\.md$/.exec(rel))) {
    return `---\ndate: ${m[1]}\n---\n## 할 일\n\n## 메모\n`;
  }
  if ((m = /^Monthly\/(\d{4}-\d{2})\.md$/.exec(rel))) {
    return `---\nmonth: ${m[1]}\n---\n## 목표\n\n## 메모\n`;
  }
  if ((m = /^Yearly\/(\d{4})\.md$/.exec(rel))) {
    return `---\nyear: ${m[1]}\n---\n## 목표\n`;
  }
  if (rel === INBOX_FILE) return `## 할 일\n`;
  return '';
}

export interface VaultOptions {
  /** 이 볼트가 파일을 쓴 직후 호출. 앱이 자기 변경을 구분할 때 쓴다 */
  onWrite?: (rel: string, content: string) => void;
}

export class VaultError extends Error {}

export class Vault {
  readonly root: string;
  private readonly onWrite: ((rel: string, content: string) => void) | undefined;

  constructor(root: string, opts: VaultOptions = {}) {
    this.root = path.resolve(root);
    this.onWrite = opts.onWrite;
  }

  /** 볼트 기준 상대 경로를 절대 경로로. 볼트 밖이면 오류 */
  abs(rel: string): string {
    const p = path.resolve(this.root, rel);
    const relCheck = path.relative(this.root, p);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
      throw new VaultError(`볼트 밖 경로는 쓸 수 없음: ${rel}`);
    }
    return p;
  }

  toRel(absPath: string): string {
    return path.relative(this.root, absPath).split(path.sep).join('/');
  }

  async read(rel: string): Promise<string | null> {
    try {
      return await fs.readFile(this.abs(rel), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async readDoc(rel: string): Promise<ParsedDocument | null> {
    const content = await this.read(rel);
    if (content === null) return null;
    return parseDocument(stripBom(content), rel);
  }

  /** 임시 파일에 쓴 뒤 rename. Windows에서 다른 프로그램이 잠깐 잡고 있으면 몇 번 재시도 */
  async writeAtomic(rel: string, content: string): Promise<void> {
    const target = this.abs(rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(4).toString('hex')}.tmp`);
    await fs.writeFile(tmp, content, 'utf8');
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.rename(tmp, target);
        this.onWrite?.(rel, content);
        return;
      } catch (e) {
        lastErr = e;
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') break;
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      }
    }
    await fs.rm(tmp, { force: true });
    throw lastErr;
  }

  /**
   * 파일을 수정 직전에 다시 읽고, fn이 돌려준 줄로 저장한다.
   * fn이 null을 돌려주면 저장하지 않는다. 파일이 없으면 기본 내용으로 만든 뒤 적용한다.
   */
  async modify(rel: string, fn: (doc: ParsedDocument) => string[] | null): Promise<ParsedDocument> {
    const existing = await this.read(rel);
    const content = existing === null ? initialContent(rel) : stripBom(existing);
    const doc = parseDocument(content, rel);
    const lines = fn(doc);
    if (lines === null) return doc;
    const next = joinLines(lines, doc.eol);
    if (next !== content || existing === null) await this.writeAtomic(rel, next);
    return parseDocument(next, rel);
  }

  /** 볼트 안의 노트 파일 목록 (Daily, Monthly, Yearly, Inbox) */
  async listNotes(): Promise<string[]> {
    const out: string[] = [];
    for (const dir of [DAILY_DIR, MONTHLY_DIR, YEARLY_DIR]) {
      out.push(...(await this.listDir(dir)).map((f) => `${dir}/${f}`));
    }
    if ((await this.read(INBOX_FILE)) !== null) out.push(INBOX_FILE);
    return out;
  }

  /** Daily 파일의 날짜 목록 (정렬됨). from/to는 포함 범위 */
  async listDailyDates(from?: string, to?: string): Promise<string[]> {
    return (await this.listDir(DAILY_DIR))
      .map((f) => /^(\d{4}-\d{2}-\d{2})\.md$/.exec(f)?.[1])
      .filter((d): d is string => !!d && (!from || d >= from) && (!to || d <= to))
      .sort();
  }

  private async listDir(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.abs(dir), { withFileTypes: true });
      return entries.filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('.')).map((e) => e.name);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async allDocs(): Promise<ParsedDocument[]> {
    const files = await this.listNotes();
    const docs = await Promise.all(files.map((f) => this.readDoc(f)));
    return docs.filter((d): d is ParsedDocument => d !== null);
  }

  async allIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const doc of await this.allDocs()) for (const it of doc.items) if (it.id) ids.add(it.id);
    return ids;
  }

  /**
   * ref로 항목 찾기. ref는 🆔 값 또는 `파일#L줄번호`(1부터).
   */
  async findItem(ref: string): Promise<{ doc: ParsedDocument; item: Item } | null> {
    const lm = /^(.+\.md)#L(\d+)$/.exec(ref);
    if (lm) {
      const doc = await this.readDoc(lm[1] ?? '');
      const line = Number(lm[2]) - 1;
      const item = doc?.items.find((i) => i.line === line);
      return doc && item ? { doc, item } : null;
    }
    for (const doc of await this.allDocs()) {
      const item = doc.items.find((i) => i.id === ref);
      if (item) return { doc, item };
    }
    return null;
  }
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
