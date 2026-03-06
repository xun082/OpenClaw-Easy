import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface FieldGroupProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function FieldGroup({ label, hint, children }: FieldGroupProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
