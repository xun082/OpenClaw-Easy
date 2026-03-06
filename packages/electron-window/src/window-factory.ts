import { WindowOptions } from '@monorepo/electron-core';
import { BrowserWindow } from 'electron';

export class WindowFactory {
  static createWindow(options: WindowOptions): BrowserWindow {
    return new BrowserWindow({
      width: options.width,
      height: options.height,
      show: options.show,
      autoHideMenuBar: options.autoHideMenuBar,
      webPreferences: options.webPreferences,
    });
  }

  static createMainWindow(options: WindowOptions): BrowserWindow {
    const window = this.createWindow(options);

    // Add main window specific configurations
    window.setTitle('我的 Electron 应用');

    return window;
  }
}
