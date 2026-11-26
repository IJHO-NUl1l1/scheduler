import { useState } from 'react';
import type { GoalProgress } from '@scheduler/core';
import { useStore } from '../store';
import { WEEK, addMonths, fmtMonth, monthDays, parseD, todayStr } from '../lib';
import { PageBody, PageHeader } from '../components/Shell';
import { ItemRow } from '../components/ItemRow';
import { Card, Empty, Icon, Pager, Progress, Segmented } from '../components/ui';

export function Goals() {
  const { goalsView, goalsMonth, year, go, goalsMonthSummary, yearView } = useStore();
  const today = todayStr();

  const pager =
    goalsView === 'month' ? (
      <Pager label={fmtMonth(goalsMonth)} onPrev={() => go('goals', { goalsMonth: addMonths(goalsMonth, -1) })} onNext={() => go('goals', { goalsMonth: addMonths(goalsMonth, 1) })} onToday={() => go('goals', { goalsMonth: today.slice(0, 7) })} todayLabel="이번 달" />
    ) : (
      <Pager label={`${year}년`} onPrev={() => go('goals', { year: String(Number(year) - 1) })} onNext={() => go('goals', { year: String(Number(year) + 1) })} onToday={() => go('goals', { year: today.slice(0, 4) })} todayLabel="올해" />
    );

  return (
    <>
      <PageHeader
        title={pager}
        right={
          <Segmented
            value={goalsView}
            options={[
              ['month', '월 목표'],
              ['year', '연 목표'],
              ['record', '연간 기록'],
            ]}
            onChange={(v) => go('goals', { goalsView: v })}
          />
        }
      />
      <PageBody>
        <div className="mx-auto max-w-[1100px] px-6 py-6">
          {goalsView === 'month' && goalsMonthSummary && <GoalList period={goalsMonth} title={`${fmtMonth(goalsMonth)} 목표`} progress={goalsMonthSummary.goals} />}
          {goalsView === 'year' && yearView && <GoalList period={year} title={`${year}년 목표`} progress={yearView.goals} />}
          {goalsView === 'record' && yearView && <YearRecord />}
        </div>
      </PageBody>
    </>
  );
}

function GoalList({ period, title, progress }: { period: string; title: string; progress: GoalProgress }) {
  const op = useStore((s) => s.op);
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    void op('addGoal', period, t);
    setText('');
  };
  return (
    <div className="max-w-[720px] space-y-4">
      <div>
        <div className="flex items-end justify-between">
          <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
          <span className="tabular text-[13px] text-muted">{progress.total ? `${progress.done}/${progress.total} 달성` : ''}</span>
        </div>
        <Progress value={progress.ratio ?? 0} tone="ok" className="mt-3 !h-2" />
      </div>
      <Card pad={false}>
        <div className="p-2">
          {progress.goals.length ? progress.goals.map((g) => <ItemRow key={g.ref} item={g} showDue={false} actions={['delete']} />) : <Empty>아직 목표가 없어요. 3~5개 정도가 적당해요.</Empty>}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-3 py-2">
          <Icon name="plus" size={14} className="text-faint" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && add()}
            placeholder="목표 추가 후 Enter"
            className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </div>
      </Card>
      <p className="text-[12px] text-faint">목표를 누르면 이름을 바꾸거나 삭제할 수 있어요. 오른쪽 Claude 패널에서 "이번 달 목표 같이 정하자"라고 해도 돼요.</p>
    </div>
  );
}

function YearRecord() {
  const { yearView, go } = useStore();
  if (!yearView) return null;
  const today = todayStr();
  const max = Math.max(1, ...Object.values(yearView.doneByDate));
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6 text-[13px] text-muted">
        <span>
          올해 목표 <b className="text-ink">{yearView.goals.done}/{yearView.goals.total}</b>
        </span>
        <span>
          완료한 할 일 <b className="text-ink">{yearView.months.reduce((a, m) => a + m.done, 0)}</b>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {yearView.months.map((m) => {
          const days = monthDays(m.month);
          return (
            <button key={m.month} type="button" onClick={() => go('calendar', { calView: 'month', month: m.month })} className={`rounded-xl border bg-surface p-3 text-left transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 ${m.month === today.slice(0, 7) ? 'border-accent/60 hover:border-accent' : 'border-line/60 hover:border-faint'}`}>
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-semibold">{Number(m.month.slice(5))}월</span>
                <span className="tabular text-[11px] text-muted">완료 {m.done}</span>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-[3px]">
                {WEEK.map((w) => (
                  <span key={w} className="text-center text-[8px] text-faint">
                    {w}
                  </span>
                ))}
                {days.map((d) => {
                  const n = yearView.doneByDate[d] ?? 0;
                  const inMonth = d.startsWith(m.month);
                  return (
                    <span
                      key={d}
                      title={inMonth ? `${parseD(d).getDate()}일 완료 ${n}` : ''}
                      className={`aspect-square rounded-[3px] ${!inMonth ? 'opacity-0' : n ? 'bg-ok' : 'bg-ink/[0.07]'} ${d === today ? 'ring-1 ring-accent' : ''}`}
                      style={n && inMonth ? { opacity: 0.25 + 0.75 * (n / max) } : undefined}
                    />
                  );
                })}
              </div>
              <div className="mt-3 text-[11px] text-muted">{m.goals.total ? `목표 ${m.goals.done}/${m.goals.total}` : '목표 없음'}</div>
              {m.goals.total > 0 && <Progress value={m.goals.ratio ?? 0} tone="ok" className="mt-1" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
