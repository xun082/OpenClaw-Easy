'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AgentModelConfig, OpenclawConfig } from '@/store/config-store';

import { FieldGroup } from './FieldGroup';
import { FormSection } from './FormSection';
import { ModelSelector } from './ModelSelector';
import { SegmentedControl } from './SegmentedControl';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AgentsSectionProps {
  config: OpenclawConfig | null;
  setAgentWorkspace: (workspace: string) => void;
  setContextPruningMode: (mode: 'cache-ttl' | 'off') => void;
  setAgentDefaultModel: (primary: string) => void;
  addAgentModelEntry: (key: string, alias: string) => void;
  updateAgentModelEntry: (key: string, patch: Partial<AgentModelConfig>) => void;
  removeAgentModelEntry: (key: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentsSection({
  config,
  setAgentWorkspace,
  setContextPruningMode,
  setAgentDefaultModel,
  addAgentModelEntry,
  updateAgentModelEntry,
  removeAgentModelEntry,
}: AgentsSectionProps) {
  const [newKey, setNewKey] = useState('');
  const [newAlias, setNewAlias] = useState('');

  const handleAdd = () => {
    if (!newKey.trim()) return;
    addAgentModelEntry(newKey.trim(), newAlias.trim());
    setNewKey('');
    setNewAlias('');
  };

  return (
    <FormSection
      title="智能体默认值 (agents.defaults)"
      description="Pi 智能体会话的工作目录与上下文裁剪策略（pi-coding-agent 集成）"
    >
      <div className="space-y-3">
        <FieldGroup
          label="工作目录 (workspace)"
          hint="Pi 智能体的 cwd；--dev 模式下默认为 ~/.openclaw/workspace-dev"
        >
          <Input
            value={config?.agents?.defaults?.workspace ?? ''}
            onChange={(e) => setAgentWorkspace(e.target.value)}
            placeholder="~/.openclaw/workspace"
            className="font-mono"
          />
        </FieldGroup>

        <FieldGroup
          label="上下文裁剪模式 (contextPruning.mode)"
          hint="cache-ttl：基于缓存 TTL 自动裁剪上下文窗口，减少 token 消耗"
        >
          <SegmentedControl
            value={config?.agents?.defaults?.contextPruning?.mode ?? 'off'}
            options={[
              { value: 'off', label: '关闭' },
              { value: 'cache-ttl', label: 'cache-ttl' },
            ]}
            onChange={(v) => setContextPruningMode(v as 'cache-ttl' | 'off')}
            compact
          />
        </FieldGroup>

        <FieldGroup label="默认模型 (model.primary)">
          <ModelSelector
            value={config?.agents?.defaults?.model?.primary ?? ''}
            providers={config?.models?.providers ?? {}}
            aliasKeys={Object.keys(config?.agents?.defaults?.models ?? {})}
            onChange={setAgentDefaultModel}
          />
        </FieldGroup>

        {/* Model aliases */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>模型别名 (models)</Label>
            <span className="text-[10px] text-muted-foreground/60">
              为 provider/modelId 设置别名，Kimi Coding 必填
            </span>
          </div>

          {Object.entries(config?.agents?.defaults?.models ?? {}).length > 0 && (
            <div className="space-y-2 mb-2">
              {Object.entries(config?.agents?.defaults?.models ?? {}).map(
                ([key, cfg]: [string, AgentModelConfig]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="h-9 flex items-center px-3 rounded-lg border border-border bg-muted/30 text-muted-foreground text-xs font-mono flex-1 select-all overflow-hidden">
                      {key}
                    </span>
                    <span className="text-muted-foreground text-sm shrink-0">→</span>
                    <Input
                      value={cfg.alias ?? ''}
                      onChange={(e) => updateAgentModelEntry(key, { alias: e.target.value })}
                      placeholder="别名（如 Kimi K2.5）"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeAgentModelEntry(key)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ),
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="provider/modelId（如 kimi-coding/k2p5）"
              className="flex-1 font-mono text-xs"
            />
            <Input
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="别名"
              className="w-36"
            />
            <Button size="icon-sm" onClick={handleAdd} disabled={!newKey.trim()}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">
            示例：key = <code className="font-mono">kimi-coding/k2p5</code>，别名 = Kimi K2.5。
            Kimi Coding 订阅用户可在「环境变量」里设置 KIMI_API_KEY 并在此处添加 alias，或直接在上方「模型提供商」中添加
            Kimi Code 提供商。
          </p>
        </div>
      </div>
    </FormSection>
  );
}
