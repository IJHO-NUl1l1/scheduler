import { useEffect, useState, type ReactNode } from 'react';
import type { Priority } from '@scheduler/core/pure';
import { useStore } from '../store';
import { addDaysStr, fmtShortDate, todayStr } from '../lib';
import { Icon, IconButton, Segmented } from './ui';

/**
 * 항목 편집 패널 (오른쪽). 바꾸는 즉시 파일에 반영되고 하단에 되돌리기가 뜬다.
 */
export function Editor() {
  const { editing: item, edit, op } = useStore();
  const [text, setText] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [sub, setSub] = useState('');

  useEffect(() => {
    setText(item?.text ?? '');
    setStart(item?.time?.start ?? '');
    setEnd(item?.time?.end ?? '');
  }, [item?.ref, item?.text, item?.time?.start, item?.time?.end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && edit(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [edit]);

  if (!item) return null;
  const today = todayStr();
  const isGoal = item.section === '목표';
  const where = item.fileDate ?? null;
  const ref = item.ref;

  const saveText = () => {
    const t = text.trim();
    if (t && t !== item.text) void op('update', ref, { text: t });
  };
  const saveTime = (s: string, e: string) => {
    if (!s) {
      if (item.time) void op('setTime', ref);
      return;
    }
    if (e && e <= s) return;
    if (s === item.time?.start && (e || undefined) === item.time?.end) return;
    void op('setTime', ref, s, e || undefined);
  };

  return (
    <aside className="absolute top-0 right-0 bottom-0 z-40 flex w-[360px] flex-col border-l border-line bg-surface shadow-2xl shadow-black/50">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-[13px] font-semibold">{isGoal ? '목표 편집' : '항목 편집'}</span>
        <span className="text-[11px] text-faint">{where ? fmtShortDate(where, today) : item.file.replace(/\.md$/, '')}</span>
        <IconButton icon="close" title="닫기 (Esc)" onClick={() => edit(null)} className="ml-auto" />
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          rows={2}
          className="w-full resize-none rounded-lg bg-surface-2 px-3 py-2 text-[15px] font-medium outline-none focus:bg-hover"
        />

        {!isGoal && (
          <Field label="종류">
            <Segmented
              value={item.kind === 'note' ? 'task' : item.kind}
              options={[
                ['task', '할 일'],
                ['event', '일정'],
                ['allday', '종일'],
              ]}
              onChange={(k) => k !== item.kind && void op('setKind', ref, k)}
            />
            <p className="mt-1 text-[11px] text-faint">일정은 체크 없이 시간이 지나면 끝나요 (회의 등)</p>
          </Field>
        )}

        {item.kind === 'task' && (
          <Field label="상태">
            <button
              type="button"
              onClick={() => void op('complete', ref, !item.done)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] ${item.done ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-ink hover:bg-hover'}`}
            >
              <Icon name="check" size={14} />
              {item.done ? `완료됨${item.doneDate ? ` · ${fmtShortDate(item.doneDate, today)}` : ''}` : '완료로 표시'}
            </button>
          </Field>
        )}

        {!isGoal && (
          <Field label="날짜">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={where ?? ''}
                onChange={(e) => e.target.value && e.target.value !== where && void op('move', ref, e.target.value)}
                className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none"
              />
              <Pill active={where === today} onClick={() => void op('move', ref, today)}>오늘</Pill>
              <Pill active={where === addDaysStr(today, 1)} onClick={() => void op('move', ref, addDaysStr(today, 1))}>내일</Pill>
              <Pill active={where === null && item.file === 'Inbox.md'} onClick={() => void op('move', ref, null)}>인박스</Pill>
            </div>
          </Field>
        )}

        {!isGoal && item.kind !== 'allday' && (
          <Field label="시간">
            <div className="flex items-center gap-1.5">
              <input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} onBlur={() => saveTime(start, end)} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none" />
              <span className="text-faint">–</span>
              <input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} onBlur={() => saveTime(start, end)} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none" />
              {item.time && <Pill onClick={() => void op('setTime', ref)}>시간 빼기</Pill>}
            </div>
            {end && start && end <= start && <p className="mt-1 text-[11px] text-warn">끝 시간이 시작보다 빨라요</p>}
          </Field>
        )}

        {item.kind === 'task' && (
          <Field label="마감">
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={item.due ?? ''}
                onChange={(e) => void op('update', ref, { due: e.target.value || null })}
                className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none"
              />
              {item.due && <Pill onClick={() => void op('update', ref, { due: null })}>지우기</Pill>}
            </div>
          </Field>
        )}

        {item.kind === 'task' && (
          <Field label="우선순위">
            <Segmented<Priority | 'none'>
              value={item.priority ?? 'none'}
              options={[
                ['none', '없음'],
                ['low', '낮음'],
                ['medium', '중간'],
                ['high', '높음'],
                ['highest', '최상'],
              ]}
              onChange={(p) => void op('update', ref, { priority: p === 'none' ? null : p })}
            />
          </Field>
        )}

        {item.kind === 'task' && !isGoal && (
          <Field label="하위 할 일 추가">
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && sub.trim()) {
                  void op('addTask', { text: sub.trim(), parentRef: ref });
                  setSub('');
                }
              }}
              placeholder="입력 후 Enter"
              className="w-full rounded-lg bg-surface-2 px-3 py-1.5 text-[13px] outline-none placeholder:text-faint focus:bg-hover"
            />
          </Field>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={() => void op('remove', ref)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-warn hover:bg-warn-soft"
        >
          <Icon name="trash" size={14} /> 삭제
        </button>
        <span className="ml-auto text-[11px] text-faint">바꾸면 바로 저장 · 되돌리기 가능</span>
      </footer>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}

function Pill({ children, onClick, active }: { children: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-2.5 py-1.5 text-[12px] ${active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted hover:bg-hover hover:text-ink'}`}>
      {children}
    </button>
  );
}
