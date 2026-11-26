# 테마: 기본 ↔ 크리스마스

상태: 단계 1~5 구현 (2026-11-26). 음악은 후순위.

크리스마스 테마 방향 (2026-11-26 수정): 초록·빨강 바탕에 금색 포인트. 금색 선 아이콘(트리·전구·별·선물)을 배경과 섹션 제목에 쓰고, 흰 빛 입자가 나선으로 감아 올라가 그려지는 "은하수 트리"(`components/SpiralTree.tsx`, 직접 그린 canvas)를 쓴다.
- 사이드바 메뉴 아래 빈 공간: 앱을 켜면 그려지고, 탭을 바꿀 때마다 빛 하나가 나선을 타고 올라가 별을 반짝인다.
- 테마를 켜는 순간: 화면 가득 트리가 그려지고 "Merry Christmas"가 뜬다. 저절로 닫히지 않고 눌러야 사라진다 (`ThemeDef.Intro`). 앱을 켤 때는 나오지 않는다.
- OS 애니메이션 줄이기가 켜져 있으면 완성본을 멈춘 채로 그린다.

## 1. 목표

- 테마는 **통째로 바뀌는 스킨**이다. "기본"(지금 디자인)과 "크리스마스" 둘 중 하나를 켜면 앱의 모든 화면이 그 테마로 바뀐다.
- 일부 장식을 켜고 끄는 방식은 쓰지 않는다. 테마 하나에 색·배경·장식·문구·알림·(나중에) 소리까지 모두 들어 있다.
- 크리스마스 테마에는 눈 내리는 배경이 반드시 들어간다.
- 데이터(볼트 md)와 대시보드 배치는 테마와 상관없이 공유한다. 테마를 바꿔도 위젯 위치·크기는 그대로다.
- 켜기/끄기는 설정의 스위치 하나. **날짜와 관계없다** (12월 자동 제안·자동 해제 없음).
- 글꼴은 테마와 별개인 일반 설정이다 (4.1).

## 2. 테마가 바꾸는 것 (전체 목록)

| 영역 | 기본 | 크리스마스 |
|---|---|---|
| 색 토큰 (바탕·면·글자·선·강조·상태색) | 지금 팔레트 | 짙은 초록 바탕, 강조 빨강·초록·금색 |
| 배경 장면 | 단색 | 밤하늘 그라데이션 + 눈 (react-snowfall) |
| 위젯 테두리·그림자 | 지금 카드 | 은은한 빛 + 위쪽 모서리에 전구 줄·호랑가시/리본 (`CardDecor`) |
| 사이드바 | 날씨·시계·하루 호 | 같은 구성 + 메뉴 아래 은하수 트리 |
| 할 일 체크 | 색·움직임 없는 평범한 체크 | 빨간 상자가 톡 튀고 금빛 고리·조각이 퍼진다 (`TaskCheck`). 남은 일 목록은 효과가 끝날 때까지 1.2초 남겨 둔다 |
| 시계 | 흰 막대·바늘 | 같음 (바꾸지 않는다) |
| 문구 | "좋은 오후예요" 등 | 크리스마스 문구 + 12/25까지 남은 날 |
| 빈 상태 그림·문구 | 지금 문구 | 눈사람·선물 같은 작은 SVG |
| 달력 (`calendar` 슬롯) | 공휴일 빨강 | 위: 눈·고드름 + 은은한 전구 줄 + 양 모서리 호랑가시, 금선 사이 월 글자. 아래: 눈밭과 양 끝 작은 트리·선물. 옅은 와인색 요일 줄, 오늘은 초록 화환, 12/24 흐린 ✦D-1과 Christmas Eve, 12/25 트리·Merry Christmas와 옅은 빛. 위젯도 같은 틀을 얇게 (눈 작게, 트리·선물 작게, 호랑가시 하나, 전구 줄 없음). 공휴일 표시는 같은 규칙 |
| 확인 창·알림 토스트 | 지금 디자인 | 테마 색 적용 |
| 시간 알림 팝업 (별도 창) | 지금 디자인 | 테마 색 + 작은 장식 |
| 창 바탕색 (`backgroundColor`) | `#0e0f11` | 테마 바탕색 (켤 때 깜빡임 방지) |
| 소리 (후순위) | 없음 | 배경 음악 재생/정지 |

공휴일 빨강·토요일 파랑, 지난 할 일 경고색처럼 **뜻이 있는 색**은 테마가 바뀌어도 같은 의미로 구분되게 한다. 크리스마스 강조색이 빨강이므로 "경고"는 빨강 대신 다른 모양(밑줄·아이콘)으로도 구분되게 확인한다.

## 3. 구조

### 3.1 테마 선택

- `Prefs.theme: 'default' | 'christmas'` (앱 설정, 볼트 아님).
- renderer: `<html data-theme="christmas">`. 테마 CSS는 `[data-theme=...]` 아래에서 토큰만 다시 정의한다.
- 바꾸는 곳: 설정 창의 "크리스마스 테마" 스위치 (끄면 기본).
- 전환 시 0.4초 정도 크로스페이드.

### 3.2 테마 정의 (코드)

```ts
interface ThemeDef {
  id: 'default' | 'christmas';
  name: string;
  /** 창 바탕색, 알림 팝업 색 (main 프로세스용) */
  native: { bg: string; surface: string; ink: string; muted: string; line: string; tones: Record<'soon' | 'now' | 'end' | 'review', string> };
  /** 화면 뒤 배경 장면 */
  Background?: ComponentType;
  /** 사이드바 위 장식 */
  SidebarOrnament?: ComponentType;
  /** 인사 문구 */
  greeting(period: Period, now: Date): string;
  /** 빈 상태 그림 */
  EmptyArt?: ComponentType;
  clock: { hand: string; tick: string; accentTick?: 'star' };
}
```

