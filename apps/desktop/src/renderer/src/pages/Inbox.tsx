import { useStore } from '../store';
import { PageBody, PageHeader } from '../components/Shell';
import { QuickAdd } from '../components/QuickAdd';
import { ItemTree, justCompleted, useLingerRefresh } from '../components/ItemRow';
import { Card, Empty } from '../components/ui';

export function Inbox() {
  const { inbox } = useStore();
  const items = inbox.filter((i) => i.kind !== 'note');
  useLingerRefresh();
  const open = items.filter((i) => !(i.kind === 'task' && i.done) || justCompleted(i.ref));
  const done = items.filter((i) => i.kind === 'task' && i.done && !justCompleted(i.ref));
  return (
    <>
      <PageHeader title="인박스" sub="날짜가 정해지지 않은 할 일. 누르거나 끌어서 날짜를 정해요." addDate={null} addPlaceholder="인박스에 추가" />
      <PageBody>
        <div className="mx-auto max-w-[820px] space-y-4 px-6 py-6">
          <Card title={`할 일 ${open.length}`}>
            {open.length ? <ItemTree items={open} rowProps={{ actions: ['today', 'tomorrow', 'delete'] }} /> : <Empty>비어 있어요.</Empty>}
            <QuickAdd defaultDate={null} className="mt-3" placeholder="인박스에 추가 (날짜를 쓰면 그날로: 내일 책 반납)" />
          </Card>
          {done.length > 0 && (
            <Card title={`완료 ${done.length}`}>
              <ItemTree items={done} />
            </Card>
          )}
        </div>
      </PageBody>
    </>
  );
}
