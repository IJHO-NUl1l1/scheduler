planer 를 만드는 계획을 짤 예정. 간단한 브레인 스토밍 정도만 할거다. 우선 내가 원하는 스펙은 기본적인 todo list, 화면내 요소들 이동을 아이콘 움직이듯 클릭 & 드래그로 움직이는 기능, 년별 월별 일별 스케쥴 작성 및 요약 (월의 경우 큰 달력으로 간단한 헤드라인만 보이게 등), 현재 시간에 따른 변화 요소, 옵시디언이나 .md 파일 연동 기능, 추가 스펙으로는 ai 를 이용한 플랜 작성 등이 있다. ai 를 이용한 플랜은 건당 api 유료 크래딧이 발생하는 형태로 할 생각은 없고, 한단계를 거치더라도 그냥 일반 웹이나 claude desktop 등을 활용하는 방향으로 codex 는 내가 안써서 claude 쪽으로 해주고 claude 가 문서를 보고 직접 건드는 방향성을 1순위 그게 안되면 그냥 내가 수동으로 웹이든 desktop 이든 입력해서 가져오느걸 2순위로 ai 는 방향성 제시를 좀 자세하게 해봐 어떤 중간 과정을 거쳐야 할지, ai 와 내가 만드는 계획 프로그램이 어떤 db 를 공유할수 있을지 정말 db 로 공유해야할지, md 나 옵시디언이면 어떨지 오히려 git 에 올리고 ai 는 볼수 있으니까 그러면 git에 올린걸 우리가 만들 프로그램이 볼 수 있게 하는 방법을 찾아본다던가? 그리고 우리 프로그램은 설치 프로그램으로 할건데 이경우 어떤 툴을 이용해야하지? 나는 웹 개발만 해봐서 프론트 는 html css js ts react nextjs 등 백은 fatify nodejs db 는 supabase 등 사용해 봤어 언어와 프레임워크 그리고 배포할때까지도 다 설명해

플래너 앱 브레인스토밍
1. 핵심 결정: 데이터를 어디에 둘까

결론: DB가 아니라 .md 파일을 원본으로 두는 걸 추천해. 그 폴더를 옵시디언 볼트로 그대로 쓰고, 앱과 Claude 둘 다 그 폴더를 직접 읽고 쓰는 구조야.

방식	장점	단점
.md 폴더 (추천)	옵시디언 연동이 공짜로 따라옴. Claude가 그냥 텍스트로 읽고 고칠 수 있음. git과 궁합이 좋음. 앱이 망해도 데이터는 남음	날짜 범위 검색 같은 쿼리가 느림 → 인덱스로 해결
Supabase	실시간 동기화, 모바일 확장 쉬움	Claude가 만지려면 MCP를 따로 붙여야 함. 오프라인 불가. 옵시디언 연동은 결국 따로 만들어야 함
로컬 SQLite만 사용	빠름	AI와 옵시디언 둘 다 접근하기 불편함

실제 구조는 이렇게 가면 돼:

원본: .md 파일
앱 내부: SQLite를 검색과 달력 렌더링용 캐시/인덱스로만 사용. 파일이 바뀌면 다시 읽어서 갱신하고, 지워도 다시 만들 수 있게.
화면 배치(드래그 위치) 같은 UI 상태: 일정 데이터가 아니니까 .planner/layout.json에 따로 저장.
폴더 구조 예시
PlannerVault/
├─ CLAUDE.md              ← AI용 규칙서 (파일 형식, 작성 규칙)
├─ Yearly/2026.md
├─ Monthly/2026-11.md     ← 월 목표 + 날짜별 헤드라인
├─ Daily/2026-11-24.md    ← 그날 일정/할일 상세
├─ Inbox.md               ← 날짜 없는 todo
└─ .planner/layout.json   ← 위젯 위치 (앱 전용)
파일 형식

옵시디언 Tasks 플러그인 문법을 따르면 옵시디언에서도 바로 동작해.

markdown
---
date: 2026-11-24
headline: 복지관 공모사업 게시판 시안
---
## 일정
- 10:00-11:00 프린터 점검
- 14:00 회의

## 할 일
- [ ] 학업계획서 초안 📅 2026-11-28 ⏫
- [x] 네트워크 장애 보고 ✅ 2026-11-24

월간 큰 달력은 각 Daily 파일 frontmatter의 headline만 모아서 보여주면 끝이야.

2. AI 연동: API 크레딧 없이
1순위: Claude가 파일을 직접 만지는 방식

