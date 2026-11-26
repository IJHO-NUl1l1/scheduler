# Scheduler 프로젝트 계획

> 출처: 웹 Claude 브레인스토밍([../plan.md](../plan.md))을 검토해서 실제로 진행할 내용만 남기고 순서를 다시 잡은 문서.
> 작성: 2026-11-24

## 1. 목표

설치형 데스크톱 플래너. 데이터는 `.md` 파일에 두고, 앱과 Claude가 같은 파일을 읽고 쓴다.

| 기능 | 내용 |
|---|---|
| Todo | Inbox(날짜 없음) + 날짜별 할 일, 체크하면 파일에 바로 반영 |
| 위젯 드래그 | 화면 요소를 아이콘처럼 끌어서 이동·크기 조절, 위치 저장 |
| 연/월/일 뷰 | 연: 월별 목표와 히트맵 / 월: 큰 달력에 headline만 / 일: 타임라인 |
| 시간에 따른 변화 | 시간대 테마, 현재 시각 라인, 일·월·연 진행률, 마감 지난 항목 강조 |
| md 연동 | 볼트 폴더가 원본. Obsidian은 선택 사항인 보조 뷰어 |
| AI 계획 | API 과금 없이 Claude Desktop(MCP) / Claude Code / claude.ai 복사·붙여넣기 |

## 2. 확정된 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 원본 데이터 | 볼트 폴더의 `.md` 파일 | Claude가 바로 읽고 씀, git과 잘 맞음, 앱이 없어도 데이터가 남음 |
| 동기화 | 볼트를 private git repo로 관리, 앱이 commit/pull/push | 무료, 이력과 되돌리기, Obsidian Sync 불필요 |
| 데스크톱 셸 | Electron + electron-vite | Node만으로 파일·git·MCP를 모두 처리 |
| 프론트 | React + TypeScript + Vite + Tailwind + zustand | Next.js는 SSR이 필요 없어서 제외 |
| AI 1순위 | **앱 내장 채팅** → 설치된 Claude Code(`claude -p`)를 앱이 실행, planner MCP 연결 | 화면 하나에서 끝남. 사용자의 Claude Code 구독 로그인 사용 (2026-11-25 동작 확인) |
| AI 2순위 | Claude Desktop + 전용 MCP 서버 | 이미 동작. 1순위가 막히면 대체 |
| AI 3순위 | claude.ai 복사 → 앱에 붙여넣기 → 미리보기 → 반영 | 어디서나 가능 |
| 사용 범위 | **개인용** | 앱이 사용자 구독으로 Claude Code를 실행하는 방식은 배포 시 Agent SDK 정책("제3자 제품에 claude.ai 로그인·구독 한도 제공 금지, 사전 승인 제외")에 걸릴 수 있음. 배포하려면 API 키 방식 또는 Anthropic 승인 필요 |
| 패키지 구조 | pnpm 모노레포 (core / mcp-server / desktop) | 앱과 MCP가 **같은 파서·작성 코드**를 써야 형식이 일치함 |

## 3. 브레인스토밍에서 바꾼 점

