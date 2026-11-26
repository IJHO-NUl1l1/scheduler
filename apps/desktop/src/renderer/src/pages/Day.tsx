import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { dayInfo, addDaysStr, dayOrder, fmtLongDate, statusFor, todayStr, useNow } from '../lib';
import { PageBody, PageHeader } from '../components/Shell';
import { QuickAdd } from '../components/QuickAdd';
import { ItemRow, ItemTree, justCompleted, useLingerRefresh } from '../components/ItemRow';
import { Timeline } from '../components/Timeline';
import { Card, Empty, Pager, SectionTitle } from '../components/ui';

export function Day() {
  const { day, dayView, home, go, op, app, hideDone, setHideDone } = useStore();
  useLingerRefresh();
  const now = useNow();
  const today = todayStr();
  const isToday = day === today;
  const [headline, setHeadline] = useState('');
  useEffect(() => setHeadline(dayView?.headline ?? ''), [dayView?.date, dayView?.headline]);

  const items = dayView?.date === day ? dayView.items.filter((i) => i.kind !== 'note') : [];
  const shown = dayOrder(hideDone ? items.filter((i) => !(i.kind === 'task' && i.done) || justCompleted(i.ref)) : items);
  const statusOf = (i: (typeof items)[number]) => statusFor(i, day, now);
  const doneCount = items.filter((i) => i.kind === 'task' && i.done).length;
  const taskCount = items.filter((i) => i.kind === 'task').length;
  const overdue = isToday ? (home?.today.overdue ?? []) : [];
  // 오늘 볼 때는 다른 날짜에서 오늘 마감/예정인 것도 함께
  const pulledIn = isToday ? (home?.today.items.map((x) => x.item).filter((i) => i.fileDate !== today) ?? []) : [];

  const saveHeadline = () => {
    const v = headline.trim();
    if (v !== (dayView?.headline ?? '')) void op('headline', day, v || null);
  };

  return (
    <>
      <PageHeader
        title={<Pager label={isToday ? '오늘' : fmtLongDate(day).slice(5)} onPrev={() => go('day', { day: addDaysStr(day, -1) })} onNext={() => go('day', { day: addDaysStr(day, 1) })} onToday={isToday ? undefined : () => go('day', { day: today })} />}
        addDate={day}
      />
      <PageBody>
        <div className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]">
          <div className="min-w-0 space-y-5">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[12px] text-muted">
                <span className={dayInfo(day).tone}>{fmtLongDate(day)}</span>
                {dayInfo(day).holiday && <span className="rounded bg-sun/15 px-1.5 py-px text-[11px] font-medium text-sun">{dayInfo(day).holiday}</span>}
              </div>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                onBlur={saveHeadline}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
                placeholder="이 날의 한 줄 요약 (월 달력에 표시돼요)"
                className="w-full rounded-lg bg-transparent px-1 py-1 text-[20px] font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-faint hover:bg-surface focus:bg-surface"
              />
            </div>
  
            {overdue.length > 0 && (
              <Card title={<span className="text-warn">밀린 할 일 {overdue.length}</span>} right={<span className="text-[11px] text-faint">자동으로 옮기지 않아요 · 끌어서 타임라인에 놓을 수 있어요</span>}>
                {overdue.map((i) => (
                  <ItemRow key={i.ref} item={i} showWhere actions={['today', 'tomorrow', 'delete']} />
                ))}
              </Card>
            )}
  
            <Card
              title={`할 일·일정 ${taskCount ? `· ${doneCount}/${taskCount} 완료` : ''}`}
              right={
                <button type="button" onClick={() => setHideDone(!hideDone)} className="text-[12px] text-muted hover:text-ink">
                  {hideDone ? '완료 보이기' : '완료 숨기기'}
                </button>
              }
            >
              {shown.length ? <ItemTree items={shown} statusOf={isToday ? statusOf : (i) => statusFor(i, day, now)} /> : <Empty>{items.length ? '모두 완료했어요.' : '아직 아무것도 없어요. 위에서 추가하세요.'}</Empty>}
              {pulledIn.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <SectionTitle>다른 날에서 오늘 마감·예정</SectionTitle>
                  {pulledIn.map((i) => (
                    <ItemRow key={i.ref} item={i} showWhere actions={['today', 'delete']} />
                  ))}
                </div>
              )}
              <QuickAdd defaultDate={day} className="mt-3" placeholder="이 날짜에 추가 — 예: 14시-15시 회의 @ · 보고서 !" />
            </Card>
  
            {dayView?.memo && (
              <Card title="메모">
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{dayView.memo}</p>
              </Card>
            )}
          </div>
  
          <Card title="타임라인" right={<span className="text-[11px] text-faint">끌어서 이동 · 아래 끝 끌어서 길이 조절</span>} className="self-start xl:sticky xl:top-[72px]">
            <Timeline items={items} statusOf={statusOf} now={now} date={day} isToday={isToday} dayStart={app?.dayStart ?? '08:00'} dayEnd={app?.dayEnd ?? '19:00'} maxHeight={680} />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
