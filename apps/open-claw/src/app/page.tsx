'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RefreshCw,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';

import { EnvIntroSection } from './_components/EnvIntroSection';
import { EnvRoadmap } from './_components/EnvRoadmap';

// ── Types ──────────────────────────────────────────────────────────────────────

type ToolId = 'node' | 'python' | 'ffmpeg' | 'ytdlp';
type ToolStatus =
  | 'idle'
  | 'checking'
  | 'found'
  | 'not-found'
  | 'installing'
  | 'uninstalling'
  | 'error';

interface ToolState {
  status: ToolStatus;
  version?: string;
  error?: string;
}

interface LogEntry {
  type: 'info' | 'stdout' | 'stderr' | 'error';
  message: string;
}

const TOOLS: { id: ToolId; label: string; emoji: string; description: string }[] = [
  { id: 'node', label: 'Node.js', emoji: '🟩', description: 'JavaScript 运行时，OpenClaw 必需' },
  { id: 'python', label: 'Python', emoji: '🐍', description: 'Python 运行时，yt-dlp 等工具所需' },
  { id: 'ffmpeg', label: 'FFmpeg', emoji: '🎬', description: '音视频处理工具，视频下载/转码必备' },
  {
    id: 'ytdlp',
    label: 'yt-dlp',
    emoji: '⬇️',
    description: '视频下载工具，支持 YouTube、B站等平台',
  },
];

