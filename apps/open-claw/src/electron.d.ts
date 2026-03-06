export {};

export interface InstallLogEvent {
  type: 'info' | 'stdout' | 'stderr' | 'error';
  message: string;
  timestamp: number;
}

export interface NodeCheckResult {
  found: boolean;
  version?: string;
  nodePath?: string;
  npmPath?: string;
}

export interface OpenclawCheckResult {
  found: boolean;
  version?: string;
}

export interface InstallNodeResult {
  success: boolean;
  nodePath?: string;
  npmPath?: string;
}

export interface InstallOpenclawResult {
  success: boolean;
  version?: string;
}

export interface ReadConfigResult {
  success: boolean;
  content?: string;
  error?: string;
  path: string;
}

export interface WriteConfigResult {
  success: boolean;
  error?: string;
}

export interface Skill {
  name: string;
  description: string;
  path: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  children?: FileEntry[];
}

export interface ListSkillsResult {
  success: boolean;
  skills: Skill[];
  path: string;
  error?: string;
}

export interface EnvToolCheckResult {
  found: boolean;
  version?: string;
}

export interface EnvToolOpResult {
  success: boolean;
}

export interface EnvToolLogEvent {
  type: 'info' | 'stdout' | 'stderr' | 'error';
  message: string;
  timestamp: number;
}

declare global {
  interface Window {
    api: {
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      toggleDevTools: () => Promise<void>;

      // 安装
      checkSystemNode: () => Promise<NodeCheckResult>;
      checkOpenclaw: () => Promise<OpenclawCheckResult>;
      installNodeLts: () => Promise<InstallNodeResult>;
      installOpenclaw: () => Promise<InstallOpenclawResult>;
      onInstallLog: (callback: (data: InstallLogEvent) => void) => () => void;

      // 通用命令
      executeCommand: (
        command: string,
      ) => Promise<{ success: boolean; output: string | null; error: string | null }>;

      // OpenClaw 网关重启（多重 fallback：launchctl kickstart → bootstrap → zsh）
      restartGateway: () => Promise<{ success: boolean; output: string }>;

      // 智能体 auth-profiles 同步（把 openclaw.json 里的 apiKey 同步写入 agent 独立鉴权文件）
      syncAgentAuth: (
        providers: Record<string, { apiKey?: string; api?: string }>,
      ) => Promise<{ success: boolean; error?: string }>;

      // 配置
      readOpenclawConfig: () => Promise<ReadConfigResult>;
      writeOpenclawConfig: (content: string) => Promise<WriteConfigResult>;
      checkOpenclawConfigExists: () => Promise<{ exists: boolean; path: string }>;

      // 技能
      listSkillFiles: (
        skillPath: string,
      ) => Promise<{ success: boolean; tree: FileEntry[]; error?: string }>;
      listWorkspaceSkills: () => Promise<ListSkillsResult>;
      listBuiltinSkills: () => Promise<ListSkillsResult>;
      openPathInFinder: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
      installClawHubSkill: (slug: string) => Promise<{ success: boolean; error?: string }>;
      openSkillSourceDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      installLocalSkill: (
        sourcePath: string,
      ) => Promise<{ success: boolean; skillName?: string; error?: string }>;
      checkClawHubAuth: () => Promise<{ hasToken: boolean }>;
      clawHubLogin: () => Promise<{ success: boolean; error?: string }>;
      onSkillInstallLog: (callback: (data: InstallLogEvent) => void) => () => void;

      // 环境工具
      checkEnvTool: (tool: string) => Promise<EnvToolCheckResult>;
      installEnvTool: (tool: string) => Promise<EnvToolOpResult>;
      uninstallEnvTool: (tool: string) => Promise<EnvToolOpResult>;
      onEnvToolLog: (callback: (data: EnvToolLogEvent) => void) => () => void;
    };
  }
}
