import { IpcHandler } from '@monorepo/electron-core';
import { ipcMain } from 'electron';

export class ElectronIpcHandler implements IpcHandler {
  setupHandlers(): void {
    // Basic IPC handlers
    ipcMain.on('ping', () => console.log('pong'));

    // App info handlers
    ipcMain.handle('get-app-version', () => {
      return process.env.npm_package_version || '1.0.0';
    });

    ipcMain.handle('get-platform', () => {
      return process.platform;
    });

    // System info handlers
    ipcMain.handle('get-system-info', () => {
      return {
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron,
      };
    });
  }
}
