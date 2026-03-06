'use client';

import { useEffect, useRef } from 'react';

import type { InstallLogEvent } from '@/electron';

interface TerminalOutputProps {
  logs: InstallLogEvent[];
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

export default function TerminalOutput({ logs }: TerminalOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 dark:bg-black overflow-hidden shadow-lg">
      {/* Fake window chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 select-none">
        <div className="w-3 h-3 rounded-full bg-red-500/70" />
        <div className="w-3 h-3 rounded-full bg-amber-500/70" />
        <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
        <span className="ml-2 text-[11px] text-zinc-500 font-mono tracking-wide">安装日志</span>
      </div>

      <div className="p-4 h-52 overflow-y-auto font-mono text-[12px] leading-[1.65] space-y-px scrollbar-thin">
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
    </div>
  );
}
