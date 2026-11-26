// 빌드된 서버를 stdio로 띄워서 실제 Claude Desktop처럼 호출해본다.
// 사용: node scripts/smoke.mjs <볼트 경로>
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const vault = process.argv[2];
if (!vault) throw new Error('볼트 경로 필요');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL('../dist/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  env: { ...process.env, PLANNER_VAULT: vault },
  stderr: 'inherit',
});
const client = new Client({ name: 'smoke', version: '0' });
await client.connect(transport);
const show = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n=== ${name} ${JSON.stringify(args)}${r.isError ? ' (오류)' : ''}\n${r.content.map((c) => c.text).join('\n')}`);
};
console.log('tools:', (await client.listTools()).tools.length);
await show('get_today');
await show('add_task', { text: '스모크 테스트', start: '23:00', end: '23:30' , date: new Date().toLocaleDateString('sv-SE') });
await show('get_now');
await client.close();