1. **`packages/core`를 분리.** md 파싱·쓰기 로직을 앱과 MCP 서버가 공유한다. 따로 만들면 둘이 서로 다른 형식을 쓰게 된다.
2. **MCP 서버를 앱보다 먼저 만든다.** core + MCP만 있어도 Claude Desktop으로 일정 관리가 된다. 형식도 앱 UI를 만들기 전에 실사용으로 검증된다. (대화 마지막 요청 "mcp서버 만드는 플랜으로" 반영)
3. **MCP 서버는 앱과 별개 프로세스.** Claude Desktop이 stdio로 직접 실행하므로 앱이 꺼져 있어도 동작해야 한다. 앱과 MCP는 파일로만 통신하고, 앱은 chokidar로 변경을 감지한다.
4. **SQLite는 MVP에서 뺀다.** 1년치 Daily 파일은 365개 정도라 메모리 인덱스로 충분하다. `better-sqlite3`는 Electron용 네이티브 빌드가 필요해서 초기 부담만 크다. 느려지면 그때 넣는다(캐시는 볼트가 아니라 앱 데이터 폴더에 둔다).
5. **할 일마다 고정 ID.** Tasks 플러그인의 `🆔` 필드를 써서 `complete_task(id)` 같은 도구가 줄 번호에 의존하지 않게 한다.
6. **줄 단위 수정 원칙.** 파일 전체를 다시 쓰지 않고 바뀐 줄만 고친다. 사용자가 직접 적은 내용과 Obsidian 문법을 보존하기 위해서다.
7. **코드 저장소와 데이터 저장소를 분리.** 이 `Scheduler` 저장소는 코드, 볼트는 별도 private repo.

## 4. 저장소 구조

```
Scheduler/                     ← 코드 저장소
├─ CLAUDE.md                   ← 이 저장소에서 개발할 때 Claude가 지킬 규칙
├─ plan.md                     ← 브레인스토밍 원문 (참고용)
├─ docs/
│  ├─ PLAN.md                  ← 이 문서
│  ├─ vault-format.md          ← md 형식 명세 (core 구현의 기준)
│  ├─ mcp-tools.md             ← MCP 도구 명세
│  └─ decisions/               ← 결정 기록 (ADR)
├─ packages/
│  ├─ core/                    ← 도메인 모델, md 파싱/쓰기, 볼트 접근, 조회
│  │  ├─ src/
│  │  └─ test/                 ← vitest, 샘플 볼트로 왕복(round-trip) 테스트
│  └─ mcp-server/              ← stdio MCP 서버 (core 사용)
│     └─ src/
├─ apps/
│  └─ desktop/                 ← Electron 앱
│     └─ src/
│        ├─ main/              ← 파일 감시, git, IPC 핸들러 (core 사용)
│        ├─ preload/           ← contextBridge로 안전한 API만 노출
│        └─ renderer/          ← React UI
└─ vault-template/             ← 새 볼트를 만들 때 복사하는 초기 파일
   ├─ CLAUDE.md                ← 볼트용 AI 규칙서
   ├─ Inbox.md
   ├─ Daily/ Monthly/ Yearly/
   └─ .planner/
      ├─ layout.json           ← 위젯 배치
      └─ proposals/            ← AI가 제안한 계획 (승인 대기)
```

### core 내부 구성 (예정)

```
packages/core/src/
├─ model.ts        ← Task, Event, DayNote, MonthNote, YearNote 타입
├─ parse/          ← frontmatter(gray-matter), 할 일 줄, 일정 줄 파서
├─ write/          ← 줄 단위 수정, ID 부여, 원자적 쓰기(임시 파일 → rename)
├─ vault.ts        ← 경로 규칙(Daily/YYYY-MM-DD.md 등), 파일 열기/만들기
├─ query.ts        ← 기간 조회, 월 요약, 할 일 검색 (메모리 인덱스)
└─ index.ts
```

## 5. 로드맵

