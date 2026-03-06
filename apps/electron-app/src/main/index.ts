// 抑制 macOS 系统日志噪音（需在 import 之前执行）
if (process.platform === 'darwin') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

  const MACOS_NOISE = [
    'IMKCFRunLoopWakeUpReliable',
    'mach port',
    'messaging the mach port',
    'error messaging',
  ];
  const isNoise = (msg: string) => MACOS_NOISE.some((s) => msg.includes(s));

  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stderr.write = function (chunk: any, encoding?: any, callback?: any) {
    if (typeof chunk === 'string' && isNoise(chunk)) return true;

    return originalStderrWrite(chunk, encoding, callback);
  };
}

import { electronApp, optimizer } from '@electron-toolkit/utils';
import { AppConfigManager, MenuConfig } from '@monorepo/electron-core';
import { IpcConfig } from '@monorepo/electron-ipc';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';

// macOS GPU 相关噪音抑制
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('--disable-gpu');
  app.commandLine.appendSwitch('--disable-dev-shm-usage');
  app.commandLine.appendSwitch('--no-sandbox');
  app.commandLine.appendSwitch('--disable-features', 'TranslateUI,VizDisplayCompositor');
  app.commandLine.appendSwitch('--disable-background-timer-throttling');
  app.commandLine.appendSwitch('--disable-renderer-backgrounding');
}

// App configuration
const configManager = new AppConfigManager();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const windowOptions = configManager.getWindowOptions();

  // Create the browser window
  mainWindow = new BrowserWindow({
    ...windowOptions,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      backgroundThrottling: false,
      offscreen: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);

    return { action: 'deny' };
  });

  // Load the React app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // 开发环境：加载 React 应用的开发服务器
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // 生产环境：加载构建后的 React 应用
    mainWindow.loadFile(join(__dirname, '../../react-app/dist/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  const config = configManager.getConfig();

  // Set app user model id for windows
  electronApp.setAppUserModelId(config.userModelId);

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Setup basic IPC handlers
  ipcMain.on('ping', () => {});

  // 设置 IPC 处理程序（在窗口创建之前）
  const ipcConfig = new IpcConfig();
  ipcConfig.setupHandlers();

  // Create the main window
  createWindow();

  // 更新 IPC 配置的窗口引用
  ipcConfig.updateMainWindow(mainWindow);

  // 创建应用菜单
  const menuConfig = new MenuConfig(mainWindow);
  menuConfig.createMenu();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
