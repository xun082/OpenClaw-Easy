'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useConfigStore } from '@/store/config-store';

type GatewayStatus = 'checking' | 'up' | 'down';

const isElectron = () =>
  typeof window !== 'undefined' && typeof window.api?.executeCommand === 'function';

export function GatewayStatusBanner() {
  const port = useConfigStore((s) => s.config?.gateway?.port ?? 18789);
  const [status, setStatus] = useState<GatewayStatus>('checking');
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState('');

  const check = useCallback(async () => {
    if (!isElectron()) return;
    setStatus('checking');

    // nc -z: zero-I/O mode (port scan), -w 2: 2s timeout
    const res = await window.api.executeCommand(
      `nc -z -w 2 127.0.0.1 ${port} 2>/dev/null && echo "__UP__" || echo "__DOWN__"`,
    );
    setStatus((res.output ?? '').includes('__UP__') ? 'up' : 'down');
  }, [port]);

  useEffect(() => {
    void check();
  }, [check]);

  const handleRestart = async () => {
    setRestarting(true);
    setRestartMsg('');

    const res = await window.api.restartGateway();
    const msg = (res.output ?? '').trim();
    setRestartMsg(
      msg || (res.success ? '网关已重启' : '重启失败，请在终端手动运行 openclaw gateway start'),
    );
    // Recheck after a short delay to let the gateway come up
    setTimeout(async () => {
      await check();
      setRestarting(false);
    }, 3000);
  };

  // Don't render when up
  if (status === 'up') return null;

  if (status === 'checking') {
    return (
      <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">正在检测网关状态…</span>
      </div>
    );
  }

  // down
  return (
    <div className="mx-5 mt-3 rounded-xl border border-destructive/40 bg-destructive/5 dark:bg-destructive/10 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-destructive">网关未运行（端口 {port} 无响应）</p>
          <p className="text-[11px] text-destructive/70 mt-0.5">
            路由绑定和 Agent 协作功能需要 OpenClaw Gateway 正常运行。
            请点击「重启网关」，或在终端运行{' '}
            <code className="font-mono bg-destructive/10 px-1 rounded">openclaw gateway start</code>
          </p>
        </div>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void handleRestart()}
          disabled={restarting}
          className="gap-1.5 shrink-0"
        >
          {restarting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {restarting ? '重启中…' : '重启网关'}
        </Button>
      </div>

      {/* Restart log */}
      {restartMsg && (
        <div className="border-t border-destructive/20 px-4 py-2 bg-black/5 dark:bg-black/20">
          <div className="flex items-start gap-2">
            {restartMsg.includes('失败') || restartMsg.includes('error') ? (
              <AlertCircle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
            )}
            <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre-wrap break-all leading-relaxed">
              {restartMsg}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
