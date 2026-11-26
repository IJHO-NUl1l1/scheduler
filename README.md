# Scheduler

.md 파일 기반 설치형 플래너. 데이터는 볼트 폴더의 .md 파일이고, 앱과 Claude(MCP)가 같은 파일을 읽고 쓴다.

- 계획: [docs/PLAN.md](docs/PLAN.md) · 할 일: [docs/TODO.md](docs/TODO.md)
- 형식: [docs/vault-format.md](docs/vault-format.md) · 오늘 화면 설계: [docs/today.md](docs/today.md) · MCP: [docs/mcp-tools.md](docs/mcp-tools.md)

## 현재 상태

| 패키지 | 상태 |
|---|---|
| `packages/core` | 파싱·쓰기·조회·시간 상태·알림 계산 완료 |
| `packages/mcp-server` | 도구 18개, Claude Desktop 연결 가능 |
| `apps/desktop` | 홈 화면, 빠른 추가, 알림, 트레이, 앱 내장 Claude 채팅 |

## 개발

```bash
pnpm install
pnpm build
pnpm test
```

## 앱 실행 (개발)

```bash
pnpm build                       # core, mcp-server 빌드 (앱이 MCP 서버 dist를 씀)
pnpm --filter @scheduler/desktop dev
```

- 처음 실행하면 볼트 폴더를 고른다. 빈 폴더면 기본 구조를 만든다.
- 오른쪽 Claude 패널은 설치된 Claude Code(`claude`)를 실행한다. Claude Code에 로그인돼 있어야 한다.
- VS Code 확장 등에서 `ELECTRON_RUN_AS_NODE=1`이 설정된 환경이면 Electron이 Node로 떠서 실패한다. 그 변수를 지우고 실행.
- 토큰 절약 방식: [docs/token-strategy.md](docs/token-strategy.md)

## Claude Desktop에 연결 (2순위)

1. 볼트 폴더를 만든다. 처음이면 `vault-template` 내용을 복사하고 예시 파일은 지운다.
2. `pnpm build`
3. Claude Desktop → 설정 → 개발자 → 설정 편집 (`%APPDATA%\Claude\claude_desktop_config.json`)에 추가:

```json
{
  "mcpServers": {
    "planner": {
      "command": "node",
      "args": ["C:/Scheduler/packages/mcp-server/dist/index.js"],
      "env": {
        "PLANNER_VAULT": "C:/Users/<사용자>/PlannerVault",
        "PLANNER_DAY_END": "19:00"
      }
    }
  }
}
```

4. Claude Desktop을 완전히 종료(트레이에서도)했다가 다시 실행.
5. "오늘 할 일 보여줘", "내일 10시에 회의 넣어줘", "이번 주 정리해줘" 같은 식으로 쓴다. 주간 정리·월 계획은 `+` 메뉴의 프롬프트(weekly-review, plan-month)로도 시작할 수 있다.

`PLANNER_DAY_END`는 선택 사항이다. `get_now`에서 빈 시간을 계산할 하루 끝 시각이며, 기본은 24:00.
