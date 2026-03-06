import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),

  // OpenClaw 安装
  checkSystemNode: () => ipcRenderer.invoke('check-system-node'),
  checkOpenclaw: () => ipcRenderer.invoke('check-openclaw'),
  installNodeLts: () => ipcRenderer.invoke('install-node-lts'),
  installOpenclaw: () => ipcRenderer.invoke('install-openclaw'),
  onInstallLog: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('install-log', handler);

    return () => ipcRenderer.removeListener('install-log', handler);
  },

  // OpenClaw 配置
  readOpenclawConfig: () => ipcRenderer.invoke('read-openclaw-config'),
  writeOpenclawConfig: (content: string) => ipcRenderer.invoke('write-openclaw-config', content),
  checkOpenclawConfigExists: () => ipcRenderer.invoke('check-openclaw-config-exists'),

  // OpenClaw 技能管理
  listSkillFiles: (skillPath: string) => ipcRenderer.invoke('list-skill-files', skillPath),
  listWorkspaceSkills: () => ipcRenderer.invoke('list-workspace-skills'),
  listBuiltinSkills: () => ipcRenderer.invoke('list-builtin-skills'),
  openPathInFinder: (dirPath: string) => ipcRenderer.invoke('open-path-in-finder', dirPath),
  installClawHubSkill: (slug: string) => ipcRenderer.invoke('install-clawhub-skill', slug),
  openSkillSourceDialog: () => ipcRenderer.invoke('open-skill-source-dialog'),
  installLocalSkill: (sourcePath: string) => ipcRenderer.invoke('install-local-skill', sourcePath),
  checkClawHubAuth: () => ipcRenderer.invoke('check-clawhub-auth'),
  clawHubLogin: () => ipcRenderer.invoke('clawhub-login'),
  onSkillInstallLog: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('skill-install-log', handler);

    return () => ipcRenderer.removeListener('skill-install-log', handler);
  },

  // 通用命令执行
  executeCommand: (command: string) => ipcRenderer.invoke('execute-command', command),

  // OpenClaw 网关重启（比通用 executeCommand 更可靠：Node.js 直接获取 UID，多重 fallback）
  restartGateway: () => ipcRenderer.invoke('restart-gateway'),

  // 智能体 auth-profiles 同步
  syncAgentAuth: (providers: Record<string, { apiKey?: string; api?: string }>) =>
    ipcRenderer.invoke('sync-agent-auth', providers),

  // 环境工具 (Python / FFmpeg / yt-dlp)
  checkEnvTool: (tool: string) => ipcRenderer.invoke('check-env-tool', tool),
  installEnvTool: (tool: string) => ipcRenderer.invoke('install-env-tool', tool),
  uninstallEnvTool: (tool: string) => ipcRenderer.invoke('uninstall-env-tool', tool),
  onEnvToolLog: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('env-tool-log', handler);

    return () => ipcRenderer.removeListener('env-tool-log', handler);
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI;
  // @ts-expect-error (define in dts)
  window.api = api;
}
