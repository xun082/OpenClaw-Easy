'use client';

import { ChevronRight, Plus, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ModelOption } from '@/lib/openclaw-providers';
import type { PROVIDER_PRESETS } from '@/lib/openclaw-providers';

// ─── Props ────────────────────────────────────────────────────────────────────

interface VirtualProviderCardProps {
  name: string;
  models: ModelOption[];
  isExpanded: boolean;
  preset?: (typeof PROVIDER_PRESETS)[number];
  onToggle: () => void;
  onPromoteToFormal: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VirtualProviderCard({
  name,
  models,
  isExpanded,
  preset,
  onToggle,
  onPromoteToFormal,
}: VirtualProviderCardProps) {
  return (
    <div className="rounded-xl border border-sky-200/70 dark:border-sky-800/50 bg-sky-50/40 dark:bg-sky-950/20 overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-sky-100/50 dark:hover:bg-sky-900/20 transition select-none"
      >
        <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
        <span className="flex-1 text-sm font-semibold font-mono text-foreground">{name}</span>
        <Badge
          variant="outline"
          className="text-[10px] text-sky-600 border-sky-300 dark:text-sky-400 dark:border-sky-700 mr-1"
        >
          env var
        </Badge>
        <span className="text-[11px] text-sky-500/70 font-mono mr-1">{models.length} 模型</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            if (!preset) return;
            onPromoteToFormal();
          }}
          className="text-[11px] text-sky-600 hover:text-sky-700 hover:bg-sky-100 dark:text-sky-400 dark:hover:bg-sky-900/30 h-6 px-2"
        >
          <Plus className="w-3 h-3 mr-0.5" />
          转为正式提供商
        </Button>
        {isExpanded ? (
          <ChevronRight className="w-4 h-4 text-sky-400 shrink-0 rotate-90" />
        ) : (
          <ChevronRight className="w-4 h-4 text-sky-400 shrink-0" />
        )}
      </div>
      {isExpanded && (
        <div className="border-t border-sky-200/50 dark:border-sky-800/40 px-4 py-3 space-y-3 bg-sky-50/20 dark:bg-sky-950/10">
          <p className="text-[11px] text-sky-600 dark:text-sky-400 leading-relaxed">
            此提供商通过环境变量接入（如{' '}
            <code className="font-mono bg-sky-100 dark:bg-sky-900/40 px-1 rounded">
              KIMI_API_KEY
            </code>
            ），无需在此配置 API Key，模型目录仅供参考。点击「转为正式提供商」可升级为完整配置项。
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-sky-100/50 dark:bg-sky-900/20 border border-sky-200/50 dark:border-sky-800/30"
              >
                <span className="text-[11px] font-mono text-foreground flex-1 truncate">
                  {m.id}
                </span>
                {m.desc && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{m.desc}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