const LOG_COLORS: Record<LogEntry['type'], string> = {
  info: 'text-sky-400',
  stdout: 'text-zinc-300',
  stderr: 'text-amber-400',
  error: 'text-red-400',
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Page() {
  const [inElectron, setInElectron] = useState(false);
  const [tools, setTools] = useState<Record<ToolId, ToolState>>({
    node: { status: 'idle' },
    python: { status: 'idle' },
    ffmpeg: { status: 'idle' },
    ytdlp: { status: 'idle' },
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logBottomRef = useRef<HTMLDivElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Detect Electron after hydration (avoid SSR mismatch)
  useEffect(() => {
    const ok = typeof window !== 'undefined' && typeof window.api?.checkEnvTool === 'function';

    setInElectron(ok);
  }, []);

  // Auto-check when Electron is confirmed
  useEffect(() => {
    if (inElectron) checkAll();
  }, [inElectron]);

  useEffect(() => {
    if (showLogs) {
      logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  const setTool = (id: ToolId, update: Partial<ToolState>) =>
    setTools((prev) => ({ ...prev, [id]: { ...prev[id], ...update } }));

  const pushLog = (entry: LogEntry) => setLogs((prev) => [...prev, entry]);

  const checkTool = async (id: ToolId) => {
    setTool(id, { status: 'checking', version: undefined, error: undefined });

    try {
      const res = await window.api.checkEnvTool(id);

      setTool(id, { status: res.found ? 'found' : 'not-found', version: res.version });
    } catch {
      setTool(id, { status: 'error', error: '检测失败' });
    }
  };

  const checkAll = () => {
    TOOLS.forEach((t) => checkTool(t.id));
  };

  const subscribe = () => {
    unsubRef.current?.();
    unsubRef.current = window.api.onEnvToolLog((data) => {
      pushLog({ type: data.type, message: data.message });
      setShowLogs(true);
    });
  };

  const cleanup = () => {
    unsubRef.current?.();
    unsubRef.current = null;
  };

  const installTool = async (id: ToolId) => {
    setTool(id, { status: 'installing', error: undefined });
    setLogs([]);
    subscribe();

    try {
      const res = await window.api.installEnvTool(id);

      if (res.success) {
        await checkTool(id);
      } else {
        setTool(id, { status: 'error', error: '安装失败，请查看日志' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '安装出错';

      setTool(id, { status: 'error', error: msg });
    } finally {
      cleanup();
    }
  };

  const uninstallTool = async (id: ToolId) => {
    setTool(id, { status: 'uninstalling', error: undefined });
    setLogs([]);
    subscribe();

    try {
      const res = await window.api.uninstallEnvTool(id);

      if (res.success) {
        setTool(id, { status: 'not-found', version: undefined });
      } else {
        setTool(id, { status: 'error', error: '卸载失败，请查看日志' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '卸载出错';

      setTool(id, { status: 'error', error: msg });
    } finally {
      cleanup();
    }
  };

  const isOperating = Object.values(tools).some(
    (t) => t.status === 'installing' || t.status === 'uninstalling',
  );

  return (
    <div className="w-full min-h-full flex-1 flex flex-col px-6 py-6 sm:px-8 sm:py-8">
      {/* ── Header ── */}
      <div className="shrink-0 mb-7">
        <div className="flex items-center justify-between mb-1.5">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">环境配置</h1>
          <button
            onClick={checkAll}
            disabled={!inElectron || isOperating}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
              text-muted-foreground hover:text-foreground hover:bg-muted
              transition-colors disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            全部检测
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          检测并安装 Python、FFmpeg、yt-dlp，支持一键安装与卸载。
        </p>
      </div>

      {/* ── Electron guard ── */}
      {!inElectron && (
        <div
          className="mb-5 rounded-xl border border-amber-300/50 bg-amber-50
            dark:bg-amber-950/20 dark:border-amber-800/50 px-4 py-3"
        >
          <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            请在 Electron 客户端中运行此页面。
          </p>
        </div>
      )}

      {/* ── Intro ── */}
      <EnvIntroSection />

      {/* ── Tool cards ── */}
      <div className="shrink-0 space-y-3 mb-5">
        {TOOLS.map(({ id, label, emoji, description }) => {
          const tool = tools[id];
          const isChecking = tool.status === 'checking';
          const isFound = tool.status === 'found';
          const isInstalling = tool.status === 'installing';
          const isUninstalling = tool.status === 'uninstalling';
          const isActive = isInstalling || isUninstalling;
          const hasError = tool.status === 'error';
          const notFound = tool.status === 'not-found';

          let borderClass = 'border-border';

          if (isFound) borderClass = 'border-emerald-300/60 dark:border-emerald-700/40';
          else if (hasError) borderClass = 'border-red-300/60 dark:border-red-700/40';
          else if (isActive) borderClass = 'border-primary/30';

          let iconBg = 'bg-muted';

          if (isFound) iconBg = 'bg-emerald-500/10';
          else if (hasError) iconBg = 'bg-red-500/10';
          else if (isActive) iconBg = 'bg-primary/10';

          let subtext = description;

          if (isChecking) subtext = '正在检测...';
          else if (isInstalling) subtext = '正在安装，请稍候...';
          else if (isUninstalling) subtext = '正在卸载...';
          else if (isFound) subtext = `v${tool.version ?? ''}`;
          else if (hasError) subtext = tool.error ?? '发生错误';
          else if (notFound) subtext = '未安装';

          return (
            <div
              key={id}
              className={`rounded-xl border transition-all duration-200 px-4 py-3.5 ${borderClass}`}
            >
              <div className="flex items-center gap-3">
                {/* Emoji icon */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center
                    text-lg shrink-0 transition-colors ${iconBg}`}
                >
                  {emoji}
                </div>

                {/* Label + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    {isChecking && (
                      <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                    )}
                    {isFound && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {notFound && <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                    {hasError && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                    {isActive && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
                  </div>
                  <p
                    className={`text-xs mt-0.5 truncate ${
                      hasError
                        ? 'text-red-500 dark:text-red-400'
                        : isFound
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {subtext}
                  </p>
                </div>

                {/* Action buttons */}
                {inElectron && !isChecking && !isActive && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      title="重新检测"
                      onClick={() => checkTool(id)}
                      disabled={isOperating}
                      className="w-7 h-7 rounded-lg flex items-center justify-center
                        text-muted-foreground hover:bg-muted hover:text-foreground
                        transition-all disabled:opacity-40"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    {isFound ? (
                      <button
                        onClick={() => uninstallTool(id)}
                        disabled={isOperating}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                          text-red-500/80 hover:bg-red-500/10 hover:text-red-500
                          transition-all disabled:opacity-40"
                      >
                        <Trash2 className="w-3 h-3" />
                        卸载
                      </button>
                    ) : (
                      <button
                        onClick={() => installTool(id)}
                        disabled={isOperating}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                          bg-primary text-primary-foreground hover:opacity-90
                          shadow-sm shadow-primary/20 transition-all disabled:opacity-40"
                      >
                        <Download className="w-3 h-3" />
                        安装
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Roadmap ── */}
      <EnvRoadmap />

      {/* ── Terminal log panel ── */}
      {logs.length > 0 && (
        <div className="flex-1 flex flex-col min-h-0">
          <button
            onClick={() => setShowLogs((v) => !v)}
            className="flex items-center gap-2 w-full px-1 py-1 mb-2
              text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            安装日志
            <span className="text-muted-foreground/50">({logs.length} 行)</span>
            {showLogs ? (
              <ChevronUp className="w-3.5 h-3.5 ml-auto" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-auto" />
            )}
          </button>

          {showLogs && (
            <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-zinc-800 bg-zinc-950 dark:bg-black overflow-hidden">
              {/* Fake title bar */}
              <div
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-zinc-900/70
                  border-b border-zinc-800/80"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                <span className="ml-1.5 text-[11px] text-zinc-500 font-mono select-none">
                  终端输出
                </span>
                <button
                  onClick={() => setLogs([])}
                  className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  清空
                </button>
              </div>

              {/* Log entries */}
              <div className="flex-1 min-h-48 p-3 overflow-y-auto font-mono text-[12px] leading-relaxed space-y-px">
                {logs.map((log, i) => (
                  <div key={i} className={`whitespace-pre-wrap break-all ${LOG_COLORS[log.type]}`}>
                    {log.message}
                  </div>
                ))}
                <div ref={logBottomRef} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
