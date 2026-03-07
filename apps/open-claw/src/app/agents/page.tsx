'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Terminal,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfigStore } from '@/store/config-store';

import { FormSection } from './_components/FormSection';

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_WORKSPACE = '~/.openclaw/workspace';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const isElectron = () =>
  typeof window !== 'undefined' && typeof window.api?.executeCommand === 'function';

function stripAnsi(str: string): string {
  return str
    .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1B[()][AB]/g, '')
    .replace(/\x1B[^[\]]/g, '')
    .replace(/[┌└│◆◇▲✓✗●○]/g, '')
    .replace(/^\s*\n/gm, '')
    .trim();
}

function toBase64(content: string): string {
  return btoa(unescape(encodeURIComponent(content)));
}

/** Default workspace path for a new agent. */
function defaultWorkspacePath(name: string): string {
  return name.trim() ? `~/.openclaw/workspace-${name.trim()}` : '';
}

/**
 * Resolve the effective workspace path for an agent.
 * SOUL.md, AGENTS.md, MEMORY.md etc. live in the WORKSPACE, not agents/.
 */
function resolveWorkspace(agentWorkspace: string | undefined, defaultWs: string): string {
  return agentWorkspace?.trim() || defaultWs;
}

// ─── File I/O — reads/writes from the WORKSPACE directory ──────────────────

async function readWorkspaceFile(workspacePath: string, filename: string): Promise<string> {
  if (!isElectron()) return '';

  const path = workspacePath.startsWith('~') ? `$HOME${workspacePath.slice(1)}` : workspacePath;
  const res = await window.api.executeCommand(`cat "${path}/${filename}" 2>/dev/null`);

  return res.output ?? '';
}

async function writeWorkspaceFile(
  workspacePath: string,
  filename: string,
  content: string,
): Promise<boolean> {
  if (!isElectron()) return false;

  const path = workspacePath.startsWith('~') ? `$HOME${workspacePath.slice(1)}` : workspacePath;
  const b64 = toBase64(content);
  const res = await window.api.executeCommand(
    `mkdir -p "${path}" && printf '%s' '${b64}' | base64 -d > "${path}/${filename}" && echo "__OK__"`,
  );

  return (res.output ?? '').includes('__OK__');
}

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Merged agent info from openclaw.json config + filesystem */
interface AgentInfo {
  id: string;
  /** Resolved workspace path — where SOUL.md / AGENTS.md / MEMORY.md actually live */
  workspace: string;
  /** True = in openclaw.json agents.list (properly registered) */
  isRegistered: boolean;
}

interface AgentFiles {
  soul: string;
  agentsMd: string;
  memory: string;
}

type ActiveTab = 'soul' | 'agents' | 'memory';

interface AgentState {
  files: AgentFiles;
  tab: ActiveTab;
  saving: boolean;
  loading: boolean;
  saveError: string | null;
  saved: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const config = useConfigStore((s) => s.config);
  const loadConfig = useConfigStore((s) => s.loadConfig);

