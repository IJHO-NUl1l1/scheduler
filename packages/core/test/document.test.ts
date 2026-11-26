import { describe, expect, it } from 'vitest';
import { itemBlock, parseDocument } from '../src/index.js';

const DAILY = `---
date: 2026-11-24
headline: 게시판 시안
---
## 할 일
- 종일 연차
- [ ] 10:00-11:00 프린터 점검 🆔 a7k2m9
- [ ] 학업계획서 초안 🆔 k3f9a2
  - [ ] 16:00-17:00 자료 조사 🆔 k3f9b0
  - [ ] 목차 잡기 🆔 k3f9b1
- [x] 장애 보고 🆔 p01c7d ✅ 2026-11-24

## 메모
- [ ] 메모 안의 체크박스는 항목이 아님
\`\`\`
## 코드 안 제목
\`\`\`
`;

describe('parseDocument', () => {
  const doc = parseDocument(DAILY, 'Daily/2026-11-24.md');

  it('파일 종류와 frontmatter', () => {
    expect(doc.type).toBe('daily');
    expect(doc.key).toBe('2026-11-24');
    expect(doc.frontmatter['headline']).toBe('게시판 시안');
    expect(doc.frontmatter['date']).toBe('2026-11-24');
  });

  it('섹션 (코드 블록 안 제목 무시)', () => {
    expect(doc.sections.map((s) => s.title)).toEqual(['', '할 일', '메모']);
  });

  it('항목은 할 일 섹션에서만', () => {
    expect(doc.items.map((i) => i.text)).toEqual(['연차', '프린터 점검', '학업계획서 초안', '자료 조사', '목차 잡기', '장애 보고']);
  });

  it('부모-하위 관계와 fileDate, ref', () => {
    const parent = doc.items.find((i) => i.id === 'k3f9a2')!;
    const child = doc.items.find((i) => i.id === 'k3f9b0')!;
    expect(child.parentLine).toBe(parent.line);
    expect(child.fileDate).toBe('2026-11-24');
    expect(child.ref).toBe('k3f9b0');
    expect(itemBlock(doc, parent)).toEqual([parent.line, parent.line + 3]);
  });

  it('ID 없는 항목의 ref는 파일#줄', () => {
    const d = parseDocument('## 할 일\n- [ ] 손으로 쓴 것\n', 'Inbox.md');
    expect(d.items[0]?.ref).toBe('Inbox.md#L2');
  });

  it('예전 ## 일정 섹션 호환', () => {
    const d = parseDocument('## 일정\n- 10:00 회의\n- 워크숍\n', 'Daily/2026-11-01.md');
    expect(d.items.map((i) => i.kind)).toEqual(['event', 'allday']);
  });

  it('CRLF 유지', () => {
    expect(parseDocument('## 할 일\r\n- [ ] a\r\n', 'Inbox.md').eol).toBe('\r\n');
  });
});
