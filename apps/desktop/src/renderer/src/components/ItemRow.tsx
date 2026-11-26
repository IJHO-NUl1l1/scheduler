import { useEffect, useState, type ReactNode } from 'react';
import type { Item, TimeStatus } from '@scheduler/core/pure';
import { useStore } from '../store';
import { addDaysStr, fmtShortDate, fmtTime, todayStr } from '../lib';
import { Icon } from './ui';
import { useDrag, useItemDrag } from '../drag';
import { useTheme } from '../themes';

const STATUS_BADGE: Partial<Record<TimeStatus, { label: string; cls: string }>> = {
  ongoing: { label: '진행 중', cls: 'bg-accent text-on-accent' },
  soon: { label: '곧', cls: 'bg-soon-soft text-soon' },
  overdue: { label: '지남', cls: 'bg-warn-soft text-warn' },
};

// 방금 완료로 바꾼 항목 (줄이 다른 목록으로 옮겨 다시 그려져도 반응 효과가 이어지게)
const justDone = new Map<string, number>();
const LINGER = 1200;
const lingerSubs = new Set<() => void>();

/** 방금 완료한 할 일인가: '남은 일' 목록은 체크 효과가 끝날 때까지 잠깐 남겨 둔다 */
export function justCompleted(ref: string): boolean {
  return Date.now() - (justDone.get(ref) ?? 0) < LINGER;
}

/** justCompleted를 쓰는 목록이 남겨 둔 줄을 제때 치우도록 다시 그린다 */
export function useLingerRefresh(): void {
  const [, set] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      clearTimeout(t);
      t = setTimeout(() => set((n) => n + 1), LINGER + 30);
    };
    lingerSubs.add(on);
    return () => {
      lingerSubs.delete(on);
      clearTimeout(t);
    };
  }, []);
}

export function Checkbox({ item }: { item: Item }) {
  const op = useStore((s) => s.op);
  const Check = useTheme().TaskCheck;
  if (item.kind !== 'task') {
    return <span className={`mx-[3px] h-2.5 w-2.5 shrink-0 rounded-full ${item.kind === 'event' ? 'bg-event' : 'border border-faint'}`} />;
  }
  return (
    <button
      type="button"
      aria-label={item.done ? '완료 취소' : '완료'}
      onClick={(e) => {
        e.stopPropagation();
        if (!item.done) {
          justDone.set(item.ref, Date.now());
          lingerSubs.forEach((f) => f());
        } else justDone.delete(item.ref);
        void op('complete', item.ref, !item.done);
      }}
      className="flex shrink-0 rounded-[5px] hover:brightness-125"
    >
      <Check done={!!item.done} pop={Date.now() - (justDone.get(item.ref) ?? 0) < 1500} />
    </button>
  );
}

export interface RowProps {
  item: Item;
  status?: TimeStatus;
  depth?: number;
  /** 오른쪽에 날짜 표시 (밀린 할 일 등) */
  showWhere?: boolean;
  showDue?: boolean;
  /** 마우스를 올렸을 때 나오는 빠른 버튼 */
  actions?: ('today' | 'tomorrow' | 'delete')[];
  compact?: boolean;
  extra?: ReactNode;
}

/** 항목 한 줄. 클릭 = 편집, 체크박스 = 완료, 끌기 = 다른 날짜/시간으로 */
export function ItemRow({ item, status, depth = 0, showWhere, showDue = true, actions = ['tomorrow', 'delete'], compact, extra }: RowProps) {
  const { op, edit, editing } = useStore();
  const flash = useStore((s) => s.highlight.has(item.ref));
  const today = todayStr();
  const done = (item.kind === 'task' && item.done) || status === 'ended';
  const time = fmtTime(item);
  const badge = status ? STATUS_BADGE[status] : undefined;
  const selected = editing?.ref === item.ref;
  const dueSoon = item.due && !done ? item.due <= addDaysStr(today, 2) : false;
  const drag = useItemDrag(item);
  const lifted = useDrag((s) => s.item?.ref === item.ref);

  return (
    <div
      role="button"
      tabIndex={0}
      {...drag}
      onClick={() => edit(item)}
      onKeyDown={(e) => e.key === 'Enter' && edit(item)}
      className={`group flex cursor-pointer touch-none items-center gap-2.5 rounded-lg pr-1.5 transition-colors select-none ${lifted ? 'opacity-30 outline-1 outline-dashed outline-accent/60' : ''} ${compact ? 'py-1' : 'py-[7px]'} ${
        selected ? 'bg-hover' : status === 'ongoing' ? 'bg-accent-soft' : 'hover:bg-surface-2'
      } ${flash ? 'flash' : ''}`}
      style={{ paddingLeft: 8 + depth * 20 }}
    >
      <Checkbox item={item} />
      {time && <span className={`tabular shrink-0 text-[12px] ${item.kind === 'task' ? 'text-muted' : 'text-event'} ${done ? 'opacity-40' : ''}`}>{time}</span>}
      <span className={`min-w-0 flex-1 truncate text-[13.5px] ${done ? 'text-faint line-through decoration-faint' : 'text-ink'}`}>
        {item.priority === 'highest' || item.priority === 'high' ? <span className="mr-1 font-bold text-warn">{item.priority === 'highest' ? '!!' : '!'}</span> : null}
        {item.text}
      </span>
      {extra}
      {showWhere && <span className="shrink-0 text-[11px] text-faint">{item.fileDate ? fmtShortDate(item.fileDate, today) : '인박스'}</span>}
      {showDue && item.due && <span className={`shrink-0 text-[11px] ${dueSoon ? 'text-warn' : 'text-faint'}`}>~{fmtShortDate(item.due, today)}</span>}
      {badge && <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>}

      {!done && actions.length > 0 && (
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
          {actions.includes('today') && item.kind === 'task' && item.fileDate !== today && <Quick onClick={() => void op('move', item.ref, today)}>오늘로</Quick>}
          {actions.includes('tomorrow') && <Quick onClick={() => void op('move', item.ref, addDaysStr(item.fileDate && item.fileDate > today ? item.fileDate : today, 1))}>내일로</Quick>}
          {actions.includes('delete') && (
            <button type="button" title="삭제 (되돌리기 가능)" onClick={() => void op('remove', item.ref)} className="rounded p-1 text-faint hover:bg-hover hover:text-warn">
              <Icon name="trash" size={13} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function Quick({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-ink">
      {children}
    </button>
  );
}

/** 부모-하위 구조로 그리기 */
export function ItemTree({ items, statusOf, rowProps }: { items: Item[]; statusOf?: (i: Item) => TimeStatus | undefined; rowProps?: Omit<RowProps, 'item' | 'status' | 'depth'> }) {
  const key = (file: string, line: number) => `${file}#${line}`;
  const inList = new Set(items.map((i) => key(i.file, i.line)));
  const children = new Map<string, Item[]>();
  for (const i of items) {
    if (i.parentLine !== undefined && inList.has(key(i.file, i.parentLine))) {
      const k = key(i.file, i.parentLine);
      children.set(k, [...(children.get(k) ?? []), i].sort((a, b) => a.line - b.line));
    }
  }
  const render = (i: Item, depth: number): ReactNode => (
    <div key={i.ref}>
      <ItemRow item={i} status={statusOf?.(i)} depth={depth} {...rowProps} />
      {(children.get(key(i.file, i.line)) ?? []).map((c) => render(c, depth + 1))}
    </div>
  );
  return <>{items.filter((i) => i.parentLine === undefined || !inList.has(key(i.file, i.parentLine))).map((i) => render(i, 0))}</>;
}
