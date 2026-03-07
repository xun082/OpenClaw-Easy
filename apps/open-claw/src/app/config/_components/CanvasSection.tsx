'use client';

import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import type { OpenclawConfig } from '@/store/config-store';

import { FieldGroup } from './FieldGroup';
import { FormSection } from './FormSection';

// ─── Props ────────────────────────────────────────────────────────────────────

interface CanvasSectionProps {
  canvasHost: OpenclawConfig['canvasHost'];
  setCanvasEnabled: (enabled: boolean) => void;
  setCanvasPort: (port: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CanvasSection({ canvasHost, setCanvasEnabled, setCanvasPort }: CanvasSectionProps) {
  return (
    <FormSection
      title="Canvas 服务 (canvasHost)"
      description="为 ~/.openclaw/workspace/canvas 提供 HTTP 文件服务，默认端口 gateway.port + 4"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between py-0.5">
          <div>
            <p className="text-sm font-medium">启用 Canvas 服务</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              可设置 OPENCLAW_SKIP_CANVAS_HOST=1 全局禁用
            </p>
          </div>
          <Switch
            checked={canvasHost?.enabled !== false}
            onCheckedChange={setCanvasEnabled}
          />
        </div>
        {canvasHost?.enabled !== false && (
          <FieldGroup
            label="端口 (port)"
            hint={`访问路径：http://127.0.0.1:${canvasHost?.port ?? 18793}/__openclaw__/canvas/`}
          >
            <Input
              type="number"
              value={canvasHost?.port ?? 18793}
              onChange={(e) => setCanvasPort(Number(e.target.value))}
              placeholder="18793"
            />
          </FieldGroup>
        )}
      </div>
    </FormSection>
  );
}
