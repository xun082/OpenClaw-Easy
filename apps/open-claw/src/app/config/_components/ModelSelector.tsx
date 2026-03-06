'use client';

import { useMemo, useCallback } from 'react';
import { AlertCircle, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PROVIDER_MODELS, resolveModelListKey } from '@/lib/openclaw-providers';
import type { ModelOption, ProviderConfig } from '@/lib/openclaw-providers';
import { autoSelectModel } from '@/store/config-store';
import { cn } from '@/lib/utils';

interface ModelSelectorProps {
  value: string;
  providers: Record<string, ProviderConfig>;
  /** Keys from agents.defaults.models, e.g. ["kimi-coding/k2p5"] — used to derive virtual providers */
  aliasKeys?: string[];
  onChange: (v: string) => void;
}

export function ModelSelector({ value, providers, aliasKeys = [], onChange }: ModelSelectorProps) {
  const providerKeys = Object.keys(providers);

  // Derive virtual providers from alias keys + current value.
  // e.g. "kimi-coding/k2p5" → virtual provider "kimi-coding" (env-var based, has model catalog)
  const virtualProviderKeys = useMemo(() => {
    const seen = new Set<string>();
    for (const ak of [...aliasKeys, value]) {
      const slash = ak.indexOf('/');
      if (slash > 0) {
        const pName = ak.slice(0, slash);
        if (!providerKeys.includes(pName) && PROVIDER_MODELS[pName]) seen.add(pName);
      }
    }
    return [...seen];
  }, [aliasKeys, providerKeys, value]);

  const allProviderKeys = [...providerKeys, ...virtualProviderKeys];

  const slashIdx = value.indexOf('/');
  const selectedProvider = slashIdx >= 0 ? value.slice(0, slashIdx) : value;
  const selectedModel = slashIdx >= 0 ? value.slice(slashIdx + 1) : '';

  const getModels = useCallback(
    (key: string): ModelOption[] => {
      const prov = providers[key];
      if (prov) {
        const listKey = resolveModelListKey(key, prov);
        return listKey ? (PROVIDER_MODELS[listKey] ?? []) : [];
      }
      // Virtual provider — use catalog directly
      return PROVIDER_MODELS[key] ?? [];
    },
    [providers],
  );

  const models = selectedProvider ? getModels(selectedProvider) : [];
  const modelInList = models.some((m) => m.id === selectedModel);
  const isVirtual = virtualProviderKeys.includes(selectedProvider);

  if (allProviderKeys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-1">
        请先在上方「模型提供商」中添加提供商
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Provider selector */}
        <Select
          value={selectedProvider || '__none__'}
          onValueChange={(p) => {
            if (p === '__none__') {
              onChange('');
              return;
            }
            if (providers[p]) {
              onChange(autoSelectModel(p, providers));
            } else {
              // Virtual provider — auto-select first catalog model
              const catalog = PROVIDER_MODELS[p] ?? [];
              onChange(catalog.length > 0 ? `${p}/${catalog[0].id}` : `${p}/`);
            }
          }}
        >
          <SelectTrigger className="w-44 shrink-0 font-mono text-xs">
            <SelectValue placeholder="选择提供商…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">选择提供商…</SelectItem>
            {providerKeys.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
            {virtualProviderKeys.map((k) => (
              <SelectItem key={k} value={k}>
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-sky-500" />
                  {k}
                  <span className="text-[10px] text-sky-500">(env)</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedProvider && (
          <>
            <span className="text-muted-foreground font-mono shrink-0 text-sm">/</span>
            {models.length > 0 ? (
              <Select
                value={modelInList ? selectedModel : selectedModel ? '__custom__' : '__none__'}
                onValueChange={(v) => {
                  if (v && v !== '__custom__' && v !== '__none__')
                    onChange(`${selectedProvider}/${v}`);
                }}
              >
                <SelectTrigger className={cn('flex-1', !selectedModel && 'border-amber-400/60')}>
                  <SelectValue placeholder="— 请选择模型 —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— 请选择模型 —</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      {m.desc ? ` — ${m.desc}` : ''}
                    </SelectItem>
                  ))}
                  {!modelInList && selectedModel && (
                    <SelectItem value="__custom__">{selectedModel}（自定义）</SelectItem>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={selectedModel}
                onChange={(e) => onChange(`${selectedProvider}/${e.target.value}`)}
                placeholder="model-id（如 deepseek-chat）"
                className={cn('flex-1 font-mono', !selectedModel && 'border-amber-400/60')}
              />
            )}
          </>
        )}

        {value && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange('')}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            title="清除此字段"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Status hints */}
      <div className="flex items-center gap-2 flex-wrap">
        {value && value.includes('/') && value.split('/')[1] ? (
          <code className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            ✓ {value}
          </code>
        ) : value ? (
          <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3 shrink-0" />
            请选择模型（格式：<code className="font-mono">提供商/模型ID</code>）
          </span>
        ) : null}
        {isVirtual && selectedProvider && value && (
          <span className="text-[10px] text-sky-500">通过环境变量接入，无需在提供商列表中配置</span>
        )}
        {!isVirtual && selectedProvider && value && !providerKeys.includes(selectedProvider) && (
          <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3 shrink-0" />
            提供商未配置
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        格式 <code className="font-mono">提供商/模型ID</code>
        ；留空或清除表示不设置默认模型
      </p>
    </div>
  );
}
