import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore, type ChatMessage } from '../store';
import { fmtTokens } from '../lib';

const SUGGESTIONS = ['오늘 할 일 정리해줘', '밀린 할 일 어떻게 할지 추천해줘', '이번 주 계획 세우자', '이번 달 목표 정하자'];

export function ChatPanel() {
  const { messages, busy, chatMode, setChatMode, sendChat, usage, app } = useStore();
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scrollIntoView가 Promise를 돌려주는 Chromium이 있어서 값을 반환하지 않는다
    void bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const claude = app?.claude;
  const submit = () => {
    if (!text.trim() || busy) return;
    void sendChat(text);
    setText('');
  };
  const maxTurns = 8;

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-bg">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[13px] font-semibold">Claude</span>
        <div className="ml-1 flex rounded-md bg-surface-2 p-0.5 text-[11px]">
          {(['quick', 'plan'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setChatMode(m)}
              title={m === 'quick' ? '가벼운 요청: Sonnet, 짧게 생각' : '계획 세우기: Opus, 깊게 생각 (사용량 더 큼)'}
              className={`rounded px-2 py-0.5 ${chatMode === m ? 'bg-hover font-medium text-ink' : 'text-muted'}`}
            >
              {m === 'quick' ? '빠른' : '계획'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void window.planner.chatReset()} className="ml-auto rounded px-2 py-0.5 text-[11px] text-muted hover:bg-hover" title="대화 기록을 비우고 새로 시작 (긴 대화는 매번 다시 보내져서 사용량이 커짐)">
          새 대화
        </button>
      </header>

      {claude && !claude.installed && (
        <Banner>
          Claude Code가 설치돼 있지 않아요. 설치한 뒤 <Btn onClick={() => void window.planner.recheckClaude().then(() => useStore.getState().init())}>다시 확인</Btn>
        </Banner>
      )}
      {claude?.installed && claude.loggedIn === false && (
        <Banner>
          Claude Code 로그인이 필요해요. <Btn onClick={() => void window.planner.openClaudeLogin()}>터미널에서 로그인</Btn> 열린 창에서 /login 후 닫으세요.
        </Banner>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-[12px] text-muted">플래너에 대해 말로 요청하세요. 단순 추가는 왼쪽 빠른 추가가 더 빠르고 사용량도 들지 않아요.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => void sendChat(s)} className="block w-full rounded-lg bg-surface-2 px-3 py-2 text-left text-[13px] text-muted hover:bg-hover hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
        <div ref={bottom} />
      </div>

      <footer className="border-t border-line p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={busy ? '처리 중…' : '예: 금요일까지 학업계획서 일정 쪼개줘'}
          className="w-full resize-none rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-line focus:bg-bg"
        />
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-faint">
          <span title="이 대화에서 보낸 횟수. 넘으면 새 대화로 자동 전환">
            대화 {usage?.session.turns ?? 0}/{maxTurns}
          </span>
          {usage && usage.session.lastContext > 0 && <span title="마지막 요청이 보낸 입력 토큰 (캐시 포함)">· 최근 {fmtTokens(usage.session.lastContext)}</span>}
          {usage && <span title="오늘 앱에서 보낸 요청 수와 입력 토큰 합계">· 오늘 {usage.today.requests}회 {fmtTokens(usage.today.input)}</span>}
          {busy ? (
            <button type="button" onClick={() => void window.planner.chatCancel()} className="ml-auto rounded bg-surface-2 px-2 py-1 text-muted hover:text-ink">
              중지
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!text.trim()} className="ml-auto rounded bg-accent px-3 py-1 font-medium text-on-accent disabled:opacity-40">
              보내기
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return <div className="border-b border-line bg-warn-soft px-4 py-2 text-[12px] text-warn">{children}</div>;
}

function Btn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mx-1 rounded bg-surface px-1.5 py-0.5 font-medium text-ink underline-offset-2 hover:underline">
      {children}
    </button>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === 'notice') return <div className="text-center text-[11px] text-faint">— {m.text} —</div>;
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-[13px] whitespace-pre-wrap text-on-accent">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {m.tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {m.tools.map((t, i) => (
            <span key={i} title={t.summary} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
              {t.name}
            </span>
          ))}
        </div>
      )}
      {m.text && <div className="text-[13px] leading-relaxed">{renderMarkdown(m.text)}</div>}
      {m.pending && !m.text && <div className="text-[12px] text-faint">생각하는 중…</div>}
      {m.error && <div className="rounded-md bg-warn-soft px-2 py-1 text-[12px] text-warn">{m.error.kind === 'cancelled' ? '중지됨' : m.error.message}</div>}
      {m.usage && (
        <div className="text-[10px] text-faint" title="입력 = 새로 보낸 것 + 캐시에 쓴 것 + 캐시에서 읽은 것. 캐시 읽기는 훨씬 가볍게 계산됨">
          {m.usage.model.replace('claude-', '')} · {m.usage.turns}왕복 · 입력 {fmtTokens(m.usage.input + m.usage.cacheWrite + m.usage.cacheRead)} (캐시 읽기 {fmtTokens(m.usage.cacheRead)}) · 출력 {fmtTokens(m.usage.output)} ·{' '}
          {(m.usage.ms / 1000).toFixed(1)}초{m.injectedState ? ' · 상태 미리 넣음' : ''}
        </div>
      )}
    </div>
  );
}

/** 아주 작은 마크다운: 제목, 목록, **굵게**, `코드`. HTML을 직접 넣지 않는다 */
function renderMarkdown(text: string): ReactNode {
  const inline = (s: string, key: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <b key={`${key}-${i}`}>{part.slice(2, -2)}</b>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={`${key}-${i}`} className="rounded bg-surface-2 px-1 text-[12px]">{part.slice(1, -1)}</code>;
      return part;
    });
  return text.split('\n').map((line, i) => {
    const k = String(i);
    if (/^#{1,3}\s/.test(line)) return <div key={k} className="mt-1 font-semibold">{inline(line.replace(/^#{1,3}\s/, ''), k)}</div>;
    if (/^\s*[-*]\s/.test(line)) {
      const depth = (/^\s*/.exec(line)?.[0].length ?? 0) / 2;
      return (
        <div key={k} className="flex gap-1.5" style={{ paddingLeft: depth * 12 }}>
          <span className="text-faint">•</span>
          <span>{inline(line.replace(/^\s*[-*]\s/, ''), k)}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={k} className="h-2" />;
    return <div key={k}>{inline(line, k)}</div>;
  });
}
