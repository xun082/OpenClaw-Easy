'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProviderConfig, ProviderPreset } from '@/lib/openclaw-providers';
import { PROVIDER_PRESETS } from '@/lib/openclaw-providers';
import { cn } from '@/lib/utils';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProviderPickerProps {
  existingProviders: Record<string, ProviderConfig>;
  onAddFromPreset: (preset: ProviderPreset) => void;
  onAddCustom: (name: string) => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProviderPicker({
  existingProviders,
  onAddFromPreset,
  onAddCustom,
  onClose,
}: ProviderPickerProps) {
  const [customName, setCustomName] = useState('');

  function handleAddCustom() {
    const n = customName.trim();
    if (!n) return;
    onAddCustom(n);
    setCustomName('');
  }

  return (
    <div className="mb-3 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <p className="text-xs font-semibold">选择提供商模板</p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onClose();
            setCustomName('');
          }}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Preset grid */}
      <div className="p-3 grid grid-cols-3 gap-2">
        {PROVIDER_PRESETS.map((preset) => {
          const already = !!existingProviders[preset.id];

          return (
            <button
              key={preset.id}
              onClick={() => !already && onAddFromPreset(preset)}
              disabled={already}
              className={cn(
                'flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all',
                already
                  ? 'border-border bg-muted/30 opacity-50 cursor-not-allowed'
                  : 'border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer',
              )}
            >
              <div
                className="w-6 h-6 rounded-md shrink-0 mt-0.5 flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: preset.color }}
              >
                {preset.name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">{preset.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                  {preset.description}
                </p>
                {already && <p className="text-[10px] text-emerald-500 mt-0.5">已添加</p>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom name input */}
      <div className="px-3 pb-3 pt-2 flex items-center gap-2 border-t border-border">
        <Input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddCustom();

            if (e.key === 'Escape') {
              onClose();
              setCustomName('');
            }
          }}
          placeholder="自定义名称（如 my-proxy）"
          className="flex-1 font-mono text-xs h-8"
        />
        <Button size="sm" onClick={handleAddCustom} disabled={!customName.trim()}>
          添加自定义
        </Button>
      </div>
    </div>
  );
}
