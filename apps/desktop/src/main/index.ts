import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VaultError } from '@scheduler/core';
import { CH, type AppState, type ChatMode, type Ops, type Prefs, type Queries, type VaultChange } from '../shared/api';
import { getWeather, setWeatherCity } from './weather';
import { makeOps, makeQueries } from './handlers';
import { AlertScheduler } from './alerts';
import { ClaudeChat } from './claude';
import { PlannerService } from './planner';
import { loadSettings, saveSettings } from './settings';
import { NATIVE_THEMES } from '../shared/themes';

app.setName('Scheduler');
// 개발용: 별도 데이터 폴더로 실행 (실행 중인 앱과 겹치지 않게, 화면 확인용)
if (process.env['SCHEDULER_USER_DATA']) app.setPath('userData', process.env['SCHEDULER_USER_DATA']);
const here = path.dirname(fileURLToPath(import.meta.url));
// 개발 중에는 워크스페이스의 빌드된 MCP 서버를 쓴다. 패키징 단계(7단계)에서 resources로 옮긴다.
const MCP_ENTRY = path.resolve(here, '../../../../packages/mcp-server/dist/index.js');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload);

const planner = new PlannerService((change: VaultChange) => {
  chat.markDirty();
  send(CH.vaultChanged, change);
  void alerts.tick();
});
const chat = new ClaudeChat(() => planner.vault, MCP_ENTRY, (e) => send(CH.chatEvent, e));
const alerts = new AlertScheduler(() => planner.vault, () => showWindow());

function vaultOrThrow() {
  if (!planner.vault) throw new VaultError('볼트가 열려 있지 않음');
  return planner.vault;
}

function showWindow(): void {
  if (!win) createWindow();
  win?.show();
  win?.focus();
}

/** 트레이 아이콘: 16x16 원을 직접 그린다 (이미지 파일 없이) */
function trayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const i = (y * size + x) * 4;
      if (d <= 7) {
        // BGRA: 남색 원 + 가운데 흰 점
        const inner = d <= 2.5;
        buf[i] = inner ? 255 : 0xd9;
        buf[i + 1] = inner ? 255 : 0x6b;
        buf[i + 2] = inner ? 255 : 0x3b;
        buf[i + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('Scheduler');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: () => showWindow() },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', () => showWindow());
}

/**
 * 창이 넓어지면 화면 전체를 같은 비율로 확대한다 (글씨·칸·아이콘·트리 모두).
 * 기준 1440×900 = 100%. 가로·세로 중 덜 늘어난 쪽에 맞춘다 (넓기만 한 화면에서 세로가 모자라지 않게).
 * 기준보다 작으면 줄이지 않는다. 최대 200%.
 */
const BASE_WIDTH = 1440;
const BASE_HEIGHT = 900;
function autoZoom(w: BrowserWindow): void {
  let t: NodeJS.Timeout | undefined;
  const apply = () => {
    if (w.isDestroyed()) return;
    const [cw = BASE_WIDTH, ch = BASE_HEIGHT] = w.getContentSize();
    const f = Math.min(2, Math.max(1, Math.min(cw / BASE_WIDTH, ch / BASE_HEIGHT)));
    w.webContents.setZoomFactor(Math.round(f * 100) / 100);
  };
  w.on('resize', () => {
    clearTimeout(t);
    t = setTimeout(apply, 80);
  });
  w.webContents.on('did-finish-load', apply);
}

function createWindow(): void {
  // 개발용: SCHEDULER_WINDOW=1920x1080 으로 창 크기 지정 (자동 확대 확인)
  const [ww, wh] = (process.env['SCHEDULER_WINDOW'] ?? '1440x900').split('x').map(Number);
  win = new BrowserWindow({
    width: ww || 1440,
    height: wh || 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: NATIVE_THEMES[loadSettings().theme]?.bg ?? NATIVE_THEMES.default.bg,
    title: 'Scheduler',
    webPreferences: {
      preload: path.join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !process.env['SCHEDULER_SCREENSHOT'],
      // 화면 확인용 실행: 창을 띄우지 않고 내부 버퍼에 그린다
      offscreen: !!process.env['SCHEDULER_SCREENSHOT'],
    },
  });
  // 화면 확인용 실행(SCHEDULER_SCREENSHOT)에서는 창을 띄우지 않는다 (사용 중인 화면을 방해하지 않게)
  if (!process.env['SCHEDULER_SCREENSHOT']) win.on('ready-to-show', () => win?.show());
  if (!app.isPackaged) {
    // 개발 중에는 renderer 오류를 터미널로
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.error(`[renderer:${e.level}] ${e.message}`);
    });
    win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', d.reason));
  }
  // 닫기 = 트레이로 숨김 (알림을 계속 받기 위해)
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
  autoZoom(win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(here, '../renderer/index.html'));
}

