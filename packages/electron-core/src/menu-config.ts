import { Menu, dialog, app, BrowserWindow } from 'electron';

export interface MenuTemplate {
  label: string;
  submenu: Array<{
    label?: string;
    accelerator?: string;
    role?: string;
    type?: string;
    click?: () => void;
  }>;
}

export class MenuConfig {
  private mainWindow: BrowserWindow | null;

  constructor(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow;
  }

  createMenu(): void {
    const template = this.getMenuTemplate();
    const menu = Menu.buildFromTemplate(template as any);
    Menu.setApplicationMenu(menu);
  }

  private getMenuTemplate(): MenuTemplate[] {
    return [
      {
        label: '文件',
        submenu: [
          {
            label: '新建',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              console.log('新建文件');
            },
          },
          {
            label: '打开',
            accelerator: 'CmdOrCtrl+O',
            click: async () => {
              const result = await dialog.showOpenDialog(this.mainWindow!, {
                properties: ['openFile'],
                filters: [
                  { name: '所有文件', extensions: ['*'] },
                  { name: '文本文件', extensions: ['txt', 'md'] },
                  { name: '图片文件', extensions: ['jpg', 'png', 'gif'] },
                ],
              });

              if (!result.canceled) {
                console.log('打开文件:', result.filePaths[0]);
              }
            },
          },
          { type: 'separator' },
          {
            label: '退出',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
          { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
          { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
          { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        ],
      },
      {
        label: '视图',
        submenu: [
          { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
          { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
          {
            label: '切换开发者工具',
            accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
            role: 'toggleDevTools',
          },
          { type: 'separator' },
          { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
          { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
          { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
          { type: 'separator' },
          { label: '切换全屏', accelerator: 'F11', role: 'togglefullscreen' },
        ],
      },
      {
        label: '窗口',
        submenu: [
          { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
          { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' },
        ],
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '关于',
            click: () => {
              dialog.showMessageBox(this.mainWindow!, {
                type: 'info',
                title: '关于',
                message: '我的 Electron 应用',
                detail:
                  '版本: 1.0.0\n作者: 您的名字\n\n这是一个使用 Electron + React 构建的现代化桌面应用。',
              });
            },
          },
        ],
      },
    ];
  }
}
