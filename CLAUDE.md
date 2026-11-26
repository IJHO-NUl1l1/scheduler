# Scheduler

md 파일 기반 설치형 플래너. 계획은 [docs/PLAN.md](docs/PLAN.md), 파일 형식은 [docs/vault-format.md](docs/vault-format.md), MCP 도구는 [docs/mcp-tools.md](docs/mcp-tools.md).

`plan.md`는 웹 Claude와의 브레인스토밍 원문이다. 참고만 하고 기준으로 삼지 않는다.

## 구조

- `packages/core` — md 파싱·쓰기·조회. 앱과 MCP 서버가 공유. Electron 의존 금지.
- `packages/mcp-server` — stdio MCP 서버. 파일 접근은 core를 통해서만.
- `apps/desktop` — Electron(main / preload / renderer).
- `vault-template` — 새 볼트의 초기 파일.

## 명령

- `pnpm install` / `pnpm build` / `pnpm test` / `pnpm typecheck` (루트에서 전체)
- mcp-server 테스트는 core의 `dist`를 쓰므로 core를 먼저 빌드 (`pnpm test`는 자동으로 함)
- MCP 실제 실행 확인: `node packages/mcp-server/scripts/smoke.mjs <볼트 경로>`
- 앱: 루트에서 `pnpm dev` (core 빌드 후 개발 모드) / `pnpm start` (빌드 후 실행). 개별로는 `pnpm --filter @scheduler/desktop dev`
- 앱 화면 확인(개발용 환경 변수): `PLANNER_VAULT=<볼트>` 저장 설정 대신 이 볼트 사용, `SCHEDULER_SCREENSHOT=<png>` 캡처 후 종료, `SCHEDULER_SCREENSHOT_PRE=<js>` 로드 직후 실행, `SCHEDULER_SCREENSHOT_DELAY`, `SCHEDULER_SCREENSHOT_SCROLL`. `SCHEDULER_USER_DATA=<폴더>` 별도 데이터 폴더(실행 중인 앱과 안 겹치게). `SCHEDULER_WINDOW=1920x1080` 창 크기(자동 확대 확인). 캡처 실행은 창을 띄우지 않고 오프스크린으로 그린다. `ELECTRON_RUN_AS_NODE`는 지우고 실행
- desktop 테스트: `pnpm --filter @scheduler/desktop test` (대시보드 격자 계산)
- renderer는 `@scheduler/core/pure`만 import (node 모듈 없는 순수 함수)

## 규칙

- TypeScript strict, pnpm 워크스페이스.
- md 형식을 바꾸면 `docs/vault-format.md`를 먼저 고치고 core 테스트를 맞춘다.
- md 쓰기는 줄 단위 수정 + 원자적 쓰기. 모르는 내용은 보존.
- renderer에서 Node 직접 접근 금지. preload의 contextBridge로만 노출.
- 이 저장소(코드)와 개인 볼트(데이터)는 별개다. 개인 일정 데이터를 커밋하지 않는다.
- 채팅 시스템 프롬프트(`apps/desktop/src/main/claude.ts`)에 바뀌는 값을 넣지 않는다. 프롬프트 캐시가 깨진다 (docs/token-strategy.md).
