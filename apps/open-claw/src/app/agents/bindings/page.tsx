'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AgentBinding, AgentBindingPeer } from '@/store/config-store';
import { useConfigStore } from '@/store/config-store';

import { FormSection } from '../_components/FormSection';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_OPTIONS = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'discord', label: 'Discord' },
  { value: 'slack', label: 'Slack' },
  { value: 'lark', label: '飞书 (Lark)' },
  { value: 'dingtalk', label: '钉钉 (DingTalk)' },
  { value: 'wechat', label: '微信 (WeChat)' },
  { value: 'api', label: 'API (直接调用)' },
] as const;

const PEER_KIND_OPTIONS = [
  { value: 'private', label: '私聊 (private)' },
  { value: 'group', label: '群组 (group)' },
  { value: 'channel', label: '频道 (channel)' },
] as const;

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

export default function BindingsPage() {
  const [mounted, setMounted] = useState(false);
  const [localAgents, setLocalAgents] = useState<string[]>([]);

  const config = useConfigStore((s) => s.config);
  const savedConfig = useConfigStore((s) => s.savedConfig);
  const saveStatus = useConfigStore((s) => s.saveStatus);
  const errorMsg = useConfigStore((s) => s.errorMsg);
  const autoNormalized = useConfigStore((s) => s.autoNormalized);
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const saveConfig = useConfigStore((s) => s.saveConfig);
  const addBinding = useConfigStore((s) => s.addBinding);
  const updateBinding = useConfigStore((s) => s.updateBinding);
  const updateBindingMatch = useConfigStore((s) => s.updateBindingMatch);
  const removeBinding = useConfigStore((s) => s.removeBinding);

  const bindings: AgentBinding[] = config?.bindings ?? [];
  // A binding with empty agentid would be stripped by normalizeConfig — warn the user
  const hasEmptyAgentId = bindings.some((b) => !b.agentId.trim());
  const isDirty = JSON.stringify(config?.bindings) !== JSON.stringify(savedConfig?.bindings);
  const canSave =
    isDirty &&
    !hasEmptyAgentId &&
    saveStatus !== 'saving' &&
    saveStatus !== 'reloading' &&
    !!config;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight">路由绑定</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            将渠道消息路由至指定 Agent，支持按频道类型、群组 ID 精确匹配
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
          {bindings.length} 条规则
        </Badge>
      </div>

      {/* Auto-normalize banner — shown when loadConfig detected invalid config on disk */}
      {autoNormalized && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-300/60 dark:border-sky-700/50 bg-sky-50/60 dark:bg-sky-950/20 px-4 py-3">
          <Wrench className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              检测到配置需要自动修复
            </p>
            <p className="text-[11px] text-sky-600/80 dark:text-sky-400/70 leading-relaxed">
              磁盘上的配置包含无效字段（如{' '}
              <code className="font-mono bg-sky-100 dark:bg-sky-900/40 px-1 rounded">
                peer.id: &quot;&quot;
              </code>
              ），已在内存中自动清理。
              <strong>请点击「保存配置」</strong>将修复后的版本写入磁盘，网关将自动重启恢复正常。
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

      {/* Validation warning */}
      {hasEmptyAgentId && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              存在未完成的绑定规则
            </p>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70">
              请为每条规则填写{' '}
              <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                agentId
              </code>
              ，或删除空规则，否则无法保存。
            </p>
          </div>
        </div>
      )}

      {/* Bindings list */}
      <FormSection
        title="绑定规则 (bindings)"
        description="按顺序匹配，第一条命中的规则生效。peer.id 留空表示匹配该类型的所有会话"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={addBinding}
            className="gap-1 text-xs text-primary hover:text-primary/80"
          >
            <Plus className="w-3.5 h-3.5" />
            添加规则
          </Button>
        }
      >
        {bindings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-xs">暂无路由规则，点击右上角「添加规则」</p>
            <p className="text-[10px] text-muted-foreground/60 text-center max-w-xs">
              不配置路由时，所有渠道消息将发送给默认
              Agent（在「配置文件」页面的「智能体默认值」中配置）
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bindings.map((binding, idx) => (
              <BindingRow
                key={idx}
                idx={idx}
                binding={binding}
                localAgents={localAgents}
                onUpdateAgent={(agentId) => updateBinding(idx, { agentId })}
                onUpdateChannel={(channel) => updateBindingMatch(idx, { channel })}
                onUpdatePeerKind={(kind) =>
                  updateBindingMatch(idx, { peer: { kind: kind as AgentBindingPeer['kind'] } })
                }
                onUpdatePeerId={(id) => updateBindingMatch(idx, { peer: { id } })}
                onRemove={() => removeBinding(idx)}
              />
            ))}
          </div>
        )}
      </FormSection>

      {/* JSON preview — show normalized output so user sees exactly what will be saved */}
      {bindings.length > 0 && (
        <FormSection
          title="配置预览（已规范化）"
          description="peer.id 为空时会自动省略，保存后网关可正常启动"
        >
          <pre className="text-[11px] font-mono text-foreground/80 bg-muted/30 rounded-lg p-3 overflow-x-auto leading-relaxed">
            {JSON.stringify(
              {
                bindings: bindings
                  .filter((b) => b.agentId.trim())
                  .map((b) => ({
                    agentId: b.agentId.trim(),
                    match: {
                      channel: b.match.channel,
                      // peer.id is required when peer is present; omit peer entirely if id is empty
                      ...(b.match.peer?.id?.trim()
                        ? {
                            peer: {
                              kind: b.match.peer.kind,
                              id: b.match.peer.id.trim(),
                            },
                          }
                        : {}),
                    },
                  })),
              },
              null,
              2,
            )}
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
          {hasEmptyAgentId && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              请填写所有 agentid 后再保存
            </span>
          )}
          {!isDirty && !hasEmptyAgentId && saveStatus === 'idle' && !autoNormalized && (
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
            disabled={!isDirty}
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

// ─── BindingRow ────────────────────────────────────────────────────────────────

interface BindingRowProps {
  idx: number;
  binding: AgentBinding;
  localAgents: string[];
  onUpdateAgent: (agentId: string) => void;
  onUpdateChannel: (channel: string) => void;
  onUpdatePeerKind: (kind: string) => void;
  onUpdatePeerId: (id: string) => void;
  onRemove: () => void;
}

function BindingRow({
  idx,
  binding,
  localAgents,
  onUpdateAgent,
  onUpdateChannel,
  onUpdatePeerKind,
  onUpdatePeerId,
  onRemove,
}: BindingRowProps) {
  const peerKind = binding.match.peer?.kind ?? 'group';
  const peerId = binding.match.peer?.id ?? '';

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card overflow-hidden',
        'ring-0 transition-all',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/20 border-b border-border">
        <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
          #{idx + 1}
        </span>
        <span className="flex-1 text-xs text-muted-foreground font-mono">
          {binding.agentId ? (
            <span className="text-foreground font-semibold">{binding.agentId}</span>
          ) : (
            <span className="italic opacity-50">（未设置 Agent）</span>
          )}
          {' ← '}
          <span className="text-sky-600 dark:text-sky-400">{binding.match.channel}</span>
          {binding.match.peer && (
            <>
              {' / '}
              <span className="text-emerald-600 dark:text-emerald-400">{peerKind}</span>
              {peerId && (
                <>
                  {' / '}
                  <span className="text-amber-600 dark:text-amber-400">{peerId}</span>
                </>
              )}
            </>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="p-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Agent ID */}
        <div className="space-y-1.5 col-span-1">
          <Label className="text-[10px]">agentId</Label>
          {localAgents.length > 0 ? (
            <Select
              value={binding.agentId || '__custom__'}
              onValueChange={(v) => {
                if (v !== '__custom__') onUpdateAgent(v);
              }}
            >
              <SelectTrigger className="h-8 text-xs font-mono">
                <SelectValue placeholder="选择 Agent" />
              </SelectTrigger>
              <SelectContent>
                {localAgents.map((a) => (
                  <SelectItem key={a} value={a} className="font-mono text-xs">
                    {a}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__" className="text-xs text-muted-foreground italic">
                  手动输入…
                </SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={binding.agentId}
              onChange={(e) => onUpdateAgent(e.target.value)}
              placeholder="agent-name"
              className="h-8 text-xs font-mono"
            />
          )}
        </div>

        {/* Channel */}
        <div className="space-y-1.5 col-span-1">
          <Label className="text-[10px]">channel</Label>
          <Select value={binding.match.channel} onValueChange={onUpdateChannel}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Peer kind */}
        <div className="space-y-1.5 col-span-1">
          <Label className="text-[10px]">peer.kind</Label>
          <Select value={peerKind} onValueChange={onUpdatePeerKind}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PEER_KIND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Peer ID */}
        <div className="space-y-1.5 col-span-1">
          <Label className="text-[10px]">peer.id（可选）</Label>
          <Input
            value={peerId}
            onChange={(e) => onUpdatePeerId(e.target.value)}
            placeholder="群组 / 频道 ID"
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>
    </div>
  );
}
