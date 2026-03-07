'use client';

import { AlertCircle, AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { ValidationIssue } from '../page';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ValidationBannerProps {
  issues: ValidationIssue[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ValidationBanner({ issues }: ValidationBannerProps) {
  if (issues.length === 0) return null;

  const hasErrors = issues.some((i) => i.type === 'error');

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 space-y-1.5',
        hasErrors
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-amber-500/20 bg-amber-500/5',
      )}
    >
      <div className="flex items-center gap-2">
        {hasErrors ? (
          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        )}
        <p
          className={cn(
            'text-xs font-semibold',
            hasErrors ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
          )}
        >
          {hasErrors
            ? `${issues.filter((i) => i.type === 'error').length} 个错误需修复（无法保存）`
            : `${issues.length} 条配置建议`}
        </p>
      </div>
      <ul className="space-y-1">
        {issues.map((issue) => (
          <li key={issue.key} className="flex items-start gap-1.5">
            <span
              className={cn(
                'text-[10px] shrink-0 mt-0.5',
                issue.type === 'error' ? 'text-destructive' : 'text-amber-500',
              )}
            >
              {issue.type === 'error' ? '✕' : '⚠'}
            </span>
            <span
              className={cn(
                'text-[11px] leading-relaxed',
                issue.type === 'error'
                  ? 'text-destructive/90'
                  : 'text-amber-600/80 dark:text-amber-400/80',
              )}
            >
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
