'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import StepCard, { type StepStatus } from './StepCard';
import TerminalOutput from './TerminalOutput';
import type { InstallLogEvent } from '@/electron';

interface StepState<T = Record<string, never>> {
  status: StepStatus;
  data?: T;
}

interface WizardState {
  nodeCheck: StepState<{ version: string; nodePath: string }>;
  nodeInstall: StepState<{ nodePath: string }>;
  openclawInstall: StepState<{ version?: string }>;
  logs: InstallLogEvent[];
  phase: 'checking' | 'ready' | 'installing' | 'done' | 'error';
  needsNode: boolean;
  isElectron: boolean;
}

const isElectronEnv = () =>
  typeof window !== 'undefined' && typeof window.api?.checkSystemNode === 'function';

const makeLog = (type: InstallLogEvent['type'], message: string): InstallLogEvent => ({
  type,
  message,
  timestamp: Date.now(),
});

export default function InstallWizard() {
  const [state, setState] = useState<WizardState>({
    nodeCheck: { status: 'idle' },
    nodeInstall: { status: 'idle' },
    openclawInstall: { status: 'idle' },
    logs: [],
    phase: 'checking',
    needsNode: false,
    isElectron: false,
  });

  const unsubRef = useRef<(() => void) | null>(null);

  const pushLog = useCallback((entry: InstallLogEvent) => {
    setState((prev) => ({ ...prev, logs: [...prev.logs, entry] }));
  }, []);

  useEffect(() => {
    const el = isElectronEnv();
    if (!el) {
      setState((prev) => ({ ...prev, isElectron: false, phase: 'ready' }));

      return;
    }
    setState((prev) => ({ ...prev, isElectron: true }));
    runNodeCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runNodeCheck = async () => {
    setState((prev) => ({ ...prev, nodeCheck: { status: 'running' }, phase: 'checking' }));

    try {
      const res = await window.api.checkSystemNode();

      if (res.found && res.version && res.nodePath) {
        setState((prev) => ({
          ...prev,
          nodeCheck: {
            status: 'success',
            data: { version: res.version!, nodePath: res.nodePath! },
          },
          nodeInstall: { status: 'skipped' },
          needsNode: false,
          phase: 'checking',
        }));

        const ocRes = await window.api.checkOpenclaw();

        if (ocRes.found) {
          setState((prev) => ({
            ...prev,
            openclawInstall: { status: 'success', data: { version: ocRes.version } },
            phase: 'done',
          }));
        } else {
          setState((prev) => ({ ...prev, phase: 'ready' }));
        }
      } else {
        setState((prev) => ({
          ...prev,
          nodeCheck: { status: 'error' },
          needsNode: true,
          phase: 'ready',
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        nodeCheck: { status: 'error' },
        needsNode: true,
        phase: 'ready',
      }));
    }
  };

  const startInstall = async () => {
    setState((prev) => ({ ...prev, phase: 'installing', logs: [] }));

    if (unsubRef.current) unsubRef.current();
    unsubRef.current = window.api.onInstallLog(pushLog);

    try {
      if (state.needsNode) {
        setState((prev) => ({ ...prev, nodeInstall: { status: 'running' } }));
        pushLog(makeLog('info', '— 步骤 1/2: 安装 Node.js LTS —'));

        const res = await window.api.installNodeLts();

        if (!res.success) {
          setState((prev) => ({ ...prev, nodeInstall: { status: 'error' }, phase: 'error' }));

          return;
        }

        setState((prev) => ({
          ...prev,
          nodeInstall: { status: 'success', data: { nodePath: res.nodePath ?? '' } },
          nodeCheck: {
            status: 'success',
            data: { version: 'LTS', nodePath: res.nodePath ?? '' },
          },
        }));
        pushLog(makeLog('info', ''));
      }

      setState((prev) => ({ ...prev, openclawInstall: { status: 'running' } }));
      pushLog(makeLog('info', `— 步骤 ${state.needsNode ? '2/2' : '1/1'}: 安装 OpenClaw —`));

      const ocRes = await window.api.installOpenclaw();

      if (!ocRes.success) {
        setState((prev) => ({ ...prev, openclawInstall: { status: 'error' }, phase: 'error' }));

        return;
      }

      setState((prev) => ({
        ...prev,
        openclawInstall: { status: 'success', data: { version: ocRes.version } },
        phase: 'done',
      }));
      pushLog(makeLog('info', ''));
      pushLog(makeLog('info', '🎉 全部安装完成！'));
    } finally {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    }
  };

  const { phase, needsNode, isElectron } = state;
  const isChecking = phase === 'checking';
  const isInstalling = phase === 'installing';
  const isDone = phase === 'done';
  const hasError = phase === 'error';
  const canInstall = phase === 'ready' || phase === 'error';
  const stepOffset = needsNode ? 1 : 0;

  const nodeCheckDesc = (() => {
    if (state.nodeCheck.status === 'running') return '正在检测系统 Node.js...';
    if (state.nodeCheck.status === 'success' && state.nodeCheck.data)
      return `${state.nodeCheck.data.version}  ·  ${state.nodeCheck.data.nodePath}`;
    if (state.nodeCheck.status === 'error') return '未检测到 Node.js，将自动安装 LTS 版本';

    return '等待检测...';
  })();

  const nodeInstallDesc = (() => {
    if (state.nodeInstall.status === 'running') return '正在下载并安装 Node.js LTS，请耐心等待...';
    if (state.nodeInstall.status === 'success') return 'Node.js LTS 安装成功';
    if (state.nodeInstall.status === 'error') return '安装失败，请查看日志';

    return '等待安装...';
  })();

  const openclawDesc = (() => {
    if (state.openclawInstall.status === 'running') return '正在安装 openclaw@latest...';
    if (state.openclawInstall.status === 'success')
      return `OpenClaw ${state.openclawInstall.data?.version ?? ''} 安装成功 🎉`;
    if (state.openclawInstall.status === 'error') return '安装失败，请检查日志';

    return 'openclaw@latest';
  })();

  return (
    <div className="px-8 py-8 max-w-xl">
      {/* Page title */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">安装向导</h1>
          {isChecking && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              检测中...
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          自动检测运行环境，按需安装 Node.js，并全局安装最新版 OpenClaw。
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-2.5 mb-7">
        <StepCard
          step={1}
          title="检测 Node.js"
          status={state.nodeCheck.status}
          description={nodeCheckDesc}
        />

        {needsNode && (
          <StepCard
            step={2}
            title="安装 Node.js LTS"
            status={state.nodeInstall.status}
            description={nodeInstallDesc}
            badge={state.nodeInstall.status === 'idle' ? '自动' : undefined}
          />
        )}

        <StepCard
          step={2 + stepOffset}
          title="安装 OpenClaw"
          status={state.openclawInstall.status}
          description={openclawDesc}
          badge={
            state.openclawInstall.status === 'idle'
              ? 'npm install -g openclaw@latest'
              : undefined
          }
        />
      </div>

      {/* Terminal output */}
      {state.logs.length > 0 && (
        <div className="mb-7">
          <TerminalOutput logs={state.logs} />
        </div>
      )}

      {/* Action area */}
      {!isElectron ? (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50 px-4 py-3.5">
          <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            请在 Electron 客户端中运行此页面以使用安装功能。
          </p>
          <p className="text-xs text-amber-600/70 dark:text-amber-500/60 mt-1">
            当前在浏览器中运行，无法访问系统命令。
          </p>
        </div>
      ) : isDone ? (
        <div className="rounded-xl border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/50 px-4 py-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                OpenClaw 已就绪！
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mt-1 leading-relaxed">
                在终端中运行以下命令来完成配置：
              </p>
              <code className="mt-2 block text-xs bg-emerald-900/10 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 px-3 py-2 rounded-lg font-mono border border-emerald-200/50 dark:border-emerald-800/40">
                openclaw onboard --install-daemon
              </code>
              <a
                href="https://docs.openclaw.ai/zh-CN"
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 inline-flex items-center gap-1 text-xs text-emerald-700/80 dark:text-emerald-400/80 hover:underline"
              >
                查看文档
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      ) : hasError ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-red-300/50 bg-red-50 dark:bg-red-950/20 dark:border-red-800/50 px-4 py-3.5">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">安装过程中出现错误</p>
            <p className="text-xs text-red-600/70 dark:text-red-500/70 mt-1">
              请查看上方日志了解详情，修复后可点击重试。
            </p>
          </div>
          <button
            onClick={startInstall}
            className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
              hover:opacity-90 active:scale-[0.98] transition-all duration-150
              flex items-center justify-center gap-2 shadow-sm shadow-primary/20"
          >
            <RefreshCw className="w-4 h-4" />
            重试安装
          </button>
        </div>
      ) : (
        <button
          onClick={startInstall}
          disabled={!canInstall || isInstalling || isChecking}
          className="w-full py-3.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
            hover:opacity-90 active:scale-[0.98] transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2 shadow-sm shadow-primary/20"
        >
          {isInstalling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              正在安装...
            </>
          ) : isChecking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              正在检测环境...
            </>
          ) : (
            '一键安装 OpenClaw'
          )}
        </button>
      )}
    </div>
  );
}
