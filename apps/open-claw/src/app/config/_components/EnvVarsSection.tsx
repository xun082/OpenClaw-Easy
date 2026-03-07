'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { EmptySlot } from './EmptySlot';
import { FormSection } from './FormSection';

// ─── Props ────────────────────────────────────────────────────────────────────

interface EnvVarsSectionProps {
  entries: [string, string][];
  onSetEnvVar: (oldKey: string, newKey: string, val: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EnvVarsSection({ entries, onSetEnvVar, onAdd, onRemove }: EnvVarsSectionProps) {
  return (
    <FormSection
      title="环境变量 (env)"
      description="注入到 Gateway 网关运行环境的 KEY=VALUE 键值对"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={onAdd}
          className="gap-1 text-xs text-primary hover:text-primary/80"
        >
          <Plus className="w-3.5 h-3.5" />
          添加变量
        </Button>
      }
    >
      {entries.length === 0 ? (
        <EmptySlot message="暂无环境变量，点击右上角「添加变量」" />
      ) : (
        <div className="space-y-2">
          {entries.map(([key, value], idx) => (
            <div key={`${key}-${idx}`} className="flex items-center gap-2">
              <Input
                value={key}
                onChange={(e) => onSetEnvVar(key, e.target.value, value)}
                placeholder="KEY_NAME"
                className="flex-1 font-mono"
              />
              <span className="text-muted-foreground text-sm select-none">=</span>
              <Input
                value={value}
                onChange={(e) => onSetEnvVar(key, key, e.target.value)}
                placeholder="value"
                className="flex-1 font-mono"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove(key)}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </FormSection>
  );
}
