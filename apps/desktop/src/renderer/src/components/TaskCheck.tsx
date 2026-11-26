/**
 * 할 일 체크박스의 모양. 테마 슬롯(ThemeDef.TaskCheck)으로 바뀐다.
 * - done: 완료 상태
 * - pop: 방금 사용자가 완료로 바꿨다 (이때만 반응 효과)
 * - sm: 작은 크기 (달력 미리보기 등, 누를 수 없는 표시용)
 */
export interface TaskCheckProps {
  done: boolean;
  pop?: boolean;
  sm?: boolean;
}

const CHECK = 'M3.2 8.4l3 3 6.6-6.8';

/** 기본: 색도 움직임도 없는 평범한 체크 */
export function PlainCheck({ done, sm }: TaskCheckProps) {
  const box = sm ? 'h-3.5 w-3.5 rounded-[4px]' : 'h-4 w-4 rounded-[4px]';
  return (
    <span className={`flex shrink-0 items-center justify-center border ${box} ${done ? 'border-muted text-muted' : 'border-faint'}`}>
      {done && (
        <svg viewBox="0 0 16 16" width={sm ? 9 : 11} height={sm ? 9 : 11} aria-hidden>
          <path d={CHECK} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

const SPARKS = 8;

/**
 * 크리스마스: 완료하면 상자가 빨갛게 톡 튀어 오르고, 크림색 체크가 그어지며 금빛·눈빛 조각이 사방으로 퍼진다.
 * 완료된 상태는 빨간 상자 + 크림색 체크, 미완료는 금빛 테두리.
 */
export function SparkleCheck({ done, pop, sm }: TaskCheckProps) {
  const box = sm ? 'h-3.5 w-3.5 rounded-[4px]' : 'h-4 w-4 rounded-[5px]';
  const burst = done && pop && !sm;
  return (
    <span className="relative flex shrink-0">
      <span
        className={`flex items-center justify-center border ${box} ${done ? 'border-accent bg-accent' : 'border-gold/55 bg-gold/5'} ${burst ? 'xcheck-pop' : ''}`}
      >
        {done && (
          <svg viewBox="0 0 16 16" width={sm ? 9 : 11} height={sm ? 9 : 11} aria-hidden>
            <path className={burst ? 'xcheck-draw' : ''} d={CHECK} pathLength={1} fill="none" stroke="#fff5ef" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {burst && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="xcheck-ring absolute inset-0 rounded-full" />
          {Array.from({ length: SPARKS }, (_, i) => (
            <span
              key={i}
              className={`xcheck-spark absolute top-1/2 left-1/2 ${i % 2 ? 'xcheck-spark-snow' : ''}`}
              style={{ ['--a' as string]: `${(360 / SPARKS) * i + 22}deg`, ['--d' as string]: `${i % 2 ? 11 : 14}px` }}
            />
          ))}
        </span>
      )}
    </span>
  );
}
