import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { WindowManager, WindowOptions } from '@monorepo/electron-core';

export class ElectronWindowManager implements WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private options: WindowOptions;

  constructor(options: WindowOptions) {
    this.options = options;
  }

  createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: this.options.width,
      height: this.options.height,
      show: this.options.show,
      autoHideMenuBar: this.options.autoHideMenuBar,
      webPreferences: this.options.webPreferences,
    });

    this.setupWindowEvents();
    this.loadContent();
  }

  private setupWindowEvents(): void {
    if (!this.mainWindow) return;

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
    });

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);

      return { action: 'deny' };
    });
  }

  private loadContent(): void {
    if (!this.mainWindow) return;

    if (process.env.NODE_ENV === 'development') {
      // 开发环境：加载 React 应用的开发服务器
      this.mainWindow.loadURL('http://localhost:3000');
    } else {
      // 生产环境：加载构建后的 React 应用
      this.mainWindow.loadFile(join(__dirname, '../../react-app/dist/index.html'));
    }
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}
