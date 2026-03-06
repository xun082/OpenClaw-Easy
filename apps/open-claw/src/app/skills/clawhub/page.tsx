'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ClawHubTab from '../_components/ClawHubTab';

export default function ClawHubPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const submit = () => setSubmittedQuery(searchQuery.trim());
  const clear = () => {
    setSearchQuery('');
    setSubmittedQuery('');
  };

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight mb-1">ClawHub</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          浏览和安装 ClawHub 技能市场上的社区技能。
        </p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) setSubmittedQuery('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') clear();
            }}
            placeholder="搜索 ClawHub 技能，支持语义搜索，按 Enter 确认…"
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={clear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          onClick={submit}
          disabled={!searchQuery.trim()}
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
        >
          <Search className="w-3.5 h-3.5" />
          搜索
        </Button>
      </div>

      <ClawHubTab searchQuery={searchQuery} submittedQuery={submittedQuery} />
    </div>
  );
}
