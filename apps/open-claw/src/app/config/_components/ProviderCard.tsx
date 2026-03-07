'use client';

import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';

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
import { Switch } from '@/components/ui/switch';
import type { OpenclawModelEntry, ProviderConfig } from '@/lib/openclaw-providers';
import {
  API_OPTIONS,
  APIS_REQUIRING_MODELS,
  PROVIDER_MODELS,
  resolveModelListKey,
} from '@/lib/openclaw-providers';

import { FieldGroup } from './FieldGroup';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProviderCardProps {
  name: string;
  provider: ProviderConfig;
  isExpanded: boolean;
  isKeyVisible: boolean;
  onToggle: () => void;
  onToggleKey: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<ProviderConfig>) => void;
  onAddModel: (model: OpenclawModelEntry) => void;
  onRemoveModel: (modelId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProviderCard({
  name,
  provider,
  isExpanded,
  isKeyVisible,
  onToggle,
  onToggleKey,
  onRemove,
  onUpdate,
  onAddModel,
  onRemoveModel,
}: ProviderCardProps) {
  const [isAddingModels, setIsAddingModels] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const catalogKey = resolveModelListKey(name, provider);
  const catalog = catalogKey ? (PROVIDER_MODELS[catalogKey] ?? []) : [];
  const existingModelIds = new Set((provider.models ?? []).map((m) => m.id));
  const availableCatalog = catalog.filter((m) => !existingModelIds.has(m.id));
  const needsModels = APIS_REQUIRING_MODELS.has(provider.api);
  const missingModels = needsModels && (!provider.models || provider.models.length === 0);

  function handleAddModel(model: OpenclawModelEntry) {
    onAddModel(model);
  }

  function handleAddCustomModel() {
    if (!newModelId.trim()) return;
    handleAddModel({
      id: newModelId.trim(),
      name: newModelName.trim() || newModelId.trim(),
    } as OpenclawModelEntry);
    setNewModelId('');
    setNewModelName('');
  }

  function openAddPanel() {
    setIsAddingModels(true);
    setNewModelId('');
    setNewModelName('');
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition select-none"
      >
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${missingModels ? 'bg-amber-500' : 'bg-emerald-500'}`}
        />
        <span className="flex-1 text-sm font-semibold font-mono">{name}</span>

        {Array.isArray(provider.models) && provider.models.length > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700 mr-1"
          >
            {provider.models.length} 模型
          </Badge>
        )}
        {missingModels && (
          <Badge
            variant="outline"
            className="text-[10px] text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 mr-1"
          >
            缺少模型
          </Badge>
        )}

        <span className="text-[11px] text-muted-foreground font-mono mr-1">{provider.api}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* ── Expanded content ────────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/10">
          {/* Base URL + API type */}
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Base URL">
              <Input
                value={provider.baseUrl}
                onChange={(e) => onUpdate({ baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="font-mono"
              />
            </FieldGroup>
            <FieldGroup label="API 类型">
              <Select value={provider.api} onValueChange={(v) => onUpdate({ api: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {API_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldGroup>
          </div>

          {/* API Key */}
          <FieldGroup label="API Key">
            <div className="relative">
              <Input
                type={isKeyVisible ? 'text' : 'password'}
                value={provider.apiKey}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="font-mono pr-9"
              />
              <button
                onClick={onToggleKey}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
              >
                {isKeyVisible ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </FieldGroup>

          {/* Auth Header */}
          <div className="flex items-center justify-between py-0.5">
            <div>
              <p className="text-sm font-medium">Auth Header</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                通过 Authorization 请求头传递 API Key
              </p>
            </div>
            <Switch
              checked={!!provider.authHeader}
              onCheckedChange={(v) => onUpdate({ authHeader: v })}
            />
          </div>

          {/* ── Models ────────────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Label>模型列表 (models)</Label>
                {missingModels && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-500">
                    <AlertCircle className="w-3 h-3" />
                    网关需要至少一个模型
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (isAddingModels ? setIsAddingModels(false) : openAddPanel())}
                className="gap-1 text-xs h-7 px-2 text-primary hover:text-primary/80"
              >
                {isAddingModels ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {isAddingModels ? '取消' : '添加'}
              </Button>
            </div>

            {/* Current models list */}
            {provider.models && provider.models.length > 0 && (
              <div className="space-y-1 mb-2">
                {provider.models.map((m) => (
                  <div
                    key={m.id}
                    className="group flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/30 border border-border"
                  >
                    <code className="text-xs font-mono flex-1 truncate text-foreground/80">
                      {m.id}
                    </code>
                    {m.name && m.name !== m.id && (
                      <span className="text-[11px] text-muted-foreground shrink-0">{m.name}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemoveModel(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-5 w-5 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state prompt for required APIs */}
            {missingModels && !isAddingModels && (
              <button
                onClick={openAddPanel}
                className="w-full text-center py-2 text-[11px] text-amber-500/80 border border-dashed border-amber-500/30 rounded-lg hover:border-amber-500/60 hover:bg-amber-500/5 transition-all"
              >
                缺少模型 — 点击添加（网关启动必须）
              </button>
            )}

            {/* Add model panel */}
            {isAddingModels && (
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-2.5">
                {availableCatalog.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5">
                      从目录选择（点击即添加）
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {availableCatalog.map((m) => (
                        <button
                          key={m.id}
                          onClick={() =>
                            handleAddModel({ id: m.id, name: m.name } as OpenclawModelEntry)
                          }
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-primary/5 text-left transition-all"
                        >
                          <Plus className="w-3 h-3 text-primary/60 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-mono truncate">{m.id}</p>
                            {m.desc && (
                              <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  {availableCatalog.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mb-1.5">或自定义模型 ID</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newModelId}
                      onChange={(e) => setNewModelId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newModelId.trim()) handleAddCustomModel();
                      }}
                      placeholder="模型 ID（如 deepseek-chat）"
                      className="flex-1 font-mono text-xs h-8"
                    />
                    <Input
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      placeholder="显示名称（可选）"
                      className="w-32 text-xs h-8"
                    />
                    <Button
                      size="icon-sm"
                      onClick={handleAddCustomModel}
                      disabled={!newModelId.trim()}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
