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
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getApiKey, saveApiKey, clearApiKey } from '@/services/deepseekService';
import { getKimiApiKey, saveKimiApiKey, clearKimiApiKey } from '@/services/kimiService';

// ─── Provider registry ─────────────────────────────────────────────────────────

interface ProviderDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
  color: string;
  avatar: string;
  get: () => string;
  save: (k: string) => void;
  clear: () => void;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    tagline: 'DeepSeek API Key',
    description:
      'AI 推荐（技能搜索）使用 DeepSeek V3，安全扫描使用 DeepSeek R1（深度推理）。',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    docsLabel: '前往 DeepSeek 平台获取 API Key',
    color: '#2563EB',
    avatar: 'D',
    get: getApiKey,
    save: saveApiKey,
    clear: clearApiKey,
  },
  {
    id: 'kimi',
    name: 'Kimi',
    tagline: 'Kimi (Moonshot) API Key',
    description:
      'AI 推荐使用 moonshot-v1-8k，安全扫描使用 Kimi K2.5（深度思考）。Gateway 层请在「配置文件 → 环境变量」中设置 KIMI_API_KEY。',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.moonshot.cn/console/api-keys',
    docsLabel: '前往 Moonshot 平台获取 API Key',
    color: '#06B6D4',
    avatar: 'K',
    get: getKimiApiKey,
    save: saveKimiApiKey,
    clear: clearKimiApiKey,
  },
];

// ─── SettingsPanel ─────────────────────────────────────────────────────────────

export default function SettingsPanel() {
  const [selectedId, setSelectedId] = useState(PROVIDERS[0].id);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load all keys on mount
  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const p of PROVIDERS) loaded[p.id] = p.get();
    setKeys(loaded);
  }, []);

  // Reset input / show state when switching provider
  const selectProvider = (id: string) => {
    setSelectedId(id);
    setInput('');
    setShowKey(false);
    setSaved(false);
  };

  const provider = PROVIDERS.find((p) => p.id === selectedId)!;
  const currentKey = keys[selectedId] ?? '';
  const isConfigured = Boolean(currentKey);

  const handleSave = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    provider.save(trimmed);
    setKeys((prev) => ({ ...prev, [selectedId]: trimmed }));
    setInput('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    provider.clear();
    setKeys((prev) => ({ ...prev, [selectedId]: '' }));
    setInput('');
    setShowKey(false);
  };

  const maskedKey =
    currentKey.length > 8
      ? `${currentKey.slice(0, 8)}${'•'.repeat(Math.min(20, currentKey.length - 8))}`
      : '•'.repeat(currentKey.length);

  return (
    <div className="px-8 py-8 max-w-2xl space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-[22px] font-bold tracking-tight mb-1">设置</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          配置 AI 功能所需的 API Key 及其他偏好设置。
        </p>
      </div>

      {/* ── Unified API Key section ─────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          AI API Key
        </h2>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Provider selector tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-border bg-muted/20">
            <span className="text-[11px] text-muted-foreground mr-2 shrink-0">选择提供商：</span>
            {PROVIDERS.map((p) => {
              const configured = Boolean(keys[p.id]);
              const active = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  onClick={() => selectProvider(p.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    active
                      ? 'bg-background text-foreground shadow-sm border border-border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  {/* Provider avatar dot */}
                  <span
                    className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.avatar}
                  </span>
                  {p.name}
                  {configured && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Provider detail */}
          <div className="px-5 py-5 space-y-4">
            {/* Provider info */}
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm"
                style={{ backgroundColor: provider.color }}
              >
                {provider.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{provider.tagline}</p>
                  {isConfigured ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      已配置
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60 bg-muted/40 border border-border px-2 py-0.5 rounded-full">
                      <Key className="w-2.5 h-2.5" />
                      未配置
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {provider.description}
                </p>
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors mt-1.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  {provider.docsLabel}
                </a>
              </div>
            </div>

            {/* Current key preview */}
            {isConfigured && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/40 border border-border/60">
                <Key className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                  {showKey ? currentKey : maskedKey}
                </span>
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5"
                >
                  {showKey ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={handleClear}
                  title="删除 API Key"
                  className="text-muted-foreground/50 hover:text-destructive transition-colors p-0.5 ml-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Key input */}
            <div className="flex gap-2">
              <Input
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder={isConfigured ? '输入新 Key 以覆盖…' : provider.placeholder}
                className="flex-1 font-mono"
              />
              <Button
                onClick={handleSave}
                disabled={!input.trim()}
                size="sm"
                className="gap-1.5 shrink-0 px-4"
              >
                {saved ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saved ? '已保存' : isConfigured ? '更新' : '保存'}
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground/50">
              API Key 仅保存在本地浏览器存储中，不会上传到任何服务器。
            </p>
          </div>
        </div>
      </div>

      {/* Security & usage notes */}
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5 flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium">本地存储，数据安全</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              所有 API Key 仅保存在本机 localStorage，清除浏览器数据或重装应用后需重新配置。
              如需将 Key 注入到网关进程，请前往「配置文件 → 环境变量」。
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-800/30 px-4 py-3.5 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
            这里的 Key 仅供前端本地功能使用（如技能 AI 推荐）。若需要 Gateway 网关使用 Kimi /
            DeepSeek 等模型，请在「配置文件」中将提供商添加到模型列表，或在环境变量中设置{' '}
            <code className="font-mono">KIMI_API_KEY</code> /{' '}
            <code className="font-mono">DEEPSEEK_API_KEY</code>。
          </p>
        </div>
      </div>
    </div>
  );
}
