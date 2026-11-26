import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { computeAlerts, getToday, minutesOf, toDateString, type Item, type Vault } from '@scheduler/core';
import { dataDir, loadSettings } from './settings';
import { Notifier, type NotifyInput } from './notify';

/**
 * 시간 알림 (docs/today.md 3장). main 프로세스에서 30초마다, 그리고 볼트가 바뀔 때 다시 계산한다.
 * 보낸 기록은 볼트가 아니라 앱 데이터 폴더에 둔다.
 */
export class AlertScheduler {
  private sent = new Set<string>();
  private sentDate = '';
  private timer: NodeJS.Timeout | null = null;
  private readonly notifier: Notifier;

  constructor(
    private readonly getVault: () => Vault | null,
    onClick: () => void,
  ) {
    this.notifier = new Notifier(onClick);
  }

  private file = () => path.join(dataDir(), 'alerts-sent.json');

  start(): void {
    this.load();
    this.timer = setInterval(() => void this.tick(), 30_000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.notifier.closeAll();
  }

  private load(): void {
    try {
      const j = JSON.parse(readFileSync(this.file(), 'utf8')) as { date: string; keys: string[] };
      this.sentDate = j.date;
      this.sent = new Set(j.keys);
    } catch {
      this.sent = new Set();
    }
  }

  private save(): void {
    try {
      writeFileSync(this.file(), JSON.stringify({ date: this.sentDate, keys: [...this.sent] }), 'utf8');
    } catch {
      // 무시
    }
  }

  async tick(): Promise<void> {
    const vault = this.getVault();
    if (!vault) return;
    const now = new Date();
    const today = toDateString(now);
    if (this.sentDate !== today) {
      this.sentDate = today;
      this.sent = new Set();
    }
    const s = loadSettings();
    const view = await getToday(vault, now);
    const items = view.items.map((x) => x.item);

    // 이미 지난 지 2분이 넘은 알림은 보내지 않는다 (앱을 늦게 켰을 때 몰아서 뜨지 않게)
    const windowMs = 2 * 60_000;
    for (const a of computeAlerts(today, items, { beforeMinutes: s.alertBeforeMinutes })) {
      const diff = now.getTime() - a.at.getTime();
      if (diff < 0 || this.sent.has(a.key)) continue;
      this.sent.add(a.key);
      if (diff > windowMs) continue;
      this.notifier.show(message(a.type, a.item, s.alertBeforeMinutes));
    }

    // 하루 마무리
    const reviewKey = `${today}|review`;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (!this.sent.has(reviewKey) && nowMin >= minutesOf(s.dayReviewTime)) {
      this.sent.add(reviewKey);
      const open = items.filter((i) => i.kind === 'task' && !i.done).length;
      if (open > 0 && nowMin - minutesOf(s.dayReviewTime) < 60) {
        this.notifier.show({ tone: 'review', label: '오늘 마무리', title: `남은 할 일 ${open}개`, sub: '내일로 옮기거나 정리해 보세요' });
      }
    }
    this.save();
  }

  /** 설정의 미리보기 */
  preview(): void {
    this.notifier.show({ tone: 'soon', label: `${loadSettings().alertBeforeMinutes}분 뒤 시작`, title: '알림 미리보기', sub: '14:00 – 15:00' });
  }
}

function timeOf(i: Item): string {
  if (i.kind === 'allday') return '종일';
  return i.time ? `${i.time.start}${i.time.end ? ` – ${i.time.end}` : ''}` : '';
}

function message(type: 'before' | 'start' | 'end', i: Item, before: number): NotifyInput {
  const sub = timeOf(i) || undefined;
  if (type === 'before') return { tone: 'soon', label: `${before}분 뒤 시작`, title: i.text, ...(sub ? { sub } : {}) };
  if (type === 'start') return { tone: 'now', label: '지금 시작', title: i.text, ...(sub ? { sub } : {}) };
  return { tone: 'end', label: i.kind === 'task' ? '끝났나요?' : '종료', title: i.text, ...(sub ? { sub } : {}) };
}