function registerIpc(): void {
  const handle = <A extends unknown[], R>(ch: string, fn: (...args: A) => Promise<R> | R) =>
    ipcMain.handle(ch, (_e, ...args) => fn(...(args as A)));

  handle(CH.getState, (): AppState => {
    const s = loadSettings();
    return { vault: planner.vault?.root ?? null, claude: chat.status, dayStart: s.dayStart, dayEnd: s.dayEnd };
  });

  handle(CH.chooseVault, async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: '볼트 폴더 선택 (비어 있으면 새로 만듦)',
      properties: ['openDirectory', 'createDirectory'],
    });
    const dir = r.filePaths[0];
    if (r.canceled || !dir) return null;
    planner.open(dir);
    saveSettings({ vault: dir });
    chat.reset('볼트를 바꿔서 새 대화');
    void alerts.tick();
    return dir;
  });

  const queries = makeQueries(() => planner.vault);
  const ops = makeOps(planner);
  handle(CH.query, (name: keyof Queries, args: unknown[]) => {
    const fn = queries[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
    if (!fn) throw new Error(`알 수 없는 조회: ${String(name)}`);
    return fn(...args);
  });
  // 수정은 AI 없이 앱이 직접 처리 (토큰 0)
  handle(CH.op, (name: keyof Ops, args: unknown[]) => {
    const fn = ops[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
    if (!fn) throw new Error(`알 수 없는 작업: ${String(name)}`);
    return fn(...args);
  });
  handle(CH.undo, async (id: string) => {
    await planner.undo(id);
    return { message: '되돌림' };
  });

  // 대시보드 레이아웃은 볼트에 저장 (기기 간 같은 화면)
  const layoutFile = () => (planner.vault ? path.join(planner.vault.root, '.planner', 'layout.json') : null);
  handle(CH.getLayout, () => {
    const f = layoutFile();
    if (!f || !existsSync(f)) return null;
    try {
      const j = JSON.parse(readFileSync(f, 'utf8')) as { version?: number; sections?: unknown };
      return j.version === 2 || j.version === 3 ? j : null;
    } catch {
      return null;
    }
  });
  handle(CH.saveLayout, (layout: unknown) => {
    const f = layoutFile();
    if (!f) return;
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, `${JSON.stringify(layout, null, 2)}
`, 'utf8');
  });
  const prefs = (): Prefs => {
    const s = loadSettings();
    return { clockStyle: s.clockStyle, theme: s.theme, font: s.font, weatherCity: s.weatherCity, dayStart: s.dayStart, dayEnd: s.dayEnd };
  };
  handle(CH.getPrefs, prefs);
  handle(CH.setPrefs, (patch: Partial<Prefs>) => {
    if (patch.weatherCity !== undefined && patch.weatherCity !== loadSettings().weatherCity) setWeatherCity(patch.weatherCity);
    const { weatherCity: _w, ...rest } = patch;
    saveSettings(rest);
    if (patch.theme) win?.setBackgroundColor(NATIVE_THEMES[patch.theme].bg);
    return prefs();
  });
  handle(CH.getWeather, (force?: boolean) => getWeather(force));
  handle(CH.previewAlert, () => alerts.preview());

  handle(CH.chatSend, (text: string, mode: ChatMode) => {
    void chat.send(text, mode);
  });
  handle(CH.chatCancel, () => chat.cancel());
  handle(CH.chatReset, () => chat.reset());
  handle(CH.getUsage, () => chat.usage());
  handle(CH.recheckClaude, () => chat.checkInstall());
  // -p 모드에서는 /login을 쓸 수 없어서, 터미널에서 Claude Code를 열어 로그인하게 한다
  handle(CH.openClaudeLogin, () => {
    const exe = chat.status.path;
    if (!exe) return;
    spawn('cmd.exe', ['/c', 'start', '"Claude 로그인"', 'cmd', '/k', `"${exe}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    app.setAppUserModelId('Scheduler');
    registerIpc();
    const s = loadSettings();
    // 개발용: PLANNER_VAULT가 있으면 저장된 설정 대신 그 볼트를 연다 (설정에는 저장하지 않음)
    const devVault = process.env['PLANNER_VAULT'];
    if (devVault) planner.open(devVault);
    else if (s.vault) {
      try {
        planner.open(s.vault);
      } catch {
        saveSettings({ vault: null });
      }
    }
    chat.checkInstall();
    createWindow();
    createTray();
    alerts.start();

    // 개발용: 화면을 PNG로 저장하고 종료 (UI 확인용)
    const shot = process.env['SCHEDULER_SCREENSHOT'];
    if (shot) {
      win?.webContents.once('did-finish-load', () => {
        const pre = process.env['SCHEDULER_SCREENSHOT_PRE'];
        if (pre) setTimeout(() => void win!.webContents.executeJavaScript(pre), 1500);
        setTimeout(async () => {
          const js = process.env['SCHEDULER_SCREENSHOT_JS'];
          if (js) await win!.webContents.executeJavaScript(js);
          const scroll = process.env['SCHEDULER_SCREENSHOT_SCROLL'];
          if (scroll) {
            await win!.webContents.executeJavaScript(`document.querySelector('main').scrollTop = ${Number(scroll)}`);
            await new Promise((r) => setTimeout(r, 300));
          }
          // 숨긴 창은 다시 그리지 않으므로 강제로 다시 그린 뒤 캡처
          win!.webContents.invalidate();
          await new Promise((r) => setTimeout(r, 300));
          const img = await win!.webContents.capturePage();
          writeFileSync(shot, img.toPNG());
          quitting = true;
          app.quit();
        }, Number(process.env['SCHEDULER_SCREENSHOT_DELAY'] ?? 2500));
      });
    }
  });
  app.on('before-quit', () => {
    quitting = true;
    chat.cancel();
    alerts.stop();
    planner.close();
  });
  app.on('window-all-closed', () => {
    // 트레이에 남는다
  });
}
