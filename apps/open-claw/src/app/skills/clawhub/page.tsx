'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

import ClawHubTab from '../_components/ClawHubTab';

export default function ClawHubPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-1">ClawHub</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          浏览和安装 ClawHub 技能市场上的社区技能。
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) setSubmittedQuery('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSubmittedQuery(searchQuery);
            }}
            placeholder="搜索 ClawHub 技能，按 Enter 搜索..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground
              placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={() => setSubmittedQuery(searchQuery)}
          disabled={!searchQuery.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground
            hover:bg-muted hover:text-foreground transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Search className="w-3.5 h-3.5" />
          搜索
        </button>
      </div>

      <ClawHubTab searchQuery={searchQuery} submittedQuery={submittedQuery} />
    </div>
  );
}
