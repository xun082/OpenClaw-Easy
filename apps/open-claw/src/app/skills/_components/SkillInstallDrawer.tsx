'use client';

import { useEffect, useRef } from 'react';
import {
  X,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

import type { InstallLogEvent } from '@/electron';
import type { ScanResult } from '@/app/api/skills/scan/route';

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
  | 'installing' // direct install — shows live logs
  | 'downloading' // scan-path: install step (shows live logs)
  | 'scan_reading' // scan-path: reading installed file
  | 'scanning' // scan-path: AI analyzing content
  | 'scan_safe' // scan done — clean, shows green confirmation
  | 'scan_warning' // scan done — suspicious, user chooses keep/delete
  | 'scan_dangerous' // scan done — high-risk, recommend delete
  | 'success'
  | 'error';

interface Props {
  slug: string;
  logs: InstallLogEvent[];
  status: InstallStatus;
  scanResult?: ScanResult;
  scanSteps?: ScanStep[];
  onClose: () => void;
  onConfirmInstall?: () => void; // keep despite warning
  onDeleteSkill?: () => void; // delete dangerous/warned skill
}

// ── Simple spinner (scan_reading — very fast local op) ────────────────────────

function ReadingView() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-6">
      <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
      <p className="text-sm font-medium text-zinc-200">正在读取文件内容…</p>
    </div>
  );
}

// ── Streaming scan progress (scanning — mirrors AI-recommend SearchSteps) ─────

function ScanProgressView({ steps }: { steps: ScanStep[] }) {
  const allStepsDone = steps.length > 0 && steps.every((s) => s.done);

  return (
    <div className="px-5 py-5 min-h-[112px] space-y-3">
      <div className="flex items-center gap-1.5 text-[10.5px] text-zinc-600 mb-1">
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

      {/* Briefly shown while the result event is in-flight after all steps complete */}
      {allStepsDone && (
        <div className="flex items-center gap-2.5 text-[12px] font-mono text-zinc-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>生成安全报告…</span>
        </div>
      )}
    </div>
  );
}

// ── Scan safe view ────────────────────────────────────────────────────────────

function ScanSafeView({ result }: { result: ScanResult }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-6">
      <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
        <ShieldCheck className="w-6 h-6 text-emerald-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-emerald-400">安全扫描通过</p>
        <p className="text-[11.5px] text-zinc-400 mt-1.5 leading-relaxed max-w-xs">
          {result.summary || '未发现安全风险，技能内容正常。'}
        </p>
      </div>
    </div>
  );
}

// ── Scan verdict view ─────────────────────────────────────────────────────────

function ScanVerdictView({ result, isWarning }: { result: ScanResult; isWarning: boolean }) {
  return (
    <div className="px-5 py-4 space-y-3 overflow-y-auto max-h-72">
      <div
        className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${
          isWarning
            ? 'bg-amber-950/40 border border-amber-700/50'
            : 'bg-red-950/50 border border-red-700/50'
        }`}
      >
        {isWarning ? (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldX className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        )}
        <p
          className={`text-[12px] leading-relaxed ${isWarning ? 'text-amber-300' : 'text-red-300'}`}
        >
          {result.summary}
        </p>
      </div>

      {result.issues.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">发现的问题</p>
          {result.issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-[11.5px] text-zinc-400 leading-relaxed"
            >
              <span className={`shrink-0 mt-px ${isWarning ? 'text-amber-500' : 'text-red-500'}`}>
                {isWarning ? '⚠' : '✗'}
              </span>
              <span>{issue}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SkillInstallDrawer({
  slug,
  logs,
  status,
  scanResult,
  scanSteps,
  onClose,
  onConfirmInstall,
  onDeleteSkill,
}: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (['installing', 'downloading', 'success', 'error'].includes(status)) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, status]);

  // downloading shows install logs (user can see "正在解压..." etc.)
  // scan_reading → simple spinner; scanning → step-by-step SSE progress
  const isScanning = status === 'scan_reading' || status === 'scanning';
  const isScanResult =
    status === 'scan_safe' || status === 'scan_warning' || status === 'scan_dangerous';
  const isDone = status === 'success' || status === 'error' || isScanResult;

  // ── Header ────────────────────────────────────────────────────────────────

  const headerIcon = (() => {
    if (isScanning) return <Loader2 className="w-4 h-4 animate-spin text-sky-400" />;
    if (status === 'scan_safe') return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
    if (status === 'scan_warning') return <ShieldAlert className="w-4 h-4 text-amber-400" />;
    if (status === 'scan_dangerous') return <ShieldX className="w-4 h-4 text-red-400" />;
    if (status === 'installing' || status === 'downloading')
      return <Loader2 className="w-4 h-4 animate-spin text-sky-400" />;
    if (status === 'success') return <CheckCircle className="w-4 h-4 text-emerald-400" />;

    return <XCircle className="w-4 h-4 text-red-400" />;
  })();

  const headerText = (() => {
    if (status === 'downloading') return `正在下载 ${slug}…`;
    if (status === 'scan_reading') return `正在读取 ${slug}…`;
    if (status === 'scanning') return `正在扫描 ${slug}…`;
    if (status === 'scan_safe') return `${slug} — 安全扫描通过`;
    if (status === 'scan_warning') return `${slug} — 发现可疑内容`;
    if (status === 'scan_dangerous') return `${slug} — 检测到高危风险`;
    if (status === 'installing') return `正在安装 ${slug}…`;
    if (status === 'success') return `${slug} 安装成功`;

    return `${slug} 安装失败`;
  })();

  // ── Body ──────────────────────────────────────────────────────────────────

  const body = (() => {
    if (status === 'scan_reading') return <ReadingView />;
    if (status === 'scanning') return <ScanProgressView steps={scanSteps ?? []} />;
    if (status === 'scan_safe' && scanResult) return <ScanSafeView result={scanResult} />;

    if (isScanResult && scanResult) {
      return <ScanVerdictView result={scanResult} isWarning={status === 'scan_warning'} />;
    }

    return <LogView logs={logs} bottomRef={bottomRef} />;
  })();

  // ── Footer ────────────────────────────────────────────────────────────────

  const footer = (() => {
    if (status === 'scan_safe') {
      return (
        <div className="px-5 py-3 border-t border-emerald-900/30 bg-emerald-950/10 flex items-center justify-between">
          <p className="text-[11px] text-emerald-500/70">
            技能已安装到工作区，扫描未发现任何风险。
          </p>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors"
          >
            完成
          </button>
        </div>
      );
    }

    if (status === 'scan_warning') {
      return (
        <div className="px-5 py-3 border-t border-zinc-800/60 flex items-center justify-between gap-3">
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
        <div className="px-5 py-3 border-t border-red-900/40 bg-red-950/10 flex items-center justify-between gap-3">
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
        <div className="px-5 py-3 border-t border-zinc-800/60 bg-zinc-900/40 flex items-center justify-between">
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
    // Centered modal with backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
      <div className="w-full max-w-[520px] rounded-2xl overflow-hidden shadow-2xl border border-zinc-700/60 bg-zinc-950">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800/80">
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
              onClick={onClose}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Body */}
        {body}

        {/* Footer */}
        {footer}
      </div>
    </div>
  );
}
