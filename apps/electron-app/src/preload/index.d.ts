import { ElectronAPI } from '@electron-toolkit/preload';

// 定义自定义 API 的类型
interface CustomAPI {
  getAppInfo: () => {
    name: string;
    version: string;
    author: string;
  };
  getSystemInfo: () => {
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  sayHello: (name: string) => string;
  openFile: () => Promise<string>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: CustomAPI;
  }
}
