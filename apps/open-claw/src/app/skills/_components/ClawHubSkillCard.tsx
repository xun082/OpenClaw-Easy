import {
  ArrowDownToLine,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Package,
  ShieldCheck,
  Star,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface ClawHubSkill {
  slug: string;
  displayName: string;
  summary: string;
  tags: Record<string, string>;
  stats: {
    comments: number;
    downloads: number;
    installsAllTime: number;
    installsCurrent: number;
    stars: number;
    versions: number;
  };
  createdAt: number;
  updatedAt: number;
  latestVersion: {
    version: string;
    createdAt: number;
    changelog: string;
  } | null;
  metadata: null | { os: string | null; systems: string | null };
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;

  return String(n);
}

interface Props {
  skill: ClawHubSkill;
  isInstalling: boolean;
  isInstalled?: boolean;
  installDisabled?: boolean;
  scanDisabled?: boolean;
  onInstall: (slug: string) => void;
  onScanInstall?: (slug: string) => void;
}

export default function ClawHubSkillCard({
  skill,
  isInstalling,
  isInstalled,
  installDisabled,
  scanDisabled,
  onInstall,
  onScanInstall,
}: Props) {
  return (
    <div className="flex items-start gap-3.5 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Package className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{skill.displayName}</span>
          <span className="text-[11px] text-muted-foreground/50 font-mono">/{skill.slug}</span>
          {skill.latestVersion && (
            <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded font-mono">
              v{skill.latestVersion.version}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
          {skill.summary}
        </p>
        {(skill.stats.downloads > 0 || skill.stats.stars > 0) && (
          <div className="flex items-center gap-3 mt-1.5">
            {skill.stats.downloads > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <Download className="w-3 h-3" />
                {formatCount(skill.stats.downloads)}
              </span>
            )}
            {skill.stats.stars > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <Star className="w-3 h-3" />
                {formatCount(skill.stats.stars)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* External link */}
      <a
        href={`https://clawhub.ai/sto/${skill.slug}`}
        target="_blank"
        rel="noreferrer"
        title="在官网查看"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 mt-1 flex items-center justify-center w-8 h-8 rounded-lg border border-border
          text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>

      {/* Action buttons */}
      {isInstalled ? (
        <span className="shrink-0 mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-2.5 py-1.5 rounded-lg">
          <CheckCircle2 className="w-3.5 h-3.5" />
          已安装
        </span>
      ) : (
        <div className="shrink-0 mt-1 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onInstall(skill.slug)}
            disabled={isInstalling || installDisabled}
            title={
              installDisabled
                ? '请先登录 ClawHub'
                : isInstalling
                  ? '处理中…'
                  : `安装 ${skill.displayName}`
            }
            className="gap-1.5 h-8 px-2.5 text-xs"
          >
            {isInstalling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowDownToLine className="w-3.5 h-3.5" />
            )}
            {isInstalling ? '处理中' : '安装'}
          </Button>

          {onScanInstall && (
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => onScanInstall(skill.slug)}
              disabled={isInstalling || installDisabled || scanDisabled}
              title={
                scanDisabled
                  ? '需要在「设置」中配置 DeepSeek 或 Kimi API Key 才能使用 AI 安全扫描'
                  : installDisabled
                    ? '请先登录 ClawHub'
                    : `AI 深度推理安全扫描后安装 ${skill.displayName}`
              }
              className="h-8 w-8 hover:text-sky-500 hover:border-sky-400/50"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
