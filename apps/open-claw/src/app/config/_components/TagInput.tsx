'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

interface TagInputProps {
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}

export function TagInput({ values, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();

    if (v) {
      onChange([...values.filter((x) => x !== v), v]);
      setInput('');
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-border bg-background min-h-[38px] focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition cursor-text">
      {values.map((v) => (
        <Badge key={v} variant="secondary" className="gap-1 font-mono text-[11px] h-6">
          {v}
          <button
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-muted-foreground hover:text-destructive transition ml-0.5"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </Badge>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }

          if (e.key === 'Backspace' && !input && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={values.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[140px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
      />
    </div>
  );
}
