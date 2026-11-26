# 0001. md 파일을 원본으로, git으로 동기화

- 날짜: 2026-11-24
- 상태: 채택

## 결정
일정·할 일의 원본은 볼트 폴더의 .md 파일. 기기 간 동기화는 볼트를 private git repo로 두고 앱이 commit/pull/push 한다.

## 이유
- Claude(MCP, Claude Code)가 파일을 바로 읽고 쓸 수 있다.
- 무료이고 오프라인에서 완벽히 동작한다. 이력과 되돌리기가 생긴다.
- Obsidian은 같은 폴더를 여는 선택적 뷰어로 남는다. Obsidian Sync(유료)가 필요 없다.

## 대안
- Supabase: 실시간·모바일에 유리하지만 Claude 접근에 MCP가 따로 필요하고 오프라인이 어렵다. 필요해지면 md ↔ Supabase 동기화 계층을 나중에 추가.
- 로컬 SQLite 단독: AI와 Obsidian 접근이 불편.
