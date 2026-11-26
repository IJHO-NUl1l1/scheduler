# TODO

[PLAN.md](PLAN.md)의 로드맵을 실제 작업 단위로 나눈 체크리스트. 단계 순서대로 진행한다.

## 0. 볼트 준비 · 형식 검증 (코드 없음)

- [ ] 개인 볼트 private GitHub repo 생성 (예: `planner-vault`)
- [ ] `vault-template` 내용을 볼트에 복사, 예시 파일은 오늘 날짜로 교체
- [ ] 집 PC와 회사 PC에 볼트 clone
- [ ] Claude Desktop에 공식 filesystem MCP 연결 (볼트 폴더로만 제한), 집·회사 둘 다
- [ ] 1~2주 실제 사용: 일정·할 일·월 목표를 Claude로 작성해보기
- [ ] 쓰면서 불편한 형식 메모 → [vault-format.md](vault-format.md) 확정
- [ ] 홈 화면에 꼭 보고 싶은 항목 메모 → PLAN.md 9장 보강

## 1. core

- [x] 이 코드 저장소 `git init`, `.gitignore`
- [ ] 코드 저장소 GitHub repo 생성, 첫 커밋
- [x] pnpm 워크스페이스: 루트 `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- [x] `packages/core` 초기화 (TS strict, vitest)
- [x] 모델 타입: Task, Event, DayNote, MonthNote, YearNote
- [x] 파서: frontmatter, 섹션 분리, 할 일 줄(기호 전부), 일정 줄
- [x] 쓰기: 줄 단위 교체·추가·삭제, 🆔 생성, 원자적 쓰기
- [x] 볼트: 경로 규칙, 없는 파일 생성, 파일 목록
- [x] 조회: 기간 조회, 월 요약, 할 일 검색
- [x] 시간 파싱: 할 일 줄 앞 `HH:mm[-HH:mm]`, 종일, 예전 `## 일정` 섹션 호환
- [x] 홈 화면용 조회: 오늘 할 일(중복 제거), 밀린 할 일, 다가오는 7일 마감, 월·연 목표 달성률, 진행률
- [x] 시간 상태 함수: `timeStatus(item, now)`, 목록 정렬, 다음 알림 시각, 빈 시간·겹침 계산 ([today.md](today.md))
- [x] 테스트: 샘플 볼트 왕복(읽고 다시 써도 동일), 모르는 내용 보존, 각 조회 조건

## 2. MCP 서버

- [x] `packages/mcp-server` 초기화 (@modelcontextprotocol/sdk, zod)
- [x] 조회 도구: get_today, get_year_goals, get_day, get_range, get_month_summary, get_inbox, search_tasks
- [x] 조회 도구 추가: get_now
- [x] 수정 도구: add_task, update_task, set_task_time, complete_task, move_task, delete_task, add_event, set_headline, set_goals
- [x] 리소스 `planner://format`, 프롬프트 weekly-review, plan-month
- [ ] Claude Desktop 설정에 연결 (README 참고) — 전용 MCP가 준비돼서 0단계의 filesystem MCP는 건너뛰어도 됨
- [ ] 1~2주 실사용하면서 도구 설명·출력 형식 다듬기
- [ ] propose_plan 필요 여부 결정

## 3. 데스크톱 MVP

- [x] `apps/desktop` electron-vite 초기화 (React, TS, Tailwind, zustand)
- [x] main: 볼트 폴더 선택·기억, core 연결, IPC 핸들러
- [x] preload: contextBridge API
- [x] chokidar 감시 → 화면 갱신 (자기 쓰기 무시)
- [x] **홈 화면**: 상단 바, 오늘, 밀린 할 일, 다가오는 마감, 이번 달, 올해, Inbox (PLAN.md 9장)
- [x] 홈 오늘 영역: 지금/다음 카드, 압축 전체 목록, 미니 타임라인(근무 시간 범위)
- [x] 홈에서 바로: 체크, 미루기, 오늘로/날짜 지정/Inbox 이동, 빠른 추가
- [x] 화면 구조 개편: 대시보드(요약) + 오늘/캘린더/목표/인박스 탭 ([ui-structure.md](ui-structure.md))
- [x] 일간(오늘 탭): 날짜 이동, 헤드라인 편집, 전체 목록 + 타임라인(드래그 이동·길이 조절, 목록에서 끌어 놓기)
- [x] 항목 편집 패널, 모든 수정 되돌리기, 완료 항목 제자리 유지
- [x] 알림: main 프로세스 타이머, 시작 전/시작/끝/하루 마무리/아침 요약, 파일 변경 시 재계산
- [x] 트레이 상주 (닫으면 트레이로)
- [ ] 로그인 시 자동 실행(선택), 알림 설정 화면(미리 알림 분, 마무리 시각, 방해 금지), 알림의 완료/연장 버튼
- [x] 캘린더 탭: 월(큰 달력, 날짜 간 드래그) / 주(7열)
- [x] 목표 탭: 월 목표 / 연 목표 / 연간 기록(히트맵)
- [ ] 실제로 써보면서 UI 다듬기

- [x] 앱 내장 채팅: `claude -p` stream-json 실행, 응답 스트리밍 표시, 세션 이어가기 (PLAN.md 10장)
- [x] Claude Code 설치·로그인 확인, 안 돼 있으면 안내
- [x] 플래너 전용 시스템 프롬프트, planner 도구만 허용, 토큰 사용량 줄이기 ([token-strategy.md](token-strategy.md))
- [ ] 5시간 사용 한도 표시 (`rate_limit_event`)
- [ ] 설정 화면 (근무 시간, 모델, 대화 턴 제한, claude 경로)
- [x] Claude가 바꾼 항목 표시 (변경 배지)

## 4. UI 확장

- [x] 대시보드 위젯·섹션 편집(추가·빼기·크기·이동), `.planner/layout.json` 저장
- [x] 날씨(사이드바), 시계 디지털/아날로그 선택, 설정 화면
- [x] 날짜 간 드래그 이동 (HTML5 드래그)
- [ ] 목록 안 순서 바꾸기 (dnd-kit)
- [x] 연간 뷰 (월별 히트맵 + 목표)
- [ ] 시간대 테마, 현재 시각 라인, 마감 지난 항목 강조
- [ ] AI 변경 표시 (최근 외부 변경 배지 / diff)

## 5. git 동기화

- [ ] simple-git: 시작 시·주기적 pull, 저장 시 commit, 일정 간격 push
- [ ] 충돌 감지와 알림, 동기화 상태 표시

## 6. 3순위 AI (웹 복사·붙여넣기)

- [ ] "Claude에게 요청": 현재 일정 + 형식 규칙 + 요청을 프롬프트로 복사
- [ ] "가져오기": 붙여넣은 md 파싱 → 미리보기 → 승인 시 반영

## 7. 배포

- [ ] electron-builder: NSIS 설치 파일 (+ portable)
- [ ] electron-updater + GitHub Releases
- [ ] GitHub Actions: 태그 push → 빌드 → 릴리스
- [ ] MCP 서버 `.mcpb` 패키징
