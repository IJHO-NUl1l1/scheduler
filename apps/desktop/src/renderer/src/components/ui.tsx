import { useTheme } from '../themes';
import type { ReactNode, SVGProps } from 'react';

const ICONS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  day: 'M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  goals: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  inbox: 'M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5',
  chat: 'M5 5h14v10H9l-4 4z',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  folder: 'M3 6h6l2 2h10v11H3z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Card({ title, right, children, className = '', pad = true }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-xl border border-line/60 bg-surface ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          {title && <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>}
          {right}
        </header>
      )}
      <div className={pad ? 'px-4 pb-3.5' : ''}>{children}</div>
    </section>
  );
}

export function Progress({ value, className = '', tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'ok' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${tone === 'ok' ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const art = useTheme().emptyArt;
  return (
    <p className="py-3 text-[13px] text-faint">
      {art}
      {children}
    </p>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-[12px]">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 transition-colors ${value === v ? 'bg-hover font-medium text-ink' : 'text-muted hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({ icon, title, onClick, className = '' }: { icon: IconName; title: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={`rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink ${className}`}>
      <Icon name={icon} size={15} />
    </button>
  );
}

/** ◀ 제목 ▶ [오늘] */
export function Pager({ label, onPrev, onNext, onToday, todayLabel = '오늘' }: { label: ReactNode; onPrev: () => void; onNext: () => void; onToday?: () => void; todayLabel?: string }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton icon="left" title="이전" onClick={onPrev} />
      <div className="min-w-[150px] text-center text-[15px] font-semibold tracking-tight">{label}</div>
      <IconButton icon="right" title="다음" onClick={onNext} />
      {onToday && (
        <button type="button" onClick={onToday} className="ml-1 rounded-md px-2.5 py-1 text-[12px] text-muted hover:bg-hover hover:text-ink">
          {todayLabel}
        </button>
      )}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between px-1">
      <h3 className="text-[11px] font-semibold tracking-wider text-faint">{children}</h3>
      {right}
    </div>
  );
}
