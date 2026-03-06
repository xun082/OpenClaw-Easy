import { BrowserWindow } from 'electron';

export interface WindowOptions {
  width: number;
  height: number;
  show: boolean;
  autoHideMenuBar: boolean;
  webPreferences: {
    preload: string;
    sandbox: boolean;
  };
}

export interface IpcHandler {
  setupHandlers(): void;
}

export interface WindowManager {
  createWindow(): void;
  getMainWindow(): BrowserWindow | null;
}
