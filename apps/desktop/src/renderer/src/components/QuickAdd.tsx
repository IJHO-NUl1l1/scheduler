import { useMemo, useRef, useState } from 'react';
import { parseQuickAdd } from '@scheduler/core/pure';
import { useStore } from '../store';
import { fmtShortDate, todayStr } from '../lib';
import { Icon } from './ui';

/**
 * 빠른 추가. AI 없이 앱이 직접 해석한다(토큰 0). 입력하는 동안 해석 결과를 보여준다.
 *   "15시-16시 검토" · "내일 10:00 회의 @" · "금요일 보고서 ~11/28 !" · "인박스 책 읽기"
 */
export function QuickAdd({ defaultDate, placeholder, autoFocus, onDone, className = '' }: { defaultDate: string | null; placeholder?: string; autoFocus?: boolean; onDone?: () => void; className?: string }) {
  const [text, setText] = useState('');
  const op = useStore((s) => s.op);
  const today = todayStr();
  const ref = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (text.trim() ? parseQuickAdd(text, today, defaultDate) : null), [text, today, defaultDate]);

  const submit = async () => {
    if (!text.trim()) return;
    const r = await op('quickAdd', text, defaultDate);
    if (r) {
      setText('');
      onDone?.();
    }
    ref.current?.focus();
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 focus-within:bg-hover">
        <Icon name="plus" size={14} className="shrink-0 text-faint" />
        <input
          ref={ref}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit();
            if (e.key === 'Escape') {
              setText('');
              onDone?.();
            }
          }}
          placeholder={placeholder ?? (defaultDate ? `${fmtShortDate(defaultDate, today)}에 추가 — 15시-16시 회의 @ · 보고서 ~금요일 !` : '인박스에 추가')}
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
        />
      </div>
      {preview && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] text-muted shadow-lg shadow-black/40">
          <Chip strong>{preview.date === null ? '인박스' : fmtShortDate(preview.date, today)}</Chip>
          {preview.start && <Chip>{preview.end ? `${preview.start}–${preview.end}` : preview.start}</Chip>}
          {preview.kind === 'event' && <Chip>일정</Chip>}
          {preview.due && <Chip>마감 {fmtShortDate(preview.due, today)}</Chip>}
          {preview.priority && <Chip>{preview.priority === 'highest' ? '최상' : '높음'}</Chip>}
          <span className="ml-1 truncate text-ink">{preview.text || '(내용 없음)'}</span>
          <span className="ml-auto text-faint">Enter</span>
        </div>
      )}
    </div>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <span className={`rounded px-1.5 py-px ${strong ? 'bg-accent-soft text-accent' : 'bg-surface-2'}`}>{children}</span>;
}
