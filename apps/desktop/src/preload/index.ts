import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CH, type ChatEvent, type PlannerApi, type VaultChange } from '../shared/api';

/** renderer에 노출하는 유일한 통로. Node API는 직접 노출하지 않는다. */

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: PlannerApi = {
  getState: () => ipcRenderer.invoke(CH.getState),
  chooseVault: () => ipcRenderer.invoke(CH.chooseVault),
  query: (name, ...args) => ipcRenderer.invoke(CH.query, name, args),
  op: (name, ...args) => ipcRenderer.invoke(CH.op, name, args),
  undo: (id) => ipcRenderer.invoke(CH.undo, id),
  onVaultChanged: (cb) => subscribe<VaultChange>(CH.vaultChanged, cb),
  chatSend: (text, mode) => ipcRenderer.invoke(CH.chatSend, text, mode),
  chatCancel: () => ipcRenderer.invoke(CH.chatCancel),
  chatReset: () => ipcRenderer.invoke(CH.chatReset),
  onChatEvent: (cb) => subscribe<ChatEvent>(CH.chatEvent, cb),
  getUsage: () => ipcRenderer.invoke(CH.getUsage),
  openClaudeLogin: () => ipcRenderer.invoke(CH.openClaudeLogin),
  recheckClaude: () => ipcRenderer.invoke(CH.recheckClaude),
  getLayout: () => ipcRenderer.invoke(CH.getLayout),
  saveLayout: (layout) => ipcRenderer.invoke(CH.saveLayout, layout),
  getPrefs: () => ipcRenderer.invoke(CH.getPrefs),
  setPrefs: (patch) => ipcRenderer.invoke(CH.setPrefs, patch),
  getWeather: (force) => ipcRenderer.invoke(CH.getWeather, force),
  previewAlert: () => ipcRenderer.invoke(CH.previewAlert),
};

contextBridge.exposeInMainWorld('planner', api);