A. Claude Desktop + MCP (가장 추천)
Claude Desktop에 MCP 서버를 붙이면 Pro/Max 구독 안에서 Claude가 로컬 파일을 직접 읽고 쓸 수 있어. API 과금이 없어. 방법은 두 단계로 나눠서 가면 돼.

바로 시작할 때: 공식 filesystem MCP 서버를 볼트 폴더로만 제한해서 연결. Claude는 CLAUDE.md 규칙을 보고 md를 수정해. 코드를 하나도 안 짜도 오늘 당장 돼.
제대로 만들 때: 플래너 전용 MCP 서버를 직접 만들어서 앱에 같이 넣기. 마침 MCP 서버를 만들 계획이 있었으니 연습 겸 좋을 거야.
노출할 도구 예시: get_schedule(from, to), add_task(...), complete_task(id), get_month_summary(month), propose_plan(...)
Claude가 md를 막 고치는 대신 정해진 도구로만 수정하니까 형식이 깨질 일이 없어.
나중에 Desktop Extension(.mcpb) 패키지로 만들면 Claude Desktop에 클릭 한 번으로 설치할 수 있어.

B. Claude Code
볼트 폴더에서 claude를 실행하면 CLAUDE.md를 읽고 파일을 직접 편집해. 이것도 구독 사용량 안에서 돌아가. 큰 재계획 작업(예: "다음 달 전체 계획 짜줘")에 잘 맞아.

흐름

나: "이번 주 할 일 정리하고 금요일까지 학업계획서 일정 쪼개줘"
 → Claude Desktop이 MCP로 get_schedule 호출
 → add_task 여러 번 호출 (md 파일 수정됨)
 → 우리 앱은 파일 변경을 감지(chokidar)해서 화면 자동 갱신

안전장치: AI가 고친 내용은 앱에서 "AI 변경사항" 배지나 diff로 보여주고, 볼트를 git으로 관리하면 언제든 되돌릴 수 있어.

2순위: 수동 복사/붙여넣기
앱의 "Claude에게 계획 요청" 버튼을 누르면 현재 일정, 형식 규칙, 요청 문장을 묶은 프롬프트가 클립보드에 복사되고 claude.ai가 열림
Claude가 정해진 형식의 md(또는 JSON) 블록으로 답함
그걸 복사해서 앱의 "가져오기"에 붙여넣으면 앱이 파싱해서 미리보기를 보여주고, 승인하면 반영

핵심은 출력 형식을 엄격하게 고정하는 거야. claude.ai의 Project에 형식 규칙을 지침으로 넣어두면 매번 설명할 필요가 없어.

git 아이디어에 대해
좋은 점: 집 노트북과 회사 데스크톱 사이의 동기화 수단으로 아주 좋아. 앱이 저장할 때 자동 commit, 시작할 때 pull 하게 만들면 돼(simple-git).
AI 쪽에서 보면: claude.ai에 GitHub 저장소를 연결하면 웹에서도 저장소를 읽을 수 있어. 다만 웹 채팅은 읽기 위주라서, 쓰기까지 하려면 결국 Claude Code나 MCP가 필요해. 그래서 git은 "AI 연동 방식"이라기보다 동기화 + 백업 + 되돌리기 용도로 보는 게 맞아.
주의: 회사(관공서) PC는 GitHub 접속이 막혀 있거나 외부 저장소에 업무 정보를 올리는 게 보안 규정에 걸릴 수 있어. 업무 일정이 섞이면 꼭 확인해봐. 대안으로는 private repo, 개인/업무 볼트 분리, Syncthing 같은 방법이 있어.
3. 기능별 구현 아이디어
기능	구현
Todo	Inbox.md와 Daily 파일의 - [ ] 파싱. 체크하면 파일에 바로 반영
아이콘처럼 드래그	react-grid-layout: 위젯을 격자에 놓고 끌어서 이동하고 크기 조절. 위치는 layout.json에 저장. 할 일 카드끼리 순서를 바꾸는 건 dnd-kit
연/월/일 뷰	연: 12개월 히트맵과 월 목표 / 월: 큰 달력에 headline만 / 일: 타임라인. FullCalendar를 쓰거나 date-fns로 직접 만들기
시간에 따른 변화	시간대별 테마(아침·낮·저녁·밤), 일간 뷰의 현재 시각 라인, 오늘·이번 달·올해 진행률 바, 마감 지난 항목 강조, 시간대별 인사말
옵시디언 연동	같은 폴더를 공유하니까 따로 할 게 거의 없음. Tasks 문법과 frontmatter만 맞추면 됨
4. 설치형 앱 기술 스택

