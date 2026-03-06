import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  compact?: boolean;
  className?: string;
}

export function SegmentedControl({
  value,
  options,
  onChange,
  compact,
  className,
}: SegmentedControlProps) {
  return (
    <div
      className={cn(
        'flex items-center p-0.5 rounded-lg bg-muted border border-border',
        compact ? 'h-8' : 'h-9',
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-md font-medium transition-all px-2.5 whitespace-nowrap',
            compact ? 'py-0.5 text-[11px]' : 'py-1 text-xs',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
