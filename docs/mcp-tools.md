# MCP 서버 도구 명세 (초안)

`packages/mcp-server`. Claude Desktop이 stdio로 실행한다. 볼트 경로는 환경 변수 `PLANNER_VAULT`로 받는다.

```jsonc
// claude_desktop_config.json (개발 중)
{
  "mcpServers": {
    "planner": {
      "command": "node",
      "args": ["C:/Scheduler/packages/mcp-server/dist/index.js"],
      "env": { "PLANNER_VAULT": "C:/Users/.../PlannerVault" }
    }
  }
}
```

배포 시에는 `.mcpb`(Desktop Extension)로 묶어서 사용자가 Node를 따로 설치하지 않아도 되게 한다.

## 조회 도구

| 도구 | 입력 | 반환 |
|---|---|---|
| `get_today` | - | 오늘 전체 목록(상태 포함), 밀린 할 일, 7일 내 마감 |
| `get_year_goals` | `year?` | 연 목표와 달성률 |
| `get_day` | `date` | headline, 전체 목록(시간·상태 포함), 메모 |
| `get_now` | - | 진행 중·다음 항목, 밀린 시간 할 일, 남은 시간 없는 할 일, 빈 시간 |
| `get_range` | `from`, `to` | 기간 내 날짜별 일정·할 일 |
| `get_month_summary` | `month` | 월 목표 + 날짜별 headline + 미완료 할 일 수 |
| `get_inbox` | - | Inbox 할 일 |
| `search_tasks` | `query?`, `status?`, `dueBefore?`, `priority?` | 조건에 맞는 할 일 (ID 포함) |

## 수정 도구

| 도구 | 입력 | 동작 |
|---|---|---|
| `add_task` | `text`, `date?`(없으면 Inbox), `start?`, `end?`, `due?`, `priority?`, `parentId?` | 할 일 추가, ID 부여 |
| `update_task` | `id`, 바꿀 필드 | 내용·마감·우선순위 수정 |
| `set_task_time` | `id`, `start?`, `end?` | 시간 할당/변경. 둘 다 없으면 시간 빼기 |
| `complete_task` | `id`, `done?` | 완료/완료 취소, ✅ 날짜 기록 |
| `move_task` | `id`, `toDate?`(없으면 Inbox) | 다른 날짜로 이동 |
| `delete_task` | `id` | 삭제 |
| `add_event` | `date`, `start?`, `end?`, `title` | 체크박스 없는 일정 추가 (`start` 없으면 종일) |
| `set_headline` | `date`, `text` | Daily headline 설정 |
| `set_goals` | `period`(`YYYY` 또는 `YYYY-MM`), `goals[]` | 연/월 목표 교체 |

## 계획 도구 (2단계 후반에 결정)

| 도구 | 동작 |
|---|---|
| `propose_plan` | `.planner/proposals/<시각>.md`에 계획 초안 작성. 앱에서 미리보기 후 승인하면 반영 |

Claude Desktop은 도구 호출마다 사용자 승인을 받으므로, 작은 수정은 바로 쓰고 큰 재계획만 proposal로 보내는 방식을 고려한다.

## 리소스 / 프롬프트

| 종류 | 이름 | 내용 |
|---|---|---|
| resource | `planner://format` | vault-format 명세 (Claude가 형식을 참고) |
| prompt | `weekly-review` | 지난주 정리 + 이번 주 계획 요청 템플릿 |
| prompt | `plan-month` | 월 계획 작성 템플릿 |

## 구현 원칙

- 모든 파일 접근은 `packages/core`를 거친다. MCP 서버에 md 파싱 코드를 두지 않는다.
- 볼트 밖 경로는 접근하지 않는다.
- 입력 검증은 zod, 날짜는 `YYYY-MM-DD` 문자열.
- 실패 시 이유를 문장으로 반환한다 (예: "ID k3f9a2 할 일을 찾지 못함").