Next.js는 데스크톱 앱에는 안 맞아. 서버 렌더링이 필요 없으니까 Vite + React + TS로 가.

데스크톱 프레임워크 선택
	Electron (추천)	Tauri 2
백엔드 언어	Node.js: 이미 아는 언어	Rust (JS 플러그인으로 상당 부분 커버 가능)
용량	무거움 (100MB 안팎)	가벼움 (수 MB, Windows 내장 WebView2 사용)
파일 감시, git, SQLite, MCP SDK	전부 Node 패키지로 한 프로세스 안에서 처리	MCP 서버를 Node로 쓰면 sidecar로 따로 묶어야 함
학습 비용	낮음	중간

지금 경험(Node, Fastify)으로 보면 Electron이 제일 빨리 완성까지 가는 길이야. 용량이 신경 쓰이면 MVP 이후에 Tauri로 옮기는 것도 가능해. 프론트는 그대로 재사용할 수 있어.

스택 정리
셸: Electron + electron-vite (개발 환경)
UI: React, TypeScript, Tailwind, zustand(상태 관리), date-fns
드래그: react-grid-layout, dnd-kit
md 처리: gray-matter(frontmatter), remark/unified(본문 파싱)
파일 감시: chokidar
인덱스 DB: better-sqlite3
git 동기화: simple-git
MCP 서버: @modelcontextprotocol/sdk (TS). 앱 안에 같이 넣고 Electron 내장 Node로 실행
구조: main 프로세스(파일, DB, git 담당)와 renderer(React)를 preload의 IPC로 연결. 보안상 renderer에서 Node 직접 접근은 끄기.
배포
빌드/설치 파일: electron-builder → Windows는 NSIS .exe 설치 파일, Mac은 .dmg
자동 업데이트: electron-updater + GitHub Releases
CI: GitHub Actions에서 태그를 푸시하면 Windows/Mac 빌드 후 Release에 자동 업로드
코드 서명: 서명이 없으면 Windows에서 SmartScreen 경고가 떠. 개인용이면 "추가 정보 → 실행"으로 넘어가면 되고, 배포까지 생각하면 인증서가 필요해. Mac은 Apple 개발자 계정으로 공증(notarization)이 필요해.
회사 PC: 관공서는 설치 권한이 제한된 경우가 많아. 설치 없이 실행되는 portable 빌드도 같이 만들어두면 편해 (electron-builder portable 타깃).
5. 단계별 로드맵
MVP: 볼트 폴더 선택, md 읽고 쓰기, Todo, 일간·월간 뷰
드래그 위젯 레이아웃, 연간 뷰, 시간에 따른 변화 요소
AI 1차: 공식 filesystem MCP와 CLAUDE.md로 Claude Desktop 연동 (코드 거의 없이)
AI 2차: 전용 MCP 서버 직접 개발, 클립보드 가져오기(2순위 방식)
git 자동 동기화
설치 파일, 자동 업데이트, CI

3단계는 앱이 없어도 지금 바로 해볼 수 있어. 볼트 폴더와 CLAUDE.md를 먼저 만들고 Claude Desktop에서 써보면 md 형식을 미리 검증할 수 있어. 다음 단계로 CLAUDE.md 초안이나 md 형식 명세를 구체화해볼까?

개인적으로는 옵시디언 보다 db 나 git 등의 문서에 쓰고 싶긴 하다 . 옵시디언의 경우 유료 구독이 되어야 내용이 로컬에만 그치는것이 아니라 계정에 연동이 되는데 만약 무료로 쓰면 로컬 에만 남아서 다른 기기에서는 접근이 불가능 하잖아 아니면 내가 알고 있는 이 옵시디언에 대한 내용이 틀렸다면 나에게 알려줘

반은 맞고 반은 조금 달라.

맞는 부분: Obsidian 공식 동기화 서비스(Obsidian Sync)는 유료야. Standard 플랜이 연간 결제 시 월 $4, 월간 결제 시 월 $5부터 시작해. 동기화를 빼면 핵심 앱 자체는 완전히 무료야. 
obsidian
eesel

