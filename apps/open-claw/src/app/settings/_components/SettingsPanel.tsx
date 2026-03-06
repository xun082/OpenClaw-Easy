'use client';

import { useState, useEffect } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Save,
  AlertCircle,
} from 'lucide-react';
import { getApiKey, saveApiKey, clearApiKey } from '@/services/deepseekService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiKeyFieldProps {
  label: string;
  description: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
  value: string;
  onSave: (key: string) => void;
  onClear: () => void;
}

// ── Reusable key field ────────────────────────────────────────────────────────

function ApiKeyField({
  label,
  description,
  placeholder,
  docsUrl,
  docsLabel,
  value,
  onSave,
  onClear,
}: ApiKeyFieldProps) {
  const [input, setInput] = useState('');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  const isConfigured = Boolean(value);

  const handleSave = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setInput('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    onClear();
    setInput('');
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-border/60">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Key className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        {isConfigured && (
          <div className="flex items-center gap-1.5 shrink-0 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            已配置
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {/* Docs link */}
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2"
        >
          <ExternalLink className="w-3 h-3" />
          {docsLabel}
        </a>

        {/* Current key display */}
        {isConfigured && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/60">
            <Key className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            <span className="text-xs font-mono text-muted-foreground flex-1">
              {show ? value : `${value.slice(0, 8)}${'•'.repeat(Math.min(24, value.length - 8))}`}
            </span>
            <button
              onClick={() => setShow((v) => !v)}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleClear}
              title="删除 API Key"
              className="text-muted-foreground/50 hover:text-red-500 transition-colors ml-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder={isConfigured ? '输入新 Key 以覆盖当前配置' : placeholder}
              className="w-full pl-3 pr-3 py-2 rounded-lg border border-border bg-background text-sm font-mono
                text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={!input.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              bg-primary text-primary-foreground hover:opacity-90"
          >
            {saved ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? '已保存' : isConfigured ? '更新' : '保存'}
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
          API Key 仅保存在本地浏览器存储中，不会上传到任何服务器。
        </p>
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Main settings panel ───────────────────────────────────────────────────────

export default function SettingsPanel() {
  const [deepseekKey, setDeepseekKeyState] = useState('');

  useEffect(() => {
    setDeepseekKeyState(getApiKey());
  }, []);

  return (
    <div className="px-8 py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-1">设置</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          配置 AI 功能所需的 API Key 及其他偏好设置。
        </p>
      </div>

      <div className="space-y-8">
        {/* AI Keys */}
        <Section title="AI API Key">
          <ApiKeyField
            label="DeepSeek API Key"
            description="用于技能管理页面的 AI 推荐功能，根据自然语言需求智能匹配本地技能。"
            placeholder="sk-..."
            docsUrl="https://platform.deepseek.com/api_keys"
            docsLabel="前往 DeepSeek 平台获取 API Key"
            value={deepseekKey}
            onSave={(k) => {
              saveApiKey(k);
              setDeepseekKeyState(k);
            }}
            onClear={() => {
              clearApiKey();
              setDeepseekKeyState('');
            }}
          />
        </Section>

        {/* Storage note */}
        <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-800/30 px-4 py-3.5 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            所有 API Key 仅存储在本地浏览器的 localStorage 中。
            清除浏览器数据或重装应用后需要重新配置。
          </p>
        </div>
      </div>
    </div>
  );
}
