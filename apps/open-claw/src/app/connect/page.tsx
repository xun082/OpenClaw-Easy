'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Trash2,
  RefreshCw,
  Terminal,
  AlertTriangle,
  ArrowRight,
  Settings,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemStatus =
  | 'idle'
  | 'checking'
  | 'found'
  | 'not-found'
  | 'installing'
  | 'uninstalling'
  | 'error';

interface ItemState {
  status: ItemStatus;
  version?: string;
  error?: string;
}

interface LogEntry {
  type: 'info' | 'stdout' | 'stderr' | 'error';
  message: string;
}

const LOG_COLORS: Record<LogEntry['type'], string> = {
  info: 'text-sky-400',
  stdout: 'text-zinc-300',
  stderr: 'text-amber-400',
  error: 'text-red-400',
};

// ── Small components ──────────────────────────────────────────────────────────

function LogPanel({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="w-3.5 h-3.5" />
          <span>输出日志</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          清空
        </button>
      </div>
      <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs leading-relaxed space-y-0.5">
        {logs.map((l, i) => (
          <div key={i} className={LOG_COLORS[l.type]}>
            {l.message}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'checking':
    case 'installing':
    case 'uninstalling':
      return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
    case 'found':
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case 'not-found':
      return <XCircle className="w-5 h-5 text-muted-foreground/40" />;
    case 'error':
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    default:
      return <div className="w-5 h-5 rounded-full border-2 border-border" />;
  }
}

interface ToolCardProps {
  step: number;
  title: string;
  subtitle: string;
  state: ItemState;
  disabled: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onRecheck: () => void;
}

function ToolCard({
  step,
  title,
  subtitle,
  state,
  disabled,
  onInstall,
  onUninstall,
  onRecheck,
}: ToolCardProps) {
  const { status, version, error } = state;
  const isNotFound = status === 'not-found';
  const isError = status === 'error';
  const isBusy = status === 'installing' || status === 'uninstalling' || status === 'checking';

  const borderColor =
    status === 'found'
      ? 'border-emerald-500/40 bg-emerald-500/5'
      : isNotFound || isError
        ? 'border-border bg-muted/30'
        : 'border-border bg-card';

  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-4 transition-colors ${borderColor}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              status === 'found' ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            {step}
          </div>
          <div>
            <div className="font-semibold text-sm text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
          </div>
        </div>
        <StatusIcon status={status} />
      </div>

      {version && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-mono">
          <CheckCircle2 className="w-3 h-3" />
          {version}
        </div>
      )}

      {error && (
        <div className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {status === 'idle' && (
        <p className="text-xs text-muted-foreground">点击检查按钮以检测安装状态</p>
      )}
      {status === 'checking' && (
        <p className="text-xs text-muted-foreground animate-pulse">正在检测...</p>
      )}
      {status === 'installing' && (
        <p className="text-xs text-muted-foreground animate-pulse">安装中，请稍候...</p>
      )}
      {status === 'uninstalling' && (
        <p className="text-xs text-muted-foreground animate-pulse">卸载中，请稍候...</p>
      )}

      <div className="flex gap-2 mt-auto">
        {(isNotFound || isError) && (
          <button
            onClick={onInstall}
            disabled={disabled || isBusy}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            {isError ? '重试安装' : '立即安装'}
          </button>
        )}

        {(status === 'found' || status === 'uninstalling') && (
          <button
            onClick={onUninstall}
            disabled={isBusy}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === 'uninstalling' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {status === 'uninstalling' ? '卸载中...' : '卸载'}
          </button>
        )}

        <button
          onClick={onRecheck}
          disabled={isBusy}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
          重新检测
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InstallPage() {
  const router = useRouter();
  const [node, setNode] = useState<ItemState>({ status: 'idle' });
  const [openclaw, setOpenclaw] = useState<ItemState>({ status: 'idle' });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isElectron, setIsElectron] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const envUnsubRef = useRef<(() => void) | null>(null);

  const pushLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  const checkNode = useCallback(async () => {
    if (!window.api) return;
    setNode({ status: 'checking' });

    try {
      const res = await window.api.checkSystemNode();

      if (res.found) {
        setNode({ status: 'found', version: res.version });
      } else {
        setNode({ status: 'not-found' });
      }
    } catch {
      setNode({ status: 'error', error: '检测失败' });
    }
  }, []);

  const checkOpenclaw = useCallback(async () => {
    if (!window.api) return;
    setOpenclaw({ status: 'checking' });

    try {
      const res = await window.api.checkOpenclaw();

      if (res.found) {
        setOpenclaw({ status: 'found', version: res.version });
      } else {
        setOpenclaw({ status: 'not-found' });
      }
    } catch {
      setOpenclaw({ status: 'error', error: '检测失败' });
    }
  }, []);

  useEffect(() => {
    const electron = typeof window.api !== 'undefined';
    setIsElectron(electron);

    if (electron) {
      checkNode().then(() => checkOpenclaw());
    }
  }, [checkNode, checkOpenclaw]);

  const handleInstallNode = async () => {
    if (!window.api) return;
    setNode({ status: 'installing' });
    setLogs([]);
    unsubRef.current?.();
    unsubRef.current = window.api.onInstallLog((d) =>
      pushLog({ type: d.type, message: d.message }),
    );

    try {
      const res = await window.api.installNodeLts();

      if (res.success) {
        await checkNode();
        await checkOpenclaw();
      } else {
        setNode({ status: 'error', error: '安装失败，请查看日志' });
      }
    } catch (e: unknown) {
      setNode({ status: 'error', error: e instanceof Error ? e.message : '安装出错' });
    } finally {
      unsubRef.current?.();
      unsubRef.current = null;
    }
  };

  const handleInstallOpenclaw = async () => {
    if (!window.api) return;
    setOpenclaw({ status: 'installing' });
    setLogs([]);
    unsubRef.current?.();
    unsubRef.current = window.api.onInstallLog((d) =>
      pushLog({ type: d.type, message: d.message }),
    );

    try {
      const res = await window.api.installOpenclaw();

      if (res.success) {
        await checkOpenclaw();

        // ── Step A: create default config if missing ──────────────────────────
        pushLog({ type: 'info', message: '正在检查配置文件…' });

        try {
          const check = await window.api.checkOpenclawConfigExists();

          if (!check.exists) {
            const defaultConfig = JSON.stringify(
              {
                gateway: { mode: 'local', port: 18789, reload: { mode: 'hybrid' } },
                canvasHost: { enabled: true, port: 18793 },
                models: { mode: 'merge', providers: {} },
                agents: { defaults: { workspace: '', contextPruning: { mode: 'off' } } },
                channels: {
                  whatsapp: {
                    groupPolicy: 'open',
                    allowFrom: [],
                    groups: { '*': { requireMention: true } },
                  },
                },
                messages: { groupChat: { mentionPatterns: ['@openclaw'] } },
                env: {},
              },
              null,
              2,
            );
            const write = await window.api.writeOpenclawConfig(defaultConfig);

            if (write.success) {
              pushLog({ type: 'info', message: '✓ 默认配置文件已创建' });
            } else {
              pushLog({ type: 'stderr', message: `写入配置失败：${write.error ?? ''}` });
            }
          } else {
            pushLog({ type: 'info', message: '✓ 配置文件已存在，跳过初始化' });
          }
        } catch (initErr: unknown) {
          pushLog({
            type: 'stderr',
            message: `配置初始化跳过：${initErr instanceof Error ? initErr.message : String(initErr)}`,
          });
        }

        // ── Step B: install gateway LaunchAgent (idempotent) ──────────────────
        pushLog({ type: 'info', message: '正在注册 Gateway 服务…' });

        try {
          const installRes = await window.api.executeCommand(
            '/bin/zsh -l -c "openclaw gateway install 2>&1"',
          );
          const installOut = (installRes.output ?? '').trim();

          if (installOut) pushLog({ type: 'stdout', message: installOut });
          pushLog({
            type: 'info',
            message: installRes.success
              ? '✓ Gateway 服务已注册'
              : '⚠ gateway install 返回非零，将尝试直接启动',
          });
        } catch (installErr: unknown) {
          pushLog({
            type: 'stderr',
            message: `gateway install 跳过：${installErr instanceof Error ? installErr.message : String(installErr)}`,
          });
        }

        // ── Step C: start the gateway ─────────────────────────────────────────
        pushLog({ type: 'info', message: '正在启动 Gateway…' });

        try {
          const startRes = await window.api.restartGateway();
          const startOut = (startRes.output ?? '').trim();

          pushLog({
            type: startRes.success ? 'info' : 'stderr',
            message: startRes.success
              ? `✓ ${startOut || 'Gateway 已启动'}`
              : `⚠ ${startOut || 'Gateway 启动失败，请在配置页手动点击启动'}`,
          });
        } catch (startErr: unknown) {
          pushLog({
            type: 'stderr',
            message: `Gateway 启动跳过：${startErr instanceof Error ? startErr.message : String(startErr)}`,
          });
        }

        router.push('/config');
      } else {
        setOpenclaw({ status: 'error', error: '安装失败，请查看日志' });
      }
    } catch (e: unknown) {
      setOpenclaw({ status: 'error', error: e instanceof Error ? e.message : '安装出错' });
    } finally {
      unsubRef.current?.();
      unsubRef.current = null;
    }
  };

  const handleUninstallNode = async () => {
    if (!window.api) return;
    setNode({ status: 'uninstalling' });
    setLogs([]);
    envUnsubRef.current?.();
    envUnsubRef.current = window.api.onEnvToolLog((d) =>
      pushLog({ type: d.type, message: d.message }),
    );

    try {
      const res = await window.api.uninstallEnvTool('node');

      if (res.success) {
        setNode({ status: 'not-found' });
        setOpenclaw({ status: 'idle' });
      } else {
        setNode({ status: 'error', error: '卸载失败，请查看日志' });
      }
    } catch (e: unknown) {
      setNode({ status: 'error', error: e instanceof Error ? e.message : '卸载出错' });
    } finally {
      envUnsubRef.current?.();
      envUnsubRef.current = null;
    }
  };

  const handleUninstallOpenclaw = async () => {
    if (!window.api) return;
    setOpenclaw({ status: 'uninstalling' });
    setLogs([]);
    pushLog({ type: 'info', message: '正在卸载 openclaw@latest...' });
    pushLog({ type: 'stdout', message: '$ npm uninstall -g openclaw' });

    try {
      const res = await window.api.executeCommand('npm uninstall -g openclaw');

      if (res.success) {
        pushLog({ type: 'info', message: res.output?.trim() || '✓ OpenClaw 卸载成功' });
        await checkOpenclaw();
      } else {
        pushLog({ type: 'error', message: res.error ?? '卸载失败' });
        setOpenclaw({ status: 'error', error: '卸载失败，请查看日志' });
      }
    } catch (e: unknown) {
      setOpenclaw({ status: 'error', error: e instanceof Error ? e.message : '卸载出错' });
    }
  };

  const nodeFound = node.status === 'found';
  const isComplete = nodeFound && openclaw.status === 'found';

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-[22px] font-bold tracking-tight text-foreground mb-1.5">本地安装</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          自动检测并安装 Node.js LTS 和 OpenClaw CLI，完成后可前往配置页面设置 AI 模型。
        </p>
      </div>

      {!isElectron && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            当前非 Electron 环境，安装功能不可用。请在桌面应用中使用。
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <ToolCard
          step={1}
          title="Node.js"
          subtitle="运行时环境（LTS 版本）"
          state={node}
          disabled={!isElectron}
          onInstall={handleInstallNode}
          onUninstall={handleUninstallNode}
          onRecheck={checkNode}
        />
        <ToolCard
          step={2}
          title="OpenClaw CLI"
          subtitle="openclaw@latest（全局安装）"
          state={openclaw}
          disabled={!isElectron || !nodeFound}
          onInstall={handleInstallOpenclaw}
          onUninstall={handleUninstallOpenclaw}
          onRecheck={checkOpenclaw}
        />
      </div>

      {isComplete && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <div>
              <div className="text-sm font-medium text-foreground">安装完成</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                前往配置页面设置 AI 模型和 API Key
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push('/config')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            去配置
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <LogPanel logs={logs} onClear={() => setLogs([])} />
    </div>
  );
}