다른 부분: 무료로 쓴다고 해서 "로컬에만 갇히는" 건 아니야. Obsidian 볼트는 결국 그냥 .md 파일이 들어 있는 평범한 폴더라서, 그 폴더를 다른 방법으로 동기화하면 돼. Obsidian 측도 로컬 파일 기반이라 유료 서비스에 무료 대안과 셀프호스팅 옵션이 많다고 직접 말하고 있어. 
obsidian

Git: 대표적인 게 Obsidian Git 플러그인이고, 볼트 안에서 자동으로 commit, pull, push 하고 변경 내역도 볼 수 있어. 다만 모바일에서는 제약이 커서, 기기와 남은 RAM에 따라 clone/pull 도중 Obsidian이 크래시할 수 있다고 해. 
obsidian
클라우드 폴더: 볼트를 Google Drive, OneDrive, Dropbox 동기화 폴더 안에 두는 방법
Syncthing: 기기끼리 직접 동기화하는 방법

단점도 있어. 무료 대안들은 동기화 충돌이 생길 수 있고, 유료 Sync는 종단간 암호화와 충돌 해결로 이 문제를 처리해준다는 평가가 있어. 두 기기에서 같은 파일을 동시에 고치지만 않으면 git으로 충분히 버틸 수 있는 수준이야. 
toolradar

그래서 원하는 방향과 잘 맞아

지난번 제안의 핵심은 "Obsidian을 쓰자"가 아니라 **"원본을 .md 파일로 두자"**였어. Obsidian은 그 폴더를 열어볼 수 있는 뷰어 중 하나일 뿐이라 안 써도 돼. 원하는 "git 문서에 쓰기"는 이렇게 그대로 가면 돼.

.md 파일 (원본)  ←→  private GitHub repo  ←→  다른 기기
      ↑                     ↑
   우리 앱             Claude (Claude Code / MCP로 로컬 폴더,
 (자동 commit/pull)      claude.ai는 GitHub 연결로 읽기)
동기화는 우리 앱이 직접 맡으면 돼(simple-git으로 저장할 때 commit/push, 시작할 때와 주기적으로 pull). Obsidian 플러그인에 의존할 필요가 없어.
덤으로 변경 이력과 되돌리기가 생기고, AI가 잘못 고친 것도 git으로 되돌릴 수 있어.
Obsidian은 원하면 같은 폴더를 열어서 보조 뷰어로 쓰고, 싫으면 아예 빼면 돼.
DB(Supabase)로 갈 경우와 비교
	md + git	Supabase
기기 간 동기화	pull/push 방식 (몇 초~몇 분 지연)	실시간
오프라인	완벽하게 됨	따로 처리해야 함
Claude 접근	파일이라 바로 됨	Supabase MCP를 연결해야 함 (가능은 함)
나중에 모바일 앱/웹	조금 번거로움	쉬움
비용	무료	무료 티어 안에서는 무료 (비활성 프로젝트 일시정지 등 제약이 있음)

나라면 md + git으로 시작할 거야. AI 연동이 제일 단순해지고, 나중에 실시간 동기화나 모바일이 꼭 필요해지면 md를 Supabase로 옮기는 동기화 계층을 추가하면 돼.

한 가지 확인할 게 있어. 회사 PC에서 GitHub 접속이 되는지, 업무 일정을 외부 저장소에 올려도 되는지는 미리 봐둬. 이게 막히면 동기화 방식 자체가 바뀌어야 해.

전체 구조를 다이어그램으로 먼저 정리하고, 나머지 결정 사항은 표로 정리할게. 다이어그램은 아래에.

1. 데이터 구조
구분	위치	역할
원본 데이터	.md 파일 (볼트 폴더)	일정과 할 일의 유일한 원본
검색/렌더링	SQLite (앱 내부)	캐시 용도. 지워도 md에서 다시 만들 수 있음
UI 상태	.planner/layout.json	위젯 위치와 크기
동기화	private GitHub repo	기기 간 동기화, 백업, 변경 이력
옵시디언	(선택) 같은 폴더 열기	보조 뷰어. 안 써도 됨
파일	내용	쓰이는 곳
Yearly/2026.md	연간 목표	연간 뷰
Monthly/2026-11.md	월 목표와 메모	월간 뷰
Daily/2026-11-24.md	frontmatter headline, 일정, - [ ] 할 일	일간 뷰. headline은 월 달력에 표시
Inbox.md	날짜 없는 todo	Todo 위젯
CLAUDE.md	파일 형식과 작성 규칙	Claude가 읽는 규칙서
2. AI 연동 (API 과금 없음)
우선순위	방식	흐름	장점	단점
1-A	Claude Desktop + 공식 filesystem MCP	볼트 폴더만 열어서 연결 → Claude가 md 수정	코드 없이 바로 가능	형식이 깨질 위험이 있음
1-B	Claude Desktop + 전용 MCP 서버	add_task, get_schedule 같은 도구로만 수정	형식이 안전하고 구조적임	직접 개발해야 함
1-C	Claude Code	볼트 폴더에서 claude 실행	대규모 재계획에 강함	터미널 사용
2	claude.ai 웹 복사/붙여넣기	앱이 프롬프트 복사 → 웹에 붙여넣기 → 결과를 앱으로 가져오기 → 미리보기 후 반영	어디서나 가능	수동 단계가 있음
전용 MCP 도구 (안)	기능
get_schedule(from, to)	기간 내 일정 조회
get_month_summary(month)	월간 headline 요약
add_task / complete_task	할 일 추가와 완료
propose_plan	계획 초안을 제안 상태로 작성 (앱에서 승인)
3. 저장 방식 비교 (결정: md + git)
	md + git ✅	Supabase	Obsidian Sync
