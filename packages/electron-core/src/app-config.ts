export interface AppConfig {
  name: string;
  version: string;
  width: number;
  height: number;
  show: boolean;
  autoHideMenuBar: boolean;
  userModelId: string;
}

export const defaultAppConfig: AppConfig = {
  name: '我的 Electron 应用',
  version: '1.0.0',
  width: 1200,
  height: 800,
  show: false,
  autoHideMenuBar: true,
  userModelId: 'com.my-electron-app',
};

export class AppConfigManager {
  private config: AppConfig;

  constructor(config: Partial<AppConfig> = {}) {
    this.config = { ...defaultAppConfig, ...config };
  }

  getConfig(): AppConfig {
    return this.config;
  }

  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getWindowOptions() {
    return {
      width: this.config.width,
      height: this.config.height,
      show: this.config.show,
      autoHideMenuBar: this.config.autoHideMenuBar,
    };
  }
}
