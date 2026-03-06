'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Bot, Brain, CheckCircle2, FileText, IdCard, Loader2, Save, User } from 'lucide-react';
import { MdEditor } from 'md-editor-rt';

import { Button } from '@/components/ui/button';
import type { MarkdownFilename } from '@/electron';

import 'md-editor-rt/lib/style.css';

// ─── Config ───────────────────────────────────────────────────────────────────

interface FileTab {
  id: MarkdownFilename;
  label: string;
  icon: React.ElementType;
  description: string;
}

const TABS: FileTab[] = [
  { id: 'IDENTITY.md', label: 'IDENTITY', icon: IdCard, description: 'AI 助手的身份信息' },
  { id: 'SOUL.md', label: 'SOUL', icon: Bot, description: 'AI 助手的性格说明书' },
  { id: 'USER.md', label: 'USER', icon: User, description: '写给助手看的自我介绍' },
  { id: 'AGENTS.md', label: 'AGENTS', icon: FileText, description: '助手工作方式与边界' },
  { id: 'MEMORY.md', label: 'MEMORY', icon: Brain, description: '长期记忆精华' },
];

// Only show essential formatting tools — no image/mermaid/katex/preview toggle
const TOOLBARS = [
  'bold',
  'italic',
  'strike-through',
  '=',
  'title',
  'quote',
  'unordered-list',
  'ordered-list',
  'task',
  '=',
  'code-row',
  'code',
  '=',
  'revoke',
  'next',
  '=',
  'prettier',
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IdentityPage() {
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  const [activeTab, setActiveTab] = useState<MarkdownFilename>('IDENTITY.md');
  const [contents, setContents] = useState<Record<MarkdownFilename, string>>({
    'IDENTITY.md': '',
    'SOUL.md': '',
    'USER.md': '',
    'AGENTS.md': '',
    'MEMORY.md': '',
  });
  const [loaded, setLoaded] = useState<Record<MarkdownFilename, boolean>>({
    'IDENTITY.md': false,
    'SOUL.md': false,
    'USER.md': false,
    'AGENTS.md': false,
    'MEMORY.md': false,
  });
  const [saving, setSaving] = useState(false);
  const [savedTab, setSavedTab] = useState<MarkdownFilename | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  const isReady =
    typeof window !== 'undefined' && typeof window.api?.readMarkdownFile === 'function';

  useEffect(() => {
    setIsElectron(isReady);
  }, [isReady]);

  const loadFile = useCallback(
    async (filename: MarkdownFilename) => {
      if (!isReady) return;

      try {
        const result = await window.api.readMarkdownFile(filename);

        if (result.success) {
          setContents((prev) => ({ ...prev, [filename]: result.content }));
        }
      } finally {
        setLoaded((prev) => ({ ...prev, [filename]: true }));
      }
    },
    [isReady],
  );

  useEffect(() => {
    if (!isReady) return;

    for (const tab of TABS) {
      loadFile(tab.id);
    }
  }, [isReady, loadFile]);

  const handleSave = async () => {
    if (!isReady || saving) return;

    setSaving(true);

    try {
      await window.api.writeMarkdownFile(activeTab, contents[activeTab]);
      setSavedTab(activeTab);
      setTimeout(() => setSavedTab(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd + S to save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const currentTab = TABS.find((t) => t.id === activeTab)!;
  const Icon = currentTab.icon;
  const isCurrentLoaded = loaded[activeTab];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-7 pb-4 shrink-0 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight mb-0.5">身份配置</h1>
            <p className="text-xs text-muted-foreground">
              <code className="bg-muted px-1.5 py-0.5 rounded">~/.openclaw/workspace/</code>
              <span className="ml-1.5">AI 助手配置文件</span>
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={!isElectron || saving || !isCurrentLoaded}
            size="sm"
            className="gap-1.5 min-w-[80px]"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : savedTab === activeTab ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? '保存中' : savedTab === activeTab ? '已保存' : '保存'}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
                {!loaded[tab.id] && isElectron && (
                  <Loader2 className="w-3 h-3 animate-spin opacity-50" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Description bar */}
      <div className="flex items-center justify-between px-8 py-2 shrink-0 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground">{currentTab.description}</span>
        </div>
        <code className="text-[10px] text-muted-foreground/50">
          ~/.openclaw/workspace/{activeTab}
        </code>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {!isElectron ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">仅在 Electron 桌面应用中可用</p>
          </div>
        ) : !isCurrentLoaded ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
          </div>
        ) : (
          <MdEditor
            key={activeTab}
            id="identity-editor"
            modelValue={contents[activeTab]}
            onChange={(val) => setContents((prev) => ({ ...prev, [activeTab]: val }))}
            onSave={handleSave}
            theme={editorTheme}
            language="zh-CN"
            preview={false}
            toolbars={TOOLBARS as any}
            footers={['markdownTotal']}
            noUploadImg
            style={{ height: '100%', borderRadius: 0, border: 'none' }}
          />
        )}
      </div>
    </div>
  );
}