비용	무료	무료 티어 있음	월 $4~
기기 동기화	pull/push (약간 지연)	실시간	실시간
오프라인	◎	△	◎
Claude 접근	◎ 파일 그대로	○ MCP 필요	◎
이력/되돌리기	◎ git	△	○
모바일 확장	△	◎	○
4. 기능별 구현
기능	구현 방법	라이브러리
Todo	- [ ] 파싱하고 체크하면 파일에 반영	remark, gray-matter
아이콘처럼 드래그	격자 위젯 이동과 크기 조절	react-grid-layout
카드 순서 변경	리스트 안에서 드래그	dnd-kit
연·월·일 뷰	연: 히트맵 / 월: 큰 달력 + headline / 일: 타임라인	FullCalendar 또는 date-fns로 직접 구현
시간에 따른 변화	시간대 테마, 현재 시각 라인, 일·월·연 진행률, 마감 지난 항목 강조	date-fns, CSS 변수
파일 변경 감지	AI나 다른 기기가 수정하면 화면 자동 갱신	chokidar
동기화	저장할 때 commit/push, 시작할 때 pull	simple-git
5. 기술 스택
계층	선택	대안 / 비고
데스크톱 셸	Electron + electron-vite	Tauri 2 (가볍지만 Rust)
프론트	React + TypeScript + Vite	Next.js는 데스크톱 앱에 부적합
스타일/상태	Tailwind, zustand	
백엔드 (main 프로세스)	Node.js: 파일, DB, git 처리	renderer와는 preload IPC로 연결
인덱스 DB	better-sqlite3	
MCP 서버	@modelcontextprotocol/sdk (TS)	Electron 내장 Node로 실행
6. 빌드와 배포
단계	도구	결과물 / 메모
패키징	electron-builder	Windows .exe(NSIS), portable, Mac .dmg
자동 업데이트	electron-updater	GitHub Releases에서 배포
CI	GitHub Actions	태그 push하면 자동 빌드와 릴리스
코드 서명	(선택) 인증서	없으면 SmartScreen 경고. 개인용이면 무시 가능
MCP 배포	Desktop Extension (.mcpb)	Claude Desktop에 클릭 한 번으로 설치
7. 로드맵
단계	목표	완료 기준
0	볼트 + CLAUDE.md + Claude Desktop filesystem MCP	앱 없이 Claude로 md 일정 관리가 됨
1	MVP: md 읽고 쓰기, Todo, 일간·월간 뷰	앱에서 일상적으로 사용 가능
2	드래그 위젯, 연간 뷰, 시간에 따른 변화 요소	레이아웃 저장과 복원
3	git 자동 동기화	집과 회사에서 같은 데이터
4	전용 MCP 서버, 클립보드 가져오기	Claude가 도구로 안전하게 수정
5	설치 파일, 자동 업데이트, CI	.exe 설치와 업데이트 동작
8. 사전 확인 사항
항목	이유
회사 PC에서 GitHub 접속이 되는지	막혀 있으면 동기화 방식을 바꿔야 함
업무 일정을 외부 저장소에 올려도 되는지	보안 규정. 필요하면 개인/업무 볼트 분리
회사 PC 설치 권한	없으면 portable 빌드 사용

다이어그램의 박스를 누르면 해당 부분을 더 자세히 설명해줄게. Whiteboard에 올려서 계속 고쳐가며 볼까?

mcp서버 만드는 플랜으로 