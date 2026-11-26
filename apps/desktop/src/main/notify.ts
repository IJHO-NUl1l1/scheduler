import { BrowserWindow, screen } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataDir, loadSettings } from './settings';
import { NATIVE_THEMES, fontOf } from '../shared/themes';

/**
 * 시간 알림 팝업. OS 기본 알림 대신 앱과 같은 디자인의 작은 창을 화면 오른쪽 아래에 띄운다.
 * 포커스를 뺏지 않고, 마우스를 올리면 닫히지 않으며, 여러 개면 위로 쌓인다.
 */

export type NotifyTone = 'soon' | 'now' | 'end' | 'review';

export interface NotifyInput {
  tone: NotifyTone;
  /** 위 작은 글씨 (예: 10분 뒤 시작) */
  label: string;
  /** 큰 글씨 (항목 이름) */
  title: string;
  /** 시간 등 보조 정보 */
  sub?: string;
}

const W = 360;
const H = 112;
const GAP = 10;
const MARGIN = 16;
const LIFETIME_MS = 15_000;

const fontUrls = new Map<string, string | null>();
function fontUrl(file: string | undefined): string | null {
  if (!file) return null;
  if (!fontUrls.has(file)) {
    try {
      const p = createRequire(import.meta.url).resolve(file);
      fontUrls.set(file, existsSync(p) ? pathToFileURL(p).href : null);
    } catch {
      fontUrls.set(file, null);
    }
  }
  return fontUrls.get(file) ?? null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function html(n: NotifyInput): string {
  const st = loadSettings();
  const t = NATIVE_THEMES[st.theme] ?? NATIVE_THEMES.default;
  const color = t.tones[n.tone];
  const f = fontOf(st.font);
  const url = fontUrl(f.file);
  const family = f.family.split(',')[0]!;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
${url ? `@font-face{font-family:${family};src:url('${url}') format('woff2');font-weight:100 900;}` : ''}
*{box-sizing:border-box;margin:0}
html,body{background:transparent;overflow:hidden;height:100%}
body{font-family:${f.family};color:${t.ink};padding:6px;-webkit-user-select:none;user-select:none}
.card{position:relative;height:100%;display:flex;gap:12px;align-items:stretch;padding:14px 14px 14px 16px;border-radius:14px;
  background:${t.card};border:1px solid ${t.cardLine};box-shadow:0 10px 30px rgba(0,0,0,.55);cursor:pointer;overflow:hidden;
  animation:in .22s cubic-bezier(.2,.8,.2,1)}
.card:hover{border-color:${t.faint}}
.bar{width:3px;border-radius:3px;background:${color};flex:none}
.body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px}
.label{font-size:11.5px;font-weight:600;color:${color};letter-spacing:.01em}
.title{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{font-size:12px;color:${t.muted};font-variant-numeric:tabular-nums}
.app{font-size:10.5px;color:${t.faint};margin-left:6px;font-weight:500}
.x{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:6px;border:0;background:transparent;color:${t.faint};
  display:flex;align-items:center;justify-content:center;cursor:pointer}
.x:hover{background:${t.cardHover};color:${t.ink}}
.life{position:absolute;left:0;bottom:0;height:2px;background:${color};opacity:.5;width:100%;transform-origin:left;
  animation:life ${LIFETIME_MS}ms linear forwards}
.card:hover .life{animation-play-state:paused}
@keyframes in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes life{to{transform:scaleX(0)}}
</style></head><body>
<div class="card" id="card">
  <div class="bar"></div>
  <div class="body">
    <div class="label">${esc(n.label)}<span class="app">· Scheduler</span></div>
    <div class="title">${esc(n.title)}</div>
    ${n.sub ? `<div class="sub">${esc(n.sub)}</div>` : ''}
  </div>
  <button class="x" id="x" aria-label="닫기"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
  <div class="life" id="life"></div>
</div>
<script>
  const go = (a) => { location.href = 'notify://' + a; };
  document.getElementById('x').addEventListener('click', (e) => { e.stopPropagation(); go('close'); });
  document.getElementById('card').addEventListener('click', () => go('open'));
  document.getElementById('life').addEventListener('animationend', () => go('close'));
</script>
</body></html>`;
}

export class Notifier {
  private open: BrowserWindow[] = [];
  private seq = 0;

  constructor(private readonly onOpen: () => void) {}

  show(n: NotifyInput): void {
    // 알림 HTML은 앱 데이터 폴더에 파일로 써서 연다 (로컬 글꼴을 쓸 수 있게)
    const file = path.join(dataDir(), `notify-${++this.seq % 8}.html`);
    writeFileSync(file, html(n), 'utf8');

    const w = new BrowserWindow({
      width: W,
      height: H,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      show: false,
      hasShadow: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('notify://')) return;
      e.preventDefault();
      if (url.startsWith('notify://open')) this.onOpen();
      this.close(w);
    });
    w.on('closed', () => {
      this.open = this.open.filter((x) => x !== w);
      this.layout();
    });
    this.open.push(w);
    // 한 번에 너무 많이 쌓이지 않게
    while (this.open.length > 4) this.close(this.open[0]!);
    this.layout();
    w.once('ready-to-show', () => w.showInactive());
    void w.loadFile(file);
  }

  private close(w: BrowserWindow): void {
    if (!w.isDestroyed()) w.destroy();
    this.open = this.open.filter((x) => x !== w);
    this.layout();
  }

  /** 오른쪽 아래부터 위로 쌓는다. 새 알림이 맨 아래 */
  private layout(): void {
    const area = screen.getPrimaryDisplay().workArea;
    const list = [...this.open].reverse();
    list.forEach((w, i) => {
      if (w.isDestroyed()) return;
      w.setBounds({ x: area.x + area.width - W - MARGIN, y: area.y + area.height - MARGIN - H - i * (H + GAP - 12), width: W, height: H });
    });
  }

  closeAll(): void {
    for (const w of [...this.open]) this.close(w);
  }
}
