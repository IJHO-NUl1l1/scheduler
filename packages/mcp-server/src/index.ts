#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Vault } from '@scheduler/core';
import { createServer } from './server.js';

/**
 * 실행: PLANNER_VAULT=<볼트 경로> node dist/index.js
 *   또는 node dist/index.js --vault <볼트 경로>
 * stdout은 MCP 통신 전용이라 로그는 stderr로만 쓴다.
 */
function vaultPath(): string {
  const i = process.argv.indexOf('--vault');
  const p = (i >= 0 ? process.argv[i + 1] : undefined) ?? process.env['PLANNER_VAULT'];
  if (!p) {
    console.error('[planner-mcp] 볼트 경로가 없음. PLANNER_VAULT 환경 변수나 --vault 인자로 지정');
    process.exit(1);
  }
  if (!existsSync(p) || !statSync(p).isDirectory()) {
    console.error(`[planner-mcp] 볼트 폴더가 없음: ${p}`);
    process.exit(1);
  }
  return p;
}

const vault = new Vault(vaultPath());
const server = createServer(vault, process.env['PLANNER_DAY_END'] ? { dayEnd: process.env['PLANNER_DAY_END'] } : {});
await server.connect(new StdioServerTransport());
console.error(`[planner-mcp] 실행 중. 볼트: ${vault.root}`);
