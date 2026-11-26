import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Vault } from '../src/index.js';

export async function makeVault(files: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'planner-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, content, 'utf8');
  }
  const vault = new Vault(root);
  return {
    vault,
    root,
    read: (rel: string) => readFile(path.join(root, rel), 'utf8'),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
