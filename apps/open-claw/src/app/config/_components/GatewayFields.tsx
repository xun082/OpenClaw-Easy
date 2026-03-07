'use client';

import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import type { OpenclawConfig } from '@/store/config-store';

import { FieldGroup } from './FieldGroup';
import { SegmentedControl } from './SegmentedControl';

// ─── Props ────────────────────────────────────────────────────────────────────

interface GatewayFieldsProps {
  gw: OpenclawConfig['gateway'];
  showGatewayToken: boolean;
  showGatewayPassword: boolean;
  setShowGatewayToken: (fn: (p: boolean) => boolean) => void;
  setShowGatewayPassword: (fn: (p: boolean) => boolean) => void;
  setGatewayPort: (port: number) => void;
  setGatewayAuthMode: (mode: 'none' | 'token' | 'password' | 'trusted-proxy') => void;
  setGatewayAuthToken: (token: string) => void;
  setGatewayAuthPassword: (password: string) => void;
  setGatewayReloadMode: (mode: 'hybrid' | 'off') => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GatewayFields({
  gw,
  showGatewayToken,
  showGatewayPassword,
  setShowGatewayToken,
  setShowGatewayPassword,
  setGatewayPort,
  setGatewayAuthMode,
  setGatewayAuthToken,
  setGatewayAuthPassword,
  setGatewayReloadMode,
}: GatewayFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="端口 (port)" hint="也可通过 OPENCLAW_GATEWAY_PORT 覆盖">
          <Input
            type="number"
            value={gw?.port ?? 18789}
            onChange={(e) => setGatewayPort(Number(e.target.value))}
            placeholder="18789"
          />
        </FieldGroup>
        <FieldGroup
          label="热重载模式 (reload.mode)"
          hint="hybrid：安全变更热应用，关键变更时重启；off：禁用"
        >
          <SegmentedControl
            value={gw?.reload?.mode ?? 'hybrid'}
            options={[
              { value: 'hybrid', label: '混合热重载' },
              { value: 'off', label: '禁用' },
            ]}
            onChange={(v) => setGatewayReloadMode(v as 'hybrid' | 'off')}
          />
        </FieldGroup>
      </div>

      <FieldGroup
        label="认证模式 (auth.mode)"
        hint="本地使用推荐「无认证」；对外暴露时选 Token 或 Password"
      >
        <SegmentedControl
          value={gw?.auth?.mode ?? 'none'}
          options={[
            { value: 'none', label: '无认证' },
            { value: 'token', label: 'Token' },
            { value: 'password', label: 'Password' },
            { value: 'trusted-proxy', label: 'Trusted Proxy' },
          ]}
          onChange={(v) =>
            setGatewayAuthMode(v as 'none' | 'token' | 'password' | 'trusted-proxy')
          }
        />
      </FieldGroup>

      {gw?.auth?.mode === 'token' && (
        <FieldGroup label="认证令牌 (auth.token)" hint="或设置 OPENCLAW_GATEWAY_TOKEN 环境变量">
          <div className="relative">
            <Input
              type={showGatewayToken ? 'text' : 'password'}
              value={gw?.auth?.token ?? ''}
              onChange={(e) => setGatewayAuthToken(e.target.value)}
              placeholder="向导自动生成或手动填写"
              className="pr-9 font-mono"
            />
            <button
              onClick={() => setShowGatewayToken((p) => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
            >
              {showGatewayToken ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </FieldGroup>
      )}

      {gw?.auth?.mode === 'password' && (
        <FieldGroup
          label="认证密码 (auth.password)"
          hint="客户端 connect.params.auth.password 中携带"
        >
          <div className="relative">
            <Input
              type={showGatewayPassword ? 'text' : 'password'}
              value={gw?.auth?.password ?? ''}
              onChange={(e) => setGatewayAuthPassword(e.target.value)}
              placeholder="客户端连接时携带"
              className="pr-9 font-mono"
            />
            <button
              onClick={() => setShowGatewayPassword((p) => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
            >
              {showGatewayPassword ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </FieldGroup>
      )}
    </div>
  );
}
