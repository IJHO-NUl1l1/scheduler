import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { INBOX_FILE, Vault, VaultError, initialContent, type VaultOptions } from '@scheduler/core';
import type { VaultChange } from '../shared/api';

const hash = (s: string) => createHash('sha1').update(s).digest('hex');

interface Tx {
  /** 작업 전 내용 (null = 파일이 없었음) */
  before: Map<string, string | null>;
  /** 작업 후 내용 */
  after: Map<string, string>;
}

/**
 * 쓰기를 기록하는 볼트. 작업 하나(트랜잭션) 동안 바뀐 파일의 이전·이후 내용을 모아서 되돌리기에 쓴다.
 */
class RecordingVault extends Vault {
  tx: Tx | null = null;

  constructor(root: string, opts: VaultOptions) {
    super(root, opts);
  }

  override async writeAtomic(rel: string, content: string): Promise<void> {
    if (this.tx && !this.tx.before.has(rel)) this.tx.before.set(rel, await this.read(rel));
    await super.writeAtomic(rel, content);
    this.tx?.after.set(rel, content);
  }
}

/**
 * 볼트 열기, 파일 감시, 작업 직렬화와 되돌리기.
 * 앱이 직접 쓴 변경과 바깥(Claude, Obsidian, git)에서 온 변경을 구분한다.
 */
export class PlannerService {
  private rv: RecordingVault | null = null;
  private watcher: FSWatcher | null = null;
  private selfWrites = new Map<string, string>();
  private pending = new Map<string, boolean>();
  private timer: NodeJS.Timeout | null = null;
  /** 작업을 하나씩 순서대로 실행 (기록이 섞이지 않게) */
  private queue: Promise<unknown> = Promise.resolve();
  /** 되돌리기는 직전 작업 하나만 */
  private last: { id: string; tx: Tx } | null = null;

  constructor(private readonly onChange: (c: VaultChange) => void) {}

  get vault(): Vault | null {
    return this.rv;
  }

  open(root: string): Vault {
    this.close();
    ensureVault(root);
    this.rv = new RecordingVault(root, {
      onWrite: (rel, content) => this.selfWrites.set(rel, hash(content)),
    });
    this.watcher = watch(root, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
      ignored: (p: string) => {
        const rel = path.relative(root, p).split(path.sep).join('/');
        if (!rel) return false;
        if (rel.startsWith('.git') || rel.startsWith('node_modules')) return true;
        const base = path.basename(p);
        return base.startsWith('.') && base.endsWith('.tmp');
      },
    });
    const handler = (p: string) => {
      const rel = path.relative(root, p).split(path.sep).join('/');
      if (!rel.endsWith('.md')) return;
      let external = true;
      const mine = this.selfWrites.get(rel);
      if (mine) {
        try {
          if (hash(readFileSync(p, 'utf8')) === mine) external = false;
        } catch {
          // 지워진 파일
        }
        this.selfWrites.delete(rel);
      } else if (!existsSync(p) && this.recentlyRemoved.has(rel)) {
        external = false;
        this.recentlyRemoved.delete(rel);
      }
      this.pending.set(rel, (this.pending.get(rel) ?? false) || external);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 150);
    };
    this.watcher.on('add', handler).on('change', handler).on('unlink', handler);
    return this.rv;
  }

  private recentlyRemoved = new Set<string>();

  private flush(): void {
    const files = [...this.pending.keys()];
    const external = [...this.pending.values()].some(Boolean);
    this.pending.clear();
    if (files.length) this.onChange({ files, external });
  }

  close(): void {
    void this.watcher?.close();
    this.watcher = null;
    this.rv = null;
    this.last = null;
  }

  /**
   * 수정 작업 실행. 바뀐 파일이 있으면 되돌리기 ID를 돌려준다.
   */
  run<T>(fn: (vault: Vault) => Promise<T>): Promise<{ value: T; undoId?: string }> {
    const job = this.queue.then(async () => {
      const rv = this.rv;
      if (!rv) throw new VaultError('볼트가 열려 있지 않음');
      rv.tx = { before: new Map(), after: new Map() };
      try {
        const value = await fn(rv);
        const tx = rv.tx;
        if (!tx.after.size) return { value };
        const undoId = randomUUID();
        this.last = { id: undoId, tx };
        return { value, undoId };
      } finally {
        rv.tx = null;
      }
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  /** 되돌리기. 그 사이 파일이 다른 곳에서 바뀌었으면 거부한다 */
  undo(id: string): Promise<void> {
    const job = this.queue.then(async () => {
      const rv = this.rv;
      const tx = this.last?.id === id ? this.last.tx : null;
      if (!rv || !tx) throw new VaultError('되돌릴 수 있는 기록이 없음');
      for (const [rel, after] of tx.after) {
        if ((await rv.read(rel)) !== after) throw new VaultError('그 사이 파일이 바뀌어서 되돌릴 수 없음');
      }
      for (const [rel, before] of tx.before) {
        if (before === null) {
          this.recentlyRemoved.add(rel);
          await rm(rv.abs(rel), { force: true });
        } else {
          await rv.writeAtomic(rel, before);
        }
      }
      this.last = null;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}

/** 빈 폴더를 고르면 기본 구조를 만든다 */
export function ensureVault(root: string): void {
  for (const dir of ['Daily', 'Monthly', 'Yearly']) mkdirSync(path.join(root, dir), { recursive: true });
  const inbox = path.join(root, INBOX_FILE);
  if (!existsSync(inbox)) writeFileSync(inbox, initialContent(INBOX_FILE), 'utf8');
}
