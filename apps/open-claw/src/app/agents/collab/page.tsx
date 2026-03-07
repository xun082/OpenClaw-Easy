'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Network,
  RefreshCw,
  Save,
  Wrench,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/store/config-store';

import { FormSection } from '../_components/FormSection';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const isElectron = () =>
  typeof window !== 'undefined' && typeof window.api?.executeCommand === 'function';

async function listLocalAgents(): Promise<string[]> {
  if (!isElectron()) return [];

  const res = await window.api.executeCommand('ls -1 ~/.openclaw/agents/ 2>/dev/null | sort');
  if (!res.output) return [];

  return res.output
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function CollabPage() {
  const [mounted, setMounted] = useState(false);
  const [localAgents, setLocalAgents] = useState<string[]>([]);

  const config = useConfigStore((s) => s.config);
  const savedConfig = useConfigStore((s) => s.savedConfig);
  const saveStatus = useConfigStore((s) => s.saveStatus);
  const errorMsg = useConfigStore((s) => s.errorMsg);
  const autoNormalized = useConfigStore((s) => s.autoNormalized);
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const saveConfig = useConfigStore((s) => s.saveConfig);
  const setAgentToAgentEnabled = useConfigStore((s) => s.setAgentToAgentEnabled);
  const setAgentToAgentAllow = useConfigStore((s) => s.setAgentToAgentAllow);

  const a2a = config?.tools?.agentToAgent;
  const isEnabled = a2a?.enabled ?? false;
  const allowList: string[] = a2a?.allow ?? [];

  const configDirty = JSON.stringify(config?.tools) !== JSON.stringify(savedConfig?.tools);
  const canSave = configDirty && saveStatus !== 'saving' && saveStatus !== 'reloading' && !!config;

  const [restarting, setRestarting] = useState(false);
  const handleRestartGateway = async () => {
    setRestarting(true);
    await window.api.restartGateway();
    setRestarting(false);
  };

  const loadData = useCallback(async () => {
    if (!config) await loadConfig();

    const agents = await listLocalAgents();
    setLocalAgents(agents);
  }, [config, loadConfig]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) void loadData();
  }, [mounted, loadData]);

  const toggleAgent = (name: string) => {
    if (allowList.includes(name)) {
      setAgentToAgentAllow(allowList.filter((a) => a !== name));
    } else {
      setAgentToAgentAllow([...allowList, name]);
    }
  };

  const selectAll = () => setAgentToAgentAllow([...localAgents]);
  const clearAll = () => setAgentToAgentAllow([]);

  if (!mounted) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground">配置未加载，请先访问「配置文件」页面</p>
          <Button variant="outline" size="sm" onClick={() => void loadConfig()}>
            重新加载配置
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="text-[17px] font-bold tracking-tight">多 Agent 协作</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          开启 Agent 间消息传递，允许 Agent 互相发消息、分配任务
        </p>
      </div>

      {/* Auto-normalize banner */}
      {autoNormalized && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-300/60 dark:border-sky-700/50 bg-sky-50/60 dark:bg-sky-950/20 px-4 py-3">
          <Wrench className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">配置需要保存修复</p>
            <p className="text-[11px] text-sky-600/80 dark:text-sky-400/70">
              磁盘配置含无效字段，已在内存中自动清理。请点击「保存配置」写入磁盘并重启网关。
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => void saveConfig()}
            disabled={saveStatus === 'saving' || saveStatus === 'reloading'}
            className="gap-1.5 shrink-0 bg-sky-600 hover:bg-sky-700 text-white"
          >
            {saveStatus === 'saving' || saveStatus === 'reloading' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            立即保存修复
          </Button>
        </div>
      )}

      {/* Agent-to-agent toggle */}
      <FormSection
        title="Agent 间通信 (tools.agentToAgent)"
        description="启用后，允许列表中的 Agent 可以互相发送消息，实现任务委派与多 Agent 协作"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">启用 Agent 间通信</p>
              <p className="text-[11px] text-muted-foreground">
                对应配置项：
                <code className="font-mono bg-muted/60 px-1 rounded">
                  tools.agentToAgent.enabled
                </code>
              </p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setAgentToAgentEnabled} />
          </div>

          {isEnabled && (
            <div
              className={cn(
                'rounded-xl border overflow-hidden transition-all',
                isEnabled ? 'border-border' : 'border-border/50 opacity-50 pointer-events-none',
              )}
            >
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b border-border">
                <div>
                  <p className="text-xs font-semibold">允许通信的 Agent 列表 (allow)</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    勾选可互相发送消息的 Agent；留空表示允许所有 Agent
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                    disabled={localAgents.length === 0}
                    className="text-xs h-7 px-2"
                  >
                    全选
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    disabled={allowList.length === 0}
                    className="text-xs h-7 px-2"
                  >
                    清空
                  </Button>
                </div>
              </div>

              <div className="p-3">
                {localAgents.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                    <Network className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-xs">暂无本地 Agent</p>
                    <p className="text-[10px] text-muted-foreground/60">
                      请先在「Agent 管理」页面创建 Agent，或手动输入 Agent 名称
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {localAgents.map((name) => {
                      const isChecked = allowList.includes(name);

                      return (
                        <button
                          key={name}
                          onClick={() => toggleAgent(name)}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all',
                            isChecked
                              ? 'border-primary/40 bg-primary/5 text-foreground'
                              : 'border-border bg-card hover:border-primary/20 hover:bg-muted/30 text-muted-foreground',
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                              isChecked
                                ? 'bg-primary border-primary'
                                : 'border-muted-foreground/30',
                            )}
                          >
                            {isChecked && (
                              <svg
                                viewBox="0 0 8 8"
                                fill="none"
                                stroke="white"
                                strokeWidth="1.5"
                                className="w-2.5 h-2.5"
                              >
                                <polyline points="1,4 3,6 7,2" />
                              </svg>
                            )}
                          </div>
                          <span className="text-xs font-mono font-medium flex-1 truncate">
                            {name}
                          </span>
                          {isChecked && <Zap className="w-3 h-3 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Manual entry for agents not in local list */}
                <div className="mt-3 pt-3 border-t border-border/50">
                  <ManualAgentEntry
                    allowList={allowList}
                    localAgents={localAgents}
                    onAdd={(name) => {
                      if (!allowList.includes(name)) {
                        setAgentToAgentAllow([...allowList, name]);
                      }
                    }}
                    onRemove={(name) => {
                      setAgentToAgentAllow(allowList.filter((a) => a !== name));
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </FormSection>

      {/* Info box */}
      <div className="rounded-xl border border-sky-200/60 dark:border-sky-800/40 bg-sky-50/40 dark:bg-sky-950/20 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-sky-500 shrink-0" />
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">配置说明</p>
        </div>
        <div className="text-[11px] text-sky-700/80 dark:text-sky-300/70 space-y-1.5 leading-relaxed">
          <p>
            开启后，以下配置将写入{' '}
            <code className="font-mono bg-sky-100 dark:bg-sky-900/40 px-1 rounded">
              openclaw.json
            </code>
            ：
          </p>
          <pre className="font-mono bg-sky-100/70 dark:bg-sky-900/30 rounded-lg p-2.5 text-[10px] overflow-x-auto">
            {`{
  "tools": {
    "agentToAgent": {
      "enabled": true,
      "allow": ["agent-a", "agent-b"]
    }
  }
}`}
          </pre>
          <p>
            <code className="font-mono">allow</code> 为空数组时，所有 Agent 都可互相通信；
            指定列表后，仅列表内的 Agent 可以互发消息。
          </p>
        </div>
      </div>

      {/* Config preview when enabled */}
      {isEnabled && (
        <FormSection title="配置预览" description="以下内容将写入 openclaw.json 的 tools 字段">
          <pre className="text-[11px] font-mono text-foreground/80 bg-muted/30 rounded-lg p-3 overflow-x-auto leading-relaxed">
            {JSON.stringify({ tools: config.tools }, null, 2)}
          </pre>
        </FormSection>
      )}

      {/* Footer save bar */}
      <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-border bg-card/60 sticky bottom-4">
        <div className="flex items-center gap-2 h-7">
          {saveStatus === 'reloading' && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              正在重启网关…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              已保存，配置已生效
            </span>
          )}
          {saveStatus === 'saved-no-gateway' && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              已保存（网关未运行）
              <button
                onClick={() => void handleRestartGateway()}
                disabled={restarting}
                className="ml-1 underline underline-offset-2 hover:opacity-80 transition"
              >
                {restarting ? '重启中…' : '点击重启'}
              </button>
            </span>
          )}
          {saveStatus === 'error' && errorMsg && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5" />
              {errorMsg}
            </span>
          )}
          {!configDirty && !autoNormalized && saveStatus === 'idle' && (
            <span className="text-xs text-muted-foreground/50">无未保存更改</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleRestartGateway()}
            disabled={restarting}
            className="gap-1.5 text-xs text-muted-foreground"
            title="不修改配置，直接重启网关"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${restarting ? 'animate-spin' : ''}`} />
            重启网关
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => useConfigStore.getState().setConfig(savedConfig)}
            disabled={!configDirty}
          >
            撤销更改
          </Button>
          <Button
            size="sm"
            onClick={() => void saveConfig()}
            disabled={!canSave && !autoNormalized}
            className="gap-1.5 min-w-[76px]"
          >
            {saveStatus === 'saving' || saveStatus === 'reloading' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            保存配置
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ManualAgentEntry ─────────────────────────────────────────────────────────

interface ManualAgentEntryProps {
  allowList: string[];
  localAgents: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}

function ManualAgentEntry({ allowList, localAgents, onAdd, onRemove }: ManualAgentEntryProps) {
  const [value, setValue] = useState('');

  const extraAgents = allowList.filter((a) => !localAgents.includes(a));

  const handleAdd = () => {
    const name = value.trim().replace(/[^a-zA-Z0-9_-]/g, '');

    if (name) {
      onAdd(name);
      setValue('');
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground/60">手动添加不在本地目录中的 Agent 名称：</p>

      {extraAgents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {extraAgents.map((name) => (
            <Badge
              key={name}
              variant="outline"
              className="font-mono text-[10px] gap-1 pr-1 cursor-pointer hover:border-destructive/50 hover:text-destructive"
              onClick={() => onRemove(name)}
            >
              {name}
              <span className="text-muted-foreground">×</span>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="agent-name，按 Enter 添加"
          className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!value.trim()}
          className="h-7 text-xs px-2.5"
        >
          添加
        </Button>
      </div>
    </div>
  );
}
