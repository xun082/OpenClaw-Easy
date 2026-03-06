import { app } from 'electron';

import { AppConfig } from './app-config';

export abstract class BaseApp {
  protected config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  abstract initialize(): void;

  protected setupAppEvents(): void {
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (this.shouldCreateWindow()) {
        this.createWindow();
      }
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }

  protected abstract shouldCreateWindow(): boolean;
  protected abstract createWindow(): void;
}
