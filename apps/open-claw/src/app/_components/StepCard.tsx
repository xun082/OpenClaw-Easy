import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from 'lucide-react';

export type StepStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';

interface StepCardProps {
  step: number;
  title: string;
  status: StepStatus;
  description?: string;
  badge?: string;
}

const statusConfig: Record<
  StepStatus,
  { icon: React.ElementType; iconColor: string; ringColor: string; borderColor: string }
> = {
  idle: {
    icon: Circle,
    iconColor: 'text-muted-foreground',
    ringColor: 'bg-muted/40',
    borderColor: 'border-border',
  },
  running: {
    icon: Loader2,
    iconColor: 'text-primary',
    ringColor: 'bg-primary/10',
    borderColor: 'border-primary/40',
  },
  success: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    ringColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-red-500',
    ringColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  skipped: {
    icon: MinusCircle,
    iconColor: 'text-muted-foreground/60',
    ringColor: 'bg-muted/20',
    borderColor: 'border-border',
  },
};

export default function StepCard({ step, title, status, description, badge }: StepCardProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isRunning = status === 'running';

  return (
    <div
      className={`rounded-xl border px-4 py-3.5 flex items-center gap-3.5 transition-all duration-200 ${config.borderColor} ${
        status === 'running' ? 'shadow-sm shadow-primary/10' : ''
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full ${config.ringColor} flex items-center justify-center shrink-0 transition-all`}
      >
        <Icon
          className={`w-[18px] h-[18px] ${config.iconColor} ${isRunning ? 'animate-spin' : ''}`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {String(step).padStart(2, '0')}
          </span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
              {badge}
            </span>
          )}
          {status === 'skipped' && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
              已跳过
            </span>
          )}
        </div>
        {description && (
          <p
            className={`text-xs mt-0.5 truncate ${
              status === 'error'
                ? 'text-red-500/80'
                : status === 'success'
                  ? 'text-emerald-600/80 dark:text-emerald-400/70'
                  : status === 'running'
                    ? 'text-primary/80'
                    : 'text-muted-foreground'
            }`}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
