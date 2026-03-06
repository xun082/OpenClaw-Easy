'use client';

import { useEffect, useRef } from 'react';
import {
  CheckCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

import type { ScanResult } from '@/app/api/skills/scan/route';
import type { InstallLogEvent } from '@/electron';

export interface ScanStep {
  id: 'fetch' | 'analyze';
  label: string;
  done: boolean;
}

const typeStyles: Record<string, string> = {
  info: 'text-sky-400',
  stdout: 'text-zinc-300',
  stderr: 'text-amber-400',
  error: 'text-red-400',
};
const typePrefix: Record<string, string> = {
  info: '  ',
  stdout: '',
  stderr: '',
  error: '✗ ',
};

export type InstallStatus =
  | 'installing'
  | 'downloading'
  | 'scan_reading'
  | 'scanning'
  | 'scan_safe'
  | 'scan_warning'
  | 'scan_dangerous'
  | 'success'
  | 'error';

interface Props {
  slug: string;
  logs: InstallLogEvent[];
  status: InstallStatus;
  scanResult?: ScanResult;
  scanSteps?: ScanStep[];
  /** Real-time AI analysis tokens streamed from the scan route */
  scanStreamText?: string;
  onClose: () => void;
  onConfirmInstall?: () => void;
  onDeleteSkill?: () => void;
  /** When user closes drawer without confirming install (scan_safe), remove the skill from workspace */
  onCancelInstall?: () => void;
}

// ── Install log view ──────────────────────────────────────────────────────────

function LogView({
  logs,
  bottomRef,
}: {
  logs: InstallLogEvent[];
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="px-4 py-3 h-52 overflow-y-auto font-mono text-[11px] leading-[1.7] space-y-px bg-zinc-950/60">
      {logs.map((log, i) => (
        <div
          key={i}
          className={`${typeStyles[log.type] ?? 'text-zinc-400'} whitespace-pre-wrap break-all`}
        >
          {typePrefix[log.type]}
          {log.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Unified scan view: steps + live stream + final verdict, never cleared ─────

function ScanView({
  steps,
  streamText,
  scanResult,
  status,
}: {
  steps: ScanStep[];
  streamText: string;
  scanResult?: ScanResult;
  status: InstallStatus;
}) {
  const streamEndRef = useRef<HTMLDivElement | null>(null);
  const isScanResult =
    status === 'scan_safe' || status === 'scan_warning' || status === 'scan_dangerous';

  // Auto-scroll the stream area
  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamText]);

  const verdictColor = {
    scan_safe: 'emerald',
    scan_warning: 'amber',
    scan_dangerous: 'red',
  }[status as 'scan_safe' | 'scan_warning' | 'scan_dangerous'];

  return (
    <div className="flex flex-col max-h-[480px]">
      {/* ── Step progress (always visible) ────────────────────────────────── */}
      <div className="px-5 py-4 space-y-2.5 border-b border-zinc-800/50 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 uppercase tracking-wider mb-1">
          <ShieldCheck className="w-3 h-3 text-sky-500/70" />
          <span>安全扫描</span>
        </div>

        {steps.length === 0 && (
          <div className="flex items-center gap-2.5 text-[12px] font-mono text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>连接中…</span>
          </div>
        )}

        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2.5 text-[12px] font-mono">
            {step.done ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
            )}
            <span className={step.done ? 'text-zinc-500' : 'text-zinc-300'}>{step.label}</span>
          </div>
        ))}

        {/* "Generating report" shown while streaming, hides once result arrives */}
        {!isScanResult &&
          steps.length > 0 &&
          steps[steps.length - 1]?.id === 'analyze' &&
          !steps[steps.length - 1]?.done && (
            <div className="flex items-center gap-2.5 text-[11px] font-mono text-zinc-600">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span>AI 深度分析中…</span>
            </div>
          )}
      </div>

      {/* ── AI streaming analysis output (live, accumulates, never cleared) ── */}
      {streamText && (
        <div className="flex-1 overflow-y-auto bg-zinc-950/70 border-b border-zinc-800/40">
          <div className="px-4 py-3 space-y-1">
            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-2">AI 分析输出</p>
            <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap wrap-break-word leading-relaxed">
              {streamText}
            </pre>
            <div ref={streamEndRef} />
          </div>
        </div>
      )}

      {/* ── Final verdict — appended after stream ends, nothing is removed ─── */}
      {isScanResult && scanResult && (
        <div
          className={`shrink-0 border-t ${
            verdictColor === 'emerald'
              ? 'border-emerald-900/40 bg-emerald-950/20'
              : verdictColor === 'amber'
                ? 'border-amber-900/40 bg-amber-950/20'
                : 'border-red-900/40 bg-red-950/20'
          }`}
        >
          {/* Verdict header */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            {status === 'scan_safe' && (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            {status === 'scan_warning' && (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            {status === 'scan_dangerous' && <ShieldX className="w-4 h-4 text-red-400 shrink-0" />}
            <span
              className={`text-xs font-semibold ${
                status === 'scan_safe'
                  ? 'text-emerald-400'
                  : status === 'scan_warning'
                    ? 'text-amber-400'
                    : 'text-red-400'
              }`}
            >
              {status === 'scan_safe' && '安全扫描通过'}
              {status === 'scan_warning' && '发现可疑内容'}
              {status === 'scan_dangerous' && '检测到高危风险'}
            </span>
          </div>

          {/* Summary */}
          <p
            className={`px-4 pb-3 text-[11.5px] leading-relaxed ${
              status === 'scan_safe'
                ? 'text-emerald-300/80'
                : status === 'scan_warning'
                  ? 'text-amber-300/80'
                  : 'text-red-300/80'
            }`}
          >
            {scanResult.summary || '扫描完成。'}
          </p>

          {/* Issues list */}
          {scanResult.issues.length > 0 && (
            <div className="px-4 pb-3 space-y-1.5 border-t border-zinc-800/40 pt-2">
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider">发现的问题</p>
              {scanResult.issues.map((issue, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-[11.5px] text-zinc-400 leading-relaxed"
                >
                  <span
                    className={`shrink-0 mt-px ${
                      status === 'scan_warning' ? 'text-amber-500' : 'text-red-500'
                    }`}
                  >
                    {status === 'scan_warning' ? '⚠' : '✗'}
                  </span>
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SkillInstallDrawer({
  slug,
  logs,
  status,
  scanResult,
  scanSteps,
  scanStreamText = '',
  onClose,
  onConfirmInstall,
  onDeleteSkill,
  onCancelInstall,
}: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // When closing without confirming (X or backdrop), remove skill if scan_safe
  const handleClose = () => {
    if (status === 'scan_safe') onCancelInstall?.();
    onClose();
  };

  useEffect(() => {
    if (['installing', 'downloading', 'success', 'error'].includes(status)) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, status]);

  const isScanning = status === 'scan_reading' || status === 'scanning';
  const isScanPhase =
    isScanning ||
    status === 'scan_safe' ||
    status === 'scan_warning' ||
    status === 'scan_dangerous';
  const isScanResult =
    status === 'scan_safe' || status === 'scan_warning' || status === 'scan_dangerous';
  const isDone = status === 'success' || status === 'error' || isScanResult;

  // ── Header ─────────────────────────────────────────────────────────────────

  const headerIcon = (() => {
    if (status === 'scan_safe') return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
    if (status === 'scan_warning') return <ShieldAlert className="w-4 h-4 text-amber-400" />;
    if (status === 'scan_dangerous') return <ShieldX className="w-4 h-4 text-red-400" />;
    if (isScanPhase) return <Loader2 className="w-4 h-4 animate-spin text-sky-400" />;
    if (status === 'installing' || status === 'downloading')
      return <Loader2 className="w-4 h-4 animate-spin text-sky-400" />;
    if (status === 'success') return <CheckCircle className="w-4 h-4 text-emerald-400" />;

    return <XCircle className="w-4 h-4 text-red-400" />;
  })();

  const headerText = (() => {
    if (status === 'downloading') return `正在下载 ${slug}…`;
    if (status === 'scan_reading') return `正在读取 ${slug}…`;
    if (status === 'scanning') return `正在扫描 ${slug}…`;
    if (status === 'scan_safe') return `${slug} — 安全扫描通过 ✓`;
    if (status === 'scan_warning') return `${slug} — 发现可疑内容`;
    if (status === 'scan_dangerous') return `${slug} — 检测到高危风险`;
    if (status === 'installing') return `正在安装 ${slug}…`;
    if (status === 'success') return `${slug} 安装成功`;

    return `${slug} 安装失败`;
  })();

  // ── Body ────────────────────────────────────────────────────────────────────

  const body = (() => {
    // All scan phases (progress + stream + result) in one unified view
    if (isScanPhase) {
      return (
        <ScanView
          steps={scanSteps ?? []}
          streamText={scanStreamText}
          scanResult={scanResult}
          status={status}
        />
      );
    }

    return <LogView logs={logs} bottomRef={bottomRef} />;
  })();

  // ── Footer ──────────────────────────────────────────────────────────────────

  const footer = (() => {
    if (status === 'scan_safe') {
      return (
        <div className="px-5 py-3 border-t border-emerald-900/30 bg-emerald-950/10 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-emerald-500/70">
            扫描通过。点击「安装」将技能添加到工作区；关闭则不保留。
          </p>
          <button
            onClick={() => {
              onConfirmInstall?.();
              onClose();
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors"
          >
            安装
          </button>
        </div>
      );
    }

    if (status === 'scan_warning') {
      return (
        <div className="px-5 py-3 border-t border-zinc-800/60 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-amber-500/70 flex-1 leading-relaxed">
            扫描发现可疑内容，建议谨慎。你仍可自行决定是否保留。
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onDeleteSkill}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              删除技能
            </button>
            <button
              onClick={onConfirmInstall}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
            >
              保留
            </button>
          </div>
        </div>
      );
    }

    if (status === 'scan_dangerous') {
      return (
        <div className="px-5 py-3 border-t border-red-900/40 bg-red-950/10 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-red-400/80 flex-1">已检测到高危风险，强烈建议删除。</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-500 transition-colors"
            >
              忽略
            </button>
            <button
              onClick={onDeleteSkill}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              删除技能
            </button>
          </div>
        </div>
      );
    }

    if (status === 'success' || status === 'error') {
      return (
        <div className="px-5 py-3 border-t border-zinc-800/60 bg-zinc-900/40 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-zinc-500">
            {status === 'success'
              ? '技能已安装到工作区，刷新技能列表可查看。'
              : '请查看上方日志了解失败原因。'}
          </span>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            关闭
          </button>
        </div>
      );
    }

    return null;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[540px] rounded-2xl overflow-hidden shadow-2xl border border-zinc-700/60 bg-zinc-950 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {headerIcon}
            <span className="text-xs font-mono text-zinc-300 truncate">{headerText}</span>
          </div>
          {isDone && (
            <button
              onClick={handleClose}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Body — scrollable area */}
        <div className="flex-1 overflow-y-auto min-h-0">{body}</div>

        {/* Footer */}
        {footer}
      </div>
    </div>
  );
}