  const [mounted, setMounted] = useState(false);
  const [agentInfos, setAgentInfos] = useState<AgentInfo[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});

  // Create form
  const [createName, setCreateName] = useState('');
  const [createWorkspace, setCreateWorkspace] = useState('');
  const [workspaceTouched, setWorkspaceTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createLog, setCreateLog] = useState('');
  const [createSuccess, setCreateSuccess] = useState<boolean | null>(null);
  const [showCreateLog, setShowCreateLog] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  // Use a ref so refreshAgents always reads the latest config without needing it as a dep
  const configRef = useRef(config);
  configRef.current = config;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    setMounted(true);
    // Load config if not already loaded (e.g. direct navigation to this page)
    if (!config) void loadConfig();
  }, []); // intentionally empty — runs once on mount

  // ── Agent list (merged from config + filesystem) ───────────────────────────

  const refreshAgents = useCallback(async () => {
    if (!isElectron()) return;
    setLoadingList(true);

    const cfg = configRef.current;
    const defaultWs = cfg?.agents?.defaults?.workspace?.trim() || DEFAULT_WORKSPACE;
    const configList = cfg?.agents?.list ?? [];

    // Build registered agents from config
    const registered: AgentInfo[] = configList.map((a) => ({
      id: a.id,
      workspace: resolveWorkspace(a.workspace, defaultWs),
      isRegistered: true,
    }));

    // Scan filesystem for additional unregistered agents
    const lsRes = await window.api.executeCommand(`ls -1 ~/.openclaw/agents/ 2>/dev/null`);
    const fsNames = (lsRes.output ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const merged: AgentInfo[] = [...registered];

    for (const name of fsNames) {
      if (!merged.some((m) => m.id === name)) {
        // Unregistered agent: guess its workspace
        merged.push({
          id: name,
          workspace: `~/.openclaw/workspace-${name}`,
          isRegistered: false,
        });
      }
    }

    // Ensure 'main' is always first
    merged.sort((a, b) => {
      if (a.id === 'main') return -1;

      if (b.id === 'main') return 1;

      return a.id.localeCompare(b.id);
    });

    setAgentInfos(merged);
    setLoadingList(false);
  }, []);

  useEffect(() => {
    if (mounted) void refreshAgents();
  }, [mounted, refreshAgents]);

  // Re-refresh when config loads/changes (workspace paths may update)
  const prevConfigRef = useRef(config);
  useEffect(() => {
    if (!config || prevConfigRef.current === config) return;
    prevConfigRef.current = config;
    void refreshAgents();
  }, [config, refreshAgents]);

  // Auto-scroll terminal log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [createLog]);

  // ── Agent create ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name || creating) return;

    const ws = createWorkspace.trim() || defaultWorkspacePath(name);
    const cmd = `openclaw agents add ${name} --workspace ${ws} 2>&1`;

    setCreating(true);
    setCreateSuccess(null);
    setShowCreateLog(true);
    setCreateLog(`$ ${cmd}\n`);

    const res = await window.api.executeCommand(cmd);
    const rawOutput = res.output ?? res.error ?? '';
    const cleanOutput = stripAnsi(rawOutput);

    setCreateLog((prev) => prev + (cleanOutput ? cleanOutput + '\n' : ''));

    // Check success via exit code or agent dir existence
    const checkRes = await window.api.executeCommand(
      `test -d ~/.openclaw/agents/${name} && echo "__EXISTS__"`,
    );
    const dirExists = (checkRes.output ?? '').includes('__EXISTS__');
    const isSuccess = res.success || /created|added|done|success/i.test(cleanOutput) || dirExists;

    if (isSuccess) {
      setCreateSuccess(true);
      setCreateLog((prev) => prev + `\n✓ Agent "${name}" 创建成功\n   工作区：${ws}\n`);
      setCreateName('');
      setCreateWorkspace('');
      setWorkspaceTouched(false);
      // Reload config so agents.list updates, then refresh the UI list
      await loadConfig();
      await refreshAgents();
    } else {
      setCreateSuccess(false);
      setCreateLog((prev) => prev + `\n✗ 创建失败，请检查以上输出\n`);
    }

    setCreating(false);
  };

  // ── Expand / load workspace files ─────────────────────────────────────────

  const getAgentWorkspace = (id: string): string => {
    const info = agentInfos.find((a) => a.id === id);

    if (info) return info.workspace;

    // Fallback
    const cfg = configRef.current;
    const defaultWs = cfg?.agents?.defaults?.workspace?.trim() || DEFAULT_WORKSPACE;
    const entry = cfg?.agents?.list?.find((a) => a.id === id);

    return resolveWorkspace(entry?.workspace, defaultWs);
  };

  const handleToggleExpand = async (id: string) => {
    const nowExpanded = !expandedAgents[id];
    setExpandedAgents((prev) => ({ ...prev, [id]: nowExpanded }));

    if (nowExpanded && !agentStates[id]) {
      const workspace = getAgentWorkspace(id);

      setAgentStates((prev) => ({
        ...prev,
        [id]: {
          files: { soul: '', agentsMd: '', memory: '' },
          tab: 'soul',
          saving: false,
          loading: true,
          saveError: null,
          saved: false,
        },
      }));

      const [soul, agentsMd, memory] = await Promise.all([
        readWorkspaceFile(workspace, 'SOUL.md'),
        readWorkspaceFile(workspace, 'AGENTS.md'),
        readWorkspaceFile(workspace, 'MEMORY.md'),
      ]);

      setAgentStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], files: { soul, agentsMd, memory }, loading: false },
      }));
    }
  };

  // ── File edit ─────────────────────────────────────────────────────────────

  const updateAgentFile = (id: string, field: keyof AgentFiles, value: string) => {
    setAgentStates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        files: { ...prev[id].files, [field]: value },
        saved: false,
        saveError: null,
      },
    }));
  };

  const setAgentTab = (id: string, tab: ActiveTab) => {
    setAgentStates((prev) => ({ ...prev, [id]: { ...prev[id], tab } }));
  };

  // ── Save workspace files ──────────────────────────────────────────────────

  const handleSaveAgent = async (id: string) => {
    const state = agentStates[id];
    if (!state || state.saving) return;

    const workspace = getAgentWorkspace(id);

    setAgentStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], saving: true, saveError: null, saved: false },
    }));

    const results = await Promise.all([
      writeWorkspaceFile(workspace, 'SOUL.md', state.files.soul),
      writeWorkspaceFile(workspace, 'AGENTS.md', state.files.agentsMd),
      ...(state.files.memory.trim()
        ? [writeWorkspaceFile(workspace, 'MEMORY.md', state.files.memory)]
        : [Promise.resolve(true)]),
    ]);

    const allOk = results.every(Boolean);

    setAgentStates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        saving: false,
        saved: allOk,
        saveError: allOk ? null : '部分文件保存失败，请检查工作区路径',
      },
    }));

    if (allOk) {
      setTimeout(() => {
        setAgentStates((prev) => ({ ...prev, [id]: { ...prev[id], saved: false } }));
      }, 3000);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDeleteAgent = async (info: AgentInfo) => {
    const { id, workspace } = info;
    if (
      !confirm(
        `确认删除 Agent "${id}"？\n\n将尝试：\n  1. 运行 openclaw agents rm ${id}\n  2. 删除 Agent 目录：~/.openclaw/agents/${id}/\n\n注意：工作区目录（${workspace}）不会被删除。\n此操作不可撤销。`,
      )
    )
      return;

    // Try official removal first (updates openclaw.json)
    const rmRes = await window.api.executeCommand(`openclaw agents rm ${id} 2>&1 || true`);
    const rmOutput = stripAnsi(rmRes.output ?? '');
    const rmOk =
      rmRes.success || /removed|deleted|done/i.test(rmOutput) || !rmOutput.includes('error');

    // Also delete the agents directory (sessions etc.)
    await window.api.executeCommand(`rm -rf ~/.openclaw/agents/${id} 2>&1`);

    if (!rmOk) {
      // If openclaw rm failed, reload config to reflect any changes
      await loadConfig();
    }

    setExpandedAgents((prev) => {
      const next = { ...prev };
      delete next[id];

      return next;
    });
    setAgentStates((prev) => {
      const next = { ...prev };
      delete next[id];

      return next;
    });

    await loadConfig();
    await refreshAgents();
  };

  // ── Open workspace in Finder ──────────────────────────────────────────────

  const handleOpenFinder = async (info: AgentInfo) => {
    await window.api.openPathInFinder(info.workspace);
  };

  // ── Early state ───────────────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-4 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight">Agent 管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            创建、配置独立 Agent，每个 Agent 拥有独立的记忆、身份与工作区
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refreshAgents()}
          disabled={loadingList}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
          刷新列表
        </Button>
      </div>

      {/* Create Agent */}
      <FormSection
        title="创建 Agent"
        description="新建独立 Agent，每个 Agent 有专属工作区与身份文件，互不干扰"
      >
        <div className="space-y-3">
          {/* Row 1: name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Agent 名称</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/60 font-mono select-none pointer-events-none">
                  agents add&nbsp;
                </span>
                <Input
                  value={createName}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                    setCreateName(v);
                    if (!workspaceTouched) setCreateWorkspace(defaultWorkspacePath(v));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate();
                  }}
                  placeholder="tech-agent"
                  className="pl-[84px] font-mono"
                  disabled={creating}
                />
              </div>
              <Button
                onClick={() => void handleCreate()}
                disabled={!createName.trim() || creating}
                className="gap-1.5 shrink-0"
              >
                {creating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                创建
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50">
              仅支持字母、数字、下划线和短横线，例如：
              <code className="font-mono">tech-agent</code>、
              <code className="font-mono">ops_bot</code>
            </p>
          </div>

          {/* Row 2: workspace */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              工作目录{' '}
              <span className="text-muted-foreground/50 font-normal">（--workspace，可选）</span>
            </label>
            <Input
              value={createWorkspace}
              onChange={(e) => {
                setCreateWorkspace(e.target.value);
                setWorkspaceTouched(true);
              }}
              placeholder={
                createName.trim()
                  ? defaultWorkspacePath(createName)
                  : '~/.openclaw/workspace-<name>'
              }
              className="font-mono text-xs"
              disabled={creating}
            />
            <p className="text-[10px] text-muted-foreground/50">
              SOUL.md、AGENTS.md 将写入此目录；留空使用默认路径：
              <code className="font-mono">~/.openclaw/workspace-{createName || '<name>'}</code>
            </p>
          </div>

          {/* Terminal log */}
          {showCreateLog && (
            <div className="rounded-lg overflow-hidden border border-zinc-700/60 bg-zinc-950">
              <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800/60">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500/70" />
                    <span className="w-2 h-2 rounded-full bg-yellow-500/70" />
                    <span className="w-2 h-2 rounded-full bg-green-500/70" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">终端输出</span>
                  {creating && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      执行中…
                    </span>
                  )}
                  {!creating && createSuccess === true && (
                    <span className="text-[10px] text-emerald-400 font-mono">✓ 成功</span>
                  )}
                  {!creating && createSuccess === false && (
                    <span className="text-[10px] text-red-400 font-mono">✗ 失败</span>
                  )}
                </div>
                <button
                  onClick={() => setShowCreateLog(false)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition font-mono"
                >
                  收起
                </button>
              </div>
              <pre
                ref={logRef}
                className="px-3 py-2 text-[11px] font-mono max-h-44 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all"
              >
                {createLog.split('\n').map((line, i) => {
                  const isOk = /✓|成功|created|added|done/i.test(line);
                  const isErr = /✗|失败|error|failed/i.test(line);

                  return (
                    <span
                      key={i}
                      className={
                        isOk ? 'text-emerald-400' : isErr ? 'text-red-400' : 'text-zinc-300'
                      }
                    >
                      {line}
                    </span>
                  );
                })}
              </pre>
            </div>
          )}
        </div>
      </FormSection>

      {/* Agent list */}
      <FormSection
        title="已有 Agent"
        description="点击 Agent 展开，可编辑工作区中的 SOUL.md / AGENTS.md / MEMORY.md"
        action={
          <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
            {agentInfos.length} 个
          </Badge>
        }
      >
        {loadingList ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">正在读取 Agent 列表…</span>
          </div>
        ) : agentInfos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <Bot className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-xs">暂无 Agent，在上方创建第一个</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agentInfos.map((info) => {
              const { id, workspace, isRegistered } = info;
              const isExpanded = !!expandedAgents[id];
              const state = agentStates[id];

              return (
                <div key={id} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Card header */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void handleToggleExpand(id)}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') void handleToggleExpand(id);
                    }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono">{id}</span>
                        {!isRegistered && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-1.5 py-0.5 rounded-full font-medium">
                            <AlertCircle className="w-2.5 h-2.5" />
                            未注册
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                        工作区：{workspace}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleOpenFinder(info);
                      }}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                      title="在 Finder 中打开工作区"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteAgent(info);
                      }}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                      title="删除 Agent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </div>

                  {/* Unregistered warning */}
                  {!isRegistered && isExpanded && (
                    <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200/50 dark:border-amber-700/30">
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        此 Agent 未在 <code className="font-mono">openclaw.json</code>{' '}
                        中注册，路由绑定等功能不可用。 建议运行：
                        <code className="font-mono ml-1">
                          openclaw agents add {id} --workspace {workspace}
                        </code>
                      </p>
                    </div>
                  )}

                  {/* Card body */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/10">
                      {state?.loading ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-xs">正在读取工作区文件…</span>
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          {/* Tab selector */}
                          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 w-fit">
                            {(
                              [
                                { key: 'soul', label: 'SOUL.md', icon: Terminal },
                                { key: 'agents', label: 'AGENTS.md', icon: Bot },
                                { key: 'memory', label: 'MEMORY.md', icon: FilePlus2 },
                              ] as const
                            ).map(({ key, label, icon: Icon }) => (
                              <button
                                key={key}
                                onClick={() => setAgentTab(id, key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                  state?.tab === key
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <Icon className="w-3 h-3 shrink-0" />
                                {label}
                              </button>
                            ))}
                          </div>

                          {/* Editor */}
                          <div className="relative">
                            {state?.tab === 'soul' && (
                              <AgentFileEditor
                                filename="SOUL.md"
                                workspacePath={workspace}
                                value={state?.files.soul ?? ''}
                                placeholder={`# SOUL.md\n你是 ${id}，一个专注于……的 AI 助手。\n\n## 核心特征\n- 专业领域\n- 性格特点\n- 回答风格`}
                                onChange={(v) => updateAgentFile(id, 'soul', v)}
                              />
                            )}
                            {state?.tab === 'agents' && (
                              <AgentFileEditor
                                filename="AGENTS.md"
                                workspacePath={workspace}
                                value={state?.files.agentsMd ?? ''}
                                placeholder={`# AGENTS.md\n## ${id} 的职责\n- 负责……\n- 汇报给……\n\n## 工作流程\n1. 接收任务\n2. 执行处理\n3. 返回结果`}
                                onChange={(v) => updateAgentFile(id, 'agentsMd', v)}
                              />
                            )}
                            {state?.tab === 'memory' && (
                              <AgentFileEditor
                                filename="MEMORY.md"
                                workspacePath={workspace}
                                value={state?.files.memory ?? ''}
                                placeholder="# MEMORY.md\n\nAgent 的长期记忆与上下文信息（留空则不创建此文件）"
                                onChange={(v) => updateAgentFile(id, 'memory', v)}
                              />
                            )}
                          </div>

                          {/* Footer actions */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 h-7">
                              {state?.saveError && (
                                <span className="text-xs text-destructive">{state.saveError}</span>
                              )}
                              {state?.saved && (
                                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                  ✓ 已保存到工作区
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleOpenFinder(info)}
                                className="gap-1.5 text-xs text-muted-foreground"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                打开工作区
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => void handleSaveAgent(id)}
                                disabled={state?.saving}
                                className="gap-1.5"
                              >
                                {state?.saving ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Save className="w-3.5 h-3.5" />
                                )}
                                保存文件
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </FormSection>

      {/* Footer info */}
      <div className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5 pb-2">
        <FolderOpen className="w-3 h-3 shrink-0" />
        Agent 目录：
        <code className="font-mono">~/.openclaw/agents/</code>
        <span className="mx-1 opacity-50">·</span>
        SOUL.md / AGENTS.md 在各 Agent 的工作区目录下
      </div>
    </div>
  );
}

// ─── AgentFileEditor ──────────────────────────────────────────────────────────

interface AgentFileEditorProps {
  filename: string;
  workspacePath: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function AgentFileEditor({
  filename,
  workspacePath,
  value,
  placeholder,
  onChange,
}: AgentFileEditorProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
        <span className="text-muted-foreground/50 truncate max-w-[260px]">{workspacePath}/</span>
        <span className="text-foreground/70 font-semibold shrink-0">{filename}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={12}
        className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 resize-y focus:outline-none focus:ring-1 focus:ring-primary/40 transition"
        spellCheck={false}
      />
    </div>
  );
}
