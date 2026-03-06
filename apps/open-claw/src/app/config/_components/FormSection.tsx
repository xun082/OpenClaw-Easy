import type { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function FormSection({ title, description, action, children }: FormSectionProps) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div>
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </h2>
          {description && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