| 단계 | 목표 | 주요 작업 | 완료 기준 |
|---|---|---|---|
| 0 | 형식 검증 (코드 없음) | `vault-template` 복사해서 개인 볼트 생성, Claude Desktop에 공식 filesystem MCP를 볼트로 제한해서 연결 | 1~2주 실제로 써보고 형식 명세 확정 |
| 1 | core | 모노레포 설정(pnpm, TS, vitest), 파서·쓰기·조회 구현 | 샘플 볼트 왕복 테스트 통과 (읽고 다시 써도 내용이 그대로) |
| 2 | MCP 서버 | `@modelcontextprotocol/sdk`로 [mcp-tools.md](mcp-tools.md)의 도구 구현, Claude Desktop 설정에 연결 | filesystem MCP를 빼고 전용 MCP만으로 일상 관리 가능 |
| 3 | 데스크톱 MVP | electron-vite 초기화, 볼트 선택, Todo, 일간·월간 뷰, chokidar 자동 갱신 | 앱과 Claude가 같은 파일을 동시에 써도 화면이 맞게 갱신 |
| 4 | UI 확장 | react-grid-layout 위젯, dnd-kit 카드 정렬, 연간 뷰, 시간대 테마·진행률, AI 변경 표시 | 레이아웃 저장·복원 |
| 5 | git 동기화 | simple-git: 시작·주기적 pull, 저장 시 commit, 일정 간격 push, 충돌 알림 | 집·회사에서 같은 데이터 |
| 6 | 2순위 AI | "Claude에게 요청" 프롬프트 복사, 붙여넣기 가져오기 + 미리보기 | 웹 Claude 결과를 앱에 반영 |
| 7 | 배포 | electron-builder(NSIS, portable), electron-updater + GitHub Releases, GitHub Actions, MCP는 `.mcpb`로 패키징 | `.exe` 설치·자동 업데이트 동작 |

## 6. 기술 스택 상세

| 계층 | 선택 | 비고 |
|---|---|---|
| 런타임 | Node 22 LTS, pnpm | |
| 언어 | TypeScript (strict) | |
| md 처리 | gray-matter, 할 일·일정 줄은 직접 정규식 파서 | remark는 본문 렌더링이 필요할 때 추가 |
| 날짜 | date-fns | 시간대는 로컬(Asia/Seoul) 기준 |
| 테스트 | vitest | core는 테스트 필수 |
| MCP | @modelcontextprotocol/sdk, zod | stdio 전송 |
| 데스크톱 | Electron, electron-vite | `contextIsolation: true`, `nodeIntegration: false` |
| UI | React, Tailwind, zustand, react-grid-layout, dnd-kit | |
| 파일 감시 | chokidar | 자기 자신이 쓴 변경은 무시하도록 처리 |
| git | simple-git | 볼트 저장소 전용 |
| 패키징 | electron-builder, electron-updater | |

## 7. 동시 수정 처리 (앱 + MCP + Obsidian + git pull)

여러 주체가 같은 파일을 고치기 때문에 core의 쓰기 함수는 항상 다음 순서를 따른다.

1. 수정 직전에 파일을 다시 읽는다 (캐시된 내용으로 쓰지 않음).
2. 대상 줄을 ID로 찾는다. 없으면 실패를 반환한다.
3. 바뀐 줄만 교체해서 임시 파일에 쓰고 rename 한다 (원자적 쓰기).
4. 앱은 chokidar 이벤트로 다시 읽고, 자기가 방금 쓴 변경은 해시로 구분한다.

## 8. 미해결 / 사전 확인

| 항목 | 결과 (2026-11-25 확인) |
|---|---|
| 회사 PC에서 GitHub 접속 | 가능 → git 동기화 그대로 |
| 업무 일정을 외부 저장소(private)에 올리기 | 가능 → 볼트 하나로 통합 |
| 회사 PC 설치 권한 | 있음 → NSIS 설치 파일 기본, portable은 보조 |
| 회사 PC에서 Claude Desktop | 가능 → 집·회사 모두 1순위(MCP) 방식 |

남은 결정: propose_plan 승인 흐름을 MCP 단계에 넣을지 (2단계에서 결정).

## 9. 홈 화면 정보 설계

세부 UI(색, 간격, 위젯 모양)는 만들면서 눈으로 정한다. 여기서는 **무엇을, 어떤 기준으로, 어떤 순서로 보여줄지**만 정한다.

### 원칙

- 앱을 열자마자 "오늘 / 이번 달 / 올해"가 한 화면에 보인다. 스크롤 없이.
- 오늘 > 이번 달 > 올해 순으로 크고 자세하다. 멀수록 요약만.
- 처리해야 할 것(밀린 것, 마감 임박)이 가장 먼저 눈에 띈다.
- 홈에서 바로 체크·이동·추가가 된다. 다른 화면으로 가지 않아도 됨.