- 색은 전부 CSS 토큰, 모양·장식은 `ThemeDef`의 슬롯으로. 컴포넌트는 `useTheme()`으로 슬롯을 꺼내 쓰고, 테마 이름으로 분기하지 않는다.
- `ThemeDef`는 renderer 쪽 `themes/default.tsx`, `themes/christmas.tsx`. main은 `native` 값만 필요하므로 공용 `shared/themes.ts`에 둔다.

### 3.3 선행 작업: 하드코딩된 색 없애기

통째로 바꾸려면 테마 밖에 남는 색이 없어야 한다. 지금 남아 있는 곳:

- `Clock.tsx` 흰색 3곳 → `currentColor` / 토큰
- `notify.ts` 색 11곳 → `ThemeDef.native`
- `main/index.ts` 창 바탕색 → 설정의 테마에서
- `bg-black/55·60` (설정·확인 창 덮개), 그림자의 `rgba(0,0,0,…)` (Timeline·Dashboard·drag) → `--scrim`, `--shadow` 토큰
- `styles.css` 안의 색 정의 → `[data-theme=default]` 블록으로 이동

## 4.1 글꼴 선택

- `Prefs.font: 'pretendard' | 'gowun-batang' | 'malgun'`. 테마와 따로 고른다.
- 목록은 `apps/desktop/src/shared/themes.ts`의 `FONTS`. 각 글꼴에 테두리 있는 꼬리표를 붙인다: Pretendard `default`, 고운바탕 `크리스마스`(어울리는 테마 표시), 맑은 고딕은 꼬리표 없음.
- 고운바탕: `@fontsource/gowun-batang` (OFL), 400·700. 앱에 포함되어 오프라인에서도 동작.
- renderer는 `<html data-font>`로 `--app-font`를 바꾸고, 알림 팝업도 같은 글꼴 파일을 쓴다.

## 4. 쓸 외부 자료

| 용도 | 자료 | 라이선스 | 쓰는 방식 |
|---|---|---|---|
| 눈 | [react-snowfall](https://www.npmjs.com/package/react-snowfall) | MIT | 크리스마스 `Background` 안에서 사용. 의존성 추가 |
| 전구·고드름 아이디어 | [codypearce/christmas-mode](https://github.com/codypearce/christmas-mode) | MIT | 코드는 안 가져오고 참고만. SVG로 직접 그림 |
| 색 조합 참고 | 옵시디언 Merry Christmas / Snowy Eve 테마 | — | 참고만 |
| 음악 (후순위) | [OpenGameArt Jingle Bells](https://opengameart.org/content/jingle-bells) | CC0 | 앱에 포함, 표기 불필요 |
| 음악 대안 | Kevin MacLeod 버전 | CC BY | 쓰면 설정 화면에 출처 표기 |

대안으로 본 것: `@tsparticles/preset-snow`(엔진까지 들어가 무거움), `react-snowf`·`snowfall-js-plugin`(덜 쓰임·라이선스 확인 필요). 눈은 react-snowfall 하나로 간다.

## 5. 눈 배경 규칙

- 위젯 **뒤**에 깔리는 고정 레이어. `pointer-events: none`이라 클릭·드래그를 막지 않는다. 사이드바는 반투명이라 그 뒤로도 보인다. (화면 앞에도 몇 송이를 흘려 봤으나 확인 창 위에서 얼룩처럼 보여 뺐다.)
- 눈송이 수는 적게(80개 안팎), 느리게. 글자 위로는 지나가지 않는다.
- 창이 숨겨지면 멈춘다 (트레이로 내린 상태에서 CPU를 쓰지 않게).
- OS의 "애니메이션 줄이기" 설정이 켜져 있으면 눈을 멈춘 상태로 그린다.
- 나중에 해볼 것: 위젯 윗면에 눈이 쌓이는 효과 (christmas-mode의 accumulation 참고).

## 6. 단계

1. **토큰 정리**: 3.3의 하드코딩 색 제거, 기본 테마를 `[data-theme=default]`로 옮김. 화면이 지금과 똑같아야 함 (캡처 비교).
2. **테마 엔진**: `Prefs.theme`, `data-theme`, `ThemeDef`·`useTheme`, 설정·사이드바 전환 버튼, main 쪽 창 바탕색·알림 팝업 연동.
3. **크리스마스 색**: 팔레트, 위젯 테두리·그림자, 확인 창·토스트·알림 팝업. 뜻이 있는 색(공휴일·경고) 구분 확인.
4. **배경 장면**: 밤하늘 그라데이션 + react-snowfall, 5장의 규칙.
5. **장식 슬롯**: 사이드바 전구 줄, 시계, 인사 문구·D-day, 빈 상태 그림, 12/25 칸.
6. **음악** (후순위): CC0 음원, 사이드바에 재생/정지, 기본은 꺼짐, 볼륨 설정.

단계 1~2가 끝나면 이후 테마(예: 설날)는 `ThemeDef` 하나와 CSS 블록 하나를 추가하는 것으로 끝나야 한다.

## 7. 정한 것

- 테마는 날짜와 상관없는 on/off. 자동 제안·자동 해제 없음.
- 글꼴은 별도 설정, 크리스마스용으로 고운바탕을 넣음.
- 그림자의 검정(`rgba(0,0,0,…)`)은 두 테마 모두 어두운 바탕이라 토큰으로 빼지 않았다. 밝은 테마가 생기면 `--shadow`로 뺀다.