### 영역별 내용

| 영역 | 보여줄 것 | 정렬·기준 |
|---|---|---|
| 상단 바 | 날짜·요일, 시간대 인사, 오늘·이번 달·올해 진행률 3개, 동기화 상태, AI 변경 알림 | |
| 오늘 | headline, 지금/다음 카드, 전체 목록(압축) + 미니 타임라인 | [today.md](today.md) 참고 |
| 밀린 할 일 | 지난 Daily의 미완료 + 마감 지난 것 | 오래된 순. 버튼: 오늘로 / 날짜 지정 / Inbox / 완료 / 삭제 |
| 다가오는 마감 | 앞으로 7일 안의 📅 | 날짜순 |
| 이번 달 | 월 목표(체크 가능, 달성률), 이번 달 남은 마감 수, 작은 달력(headline 있는 날 표시) | |
| 올해 | 연 목표(체크 가능, 달성률), 월별 완료량 미니 히트맵 | |
| Inbox | 날짜 없는 할 일 개수 + 상위 몇 개, 빠른 추가 입력창 | 최근 추가순 |

### "오늘 할 일"에 들어가는 조건

1. 오늘 Daily 파일에 있는 미완료 할 일
2. 📅 마감일이 오늘
3. ⏳ 예정일이 오늘
4. 마감이 지났거나, 지난 Daily에 남은 미완료 할 일 → "밀린 할 일"로 따로 묶음

같은 할 일이 여러 조건에 걸려도 한 번만 보인다(🆔로 중복 제거).

### 결정 필요

| 항목 | 제안 |
|---|---|
| 월·연 목표를 체크 가능한 할 일로 | 채택. 달성률을 계산하려면 필요 → vault-format 반영함 |
| 일일 할 일을 월 목표에 연결 | 보류. 나중에 태그(`#목표이름`) 방식으로 검토 |
| 지난 Daily의 미완료를 자동으로 오늘로 옮길지 | 자동 이동 안 함. "밀린 할 일"에 보여주고 사용자가 고름 (파일이 몰래 바뀌지 않게) |
| 주간 단위 | MVP에서는 "다가오는 7일"로 대신. 주간 뷰는 사용해보고 결정 |

## 10. 앱 내장 채팅 (Claude Code 실행)

```
renderer 채팅 패널 ──IPC──▶ main: spawn claude -p
                              --output-format stream-json --verbose --include-partial-messages
                              --mcp-config <앱이 만든 planner 설정> --strict-mcp-config
                              --allowedTools "mcp__planner__*"
                              --resume <세션ID>   (대화 이어가기)
                              cwd = 볼트, stdin 닫기
        ◀── 스트림 이벤트(텍스트, 도구 호출) ── 
파일 변경 → chokidar → 화면 갱신 (Claude가 바꾼 항목 표시)
```

- 로그인: `-p`에서는 `/login` 불가. 앱이 로그인 여부를 확인하고(결과의 인증 오류), 안 돼 있으면 터미널에서 `claude`를 열어 로그인하도록 안내.
- 권한: planner 도구만 허용. 파일 직접 편집·셸 실행은 허용하지 않음.
- 토큰 절약: [token-strategy.md](token-strategy.md). 전용 프롬프트·도구 제한으로 요청당 입력 약 91% 감소(실측). `--bare`는 구독 로그인을 안 써서 사용 불가
- 위험: Claude Code 문서상 `-p`의 기본값이 앞으로 `--bare`(API 키 전용)로 바뀔 예정. 바뀌면 플래그를 다시 맞추고, 막히면 2순위(Claude Desktop)로 대체.

## 11. 다음 할 일

[TODO.md](TODO.md)에 단계별 체크리스트로 정리.
