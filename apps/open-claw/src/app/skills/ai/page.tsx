'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownToLine,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Key,
  Loader2,
  Package,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import type { SSEEvent } from '@/app/api/skills/recommend/route';
import type { ScanResult, ScanSSEEvent } from '@/app/api/skills/scan/route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { InstallLogEvent } from '@/electron';
import { type AiRecommendResult, getApiKey } from '@/services/deepseekService';
import { getKimiApiKey } from '@/services/kimiService';

import SkillInstallDrawer, {
  type InstallStatus,
  type ScanStep,
} from '../_components/SkillInstallDrawer';

type AiProvider = 'deepseek' | 'kimi';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const isElectronEnv = () =>
  typeof window !== 'undefined' && typeof window.api?.installClawHubSkill === 'function';

// ─── NoKeyPrompt ───────────────────────────────────────────────────────────────

function NoKeyPrompt() {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-10 flex flex-col items-center text-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Key className="w-5 h-5 text-primary" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">需要配置 AI API Key</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
          前往设置页面配置 DeepSeek 或 Kimi API Key，AI 将在线搜索 ClawHub 并为你推荐最合适的技能。
        </p>
      </div>
      <Button asChild size="sm" className="gap-1.5">
        <Link href="/settings">
          <Settings className="w-3.5 h-3.5" />
          前往设置
        </Link>
      </Button>
    </div>
  );
}

// ─── SearchSteps ───────────────────────────────────────────────────────────────

interface SearchStep {
  step: number;
  keywords: string[];
  count?: number;
  method?: 'cli' | 'http';
}

const METHOD_BADGE: Record<string, { label: string; className: string }> = {
  cli: {
    label: '⚡ CLI',
    className:
      'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50',
  },
  http: {
    label: '🌐 HTTP',
    className:
      'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50',
  },
};

function SearchSteps({ steps, searching }: { steps: SearchStep[]; searching: boolean }) {
  if (steps.length === 0 && !searching) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <Sparkles className="w-3 h-3 text-primary" />
        AI 正在语义搜索 ClawHub 技能库…
      </div>
      {steps.map((s) => {
        const badge = s.method ? METHOD_BADGE[s.method] : null;

        return (
          <div key={s.step} className="flex items-center gap-2 text-[11px] font-mono flex-wrap">
            {s.count !== undefined ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : (
              <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
            )}
            {badge && (
              <span
                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badge.className}`}
              >
                {badge.label}
              </span>
            )}
            <span className="text-muted-foreground/60">search_skills(</span>
            <span className="text-primary/80">{s.keywords.map((k) => `"${k}"`).join(', ')}</span>
            <span className="text-muted-foreground/60">)</span>
            {s.count !== undefined && (
              <span
                className={
                  s.count === 0 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
                }
              >
                → {s.count === 0 ? '0 条（换个关键词？）' : `${s.count} 条`}
              </span>
            )}
          </div>
        );
      })}
      {searching && steps.length > 0 && steps[steps.length - 1]?.count !== undefined && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/40">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          AI 分析并排序结果中…
        </div>
      )}
    </div>
  );
}

// ─── Security scan helper ──────────────────────────────────────────────────────

interface ActiveInstall {
  slug: string;
  logs: InstallLogEvent[];
  status: InstallStatus;
  scanResult?: ScanResult;
  scanSteps?: ScanStep[];
  scanStreamText?: string;
  skillPath?: string;
}

async function runSecurityScan(
  slug: string,
  apiKey: string,
  provider: AiProvider,
  content: string | undefined,
  onSteps: (steps: ScanStep[]) => void,
  onStream: (text: string) => void,
): Promise<ScanResult> {
  const res = await fetch('/api/skills/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, apiKey, provider, content }),
  });

  if (!res.ok || !res.body) throw new Error(`扫描请求失败 (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ScanResult | null = null;
  let streamText = '';
  const steps: ScanStep[] = [];

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const evt = JSON.parse(line.slice(6)) as ScanSSEEvent;

      if (evt.type === 'fetch_start') {
        steps.push({ id: 'fetch', label: '读取技能内容', done: false });
        onSteps([...steps]);
      }

      if (evt.type === 'fetch_done') {
        const s = steps.find((s) => s.id === 'fetch');
        if (s) s.done = true;
        steps.push({ id: 'analyze', label: 'AI 安全分析', done: false });
        onSteps([...steps]);
      }

      if (evt.type === 'stream') {
        streamText += evt.token;
        onStream(streamText);
      }

      if (evt.type === 'result') {
        result = evt.result;

        const s = steps.find((s) => s.id === 'analyze');
        if (s) s.done = true;
        onSteps([...steps]);
      }

      if (evt.type === 'error') throw new Error(evt.message);
    }
  }

  return result ?? { verdict: 'safe', issues: [], summary: '扫描完成，未发现问题。' };
}

// ─── ResultCard ────────────────────────────────────────────────────────────────

interface ResultCardProps {
  result: AiRecommendResult;
  installedSlugs: Set<string>;
  activeInstall: ActiveInstall | null;
  isElectron: boolean;
  hasToken: boolean | null;
  provider: AiProvider;
  onInstall: (slug: string) => void;
  onScanInstall: (slug: string) => void;
}

function ResultCard({
  result,
  installedSlugs,
  activeInstall,
  isElectron,
  hasToken,
  provider,
  onInstall,
  onScanInstall,
}: ResultCardProps) {
  const pct = Math.round(result.score * 100);
  const isInstalled = installedSlugs.has(result.slug);
  const isBusy =
    activeInstall?.slug === result.slug &&
    ['installing', 'downloading', 'scan_reading', 'scanning'].includes(activeInstall.status);
  const installDisabled = !isElectron || hasToken === false;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Reason bar */}
      <div className="px-4 pt-3 pb-2.5 border-b border-border/50 bg-primary/5 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-primary/80 leading-relaxed flex-1">{result.reason}</p>
        <span className="shrink-0 text-[10px] font-mono text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded">
          {pct}%
        </span>
      </div>

      {/* Skill row */}
      <div className="flex items-start gap-3.5 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Package className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{result.displayName}</span>
            <span className="text-[11px] text-muted-foreground/50 font-mono">/{result.slug}</span>
          </div>
          {result.summary && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {result.summary}
            </p>
          )}
        </div>

        {/* View on web */}
        <a
          href={`https://clawhub.ai/sto/${result.slug}`}
          target="_blank"
          rel="noreferrer"
          title="在官网查看"
          className="shrink-0 mt-0.5 flex items-center justify-center w-8 h-8 rounded-lg border border-border
            text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {/* Install actions */}
        {isInstalled ? (
          <div
            className="shrink-0 mt-0.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
              text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30
              border border-emerald-200 dark:border-emerald-800/50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            已安装
          </div>
        ) : (
          <div className="shrink-0 mt-0.5 flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onInstall(result.slug)}
              disabled={isBusy || installDisabled}
              title={
                installDisabled
                  ? '请先登录 ClawHub'
                  : isBusy
                    ? '处理中…'
                    : `安装 ${result.displayName}`
              }
              className="gap-1.5 h-8 px-2.5 text-xs"
            >
              {isBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="w-3.5 h-3.5" />
              )}
              {isBusy ? '处理中' : '安装'}
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => onScanInstall(result.slug)}
              disabled={isBusy || installDisabled}
              title={
                installDisabled
                  ? '请先登录 ClawHub'
                  : provider === 'deepseek'
                    ? 'DeepSeek R1 深度推理安全扫描后安装'
                    : 'Kimi K2.5 深度推理安全扫描后安装'
              }
              className="h-8 w-8 hover:text-sky-500 hover:border-sky-400/50"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AiSkillsPage() {
  // Whichever key + provider is active (DeepSeek preferred, Kimi as fallback)
  const [apiKey, setApiKeyState] = useState('');
  const [provider, setProvider] = useState<AiProvider>('deepseek');

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchSteps, setSearchSteps] = useState<SearchStep[]>([]);
  const [results, setResults] = useState<AiRecommendResult[] | null>(null);
  const [searchError, setSearchError] = useState('');

  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const [isElectron, setIsElectron] = useState(false);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [activeInstall, setActiveInstall] = useState<ActiveInstall | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Prefer DeepSeek; fall back to Kimi if DeepSeek is not configured
    const dsKey = getApiKey();
    const kimiKey = getKimiApiKey();

    if (dsKey) {
      setApiKeyState(dsKey);
      setProvider('deepseek');
    } else if (kimiKey) {
      setApiKeyState(kimiKey);
      setProvider('kimi');
    }

    const electron = isElectronEnv();
    setIsElectron(electron);

    if (electron) {
      window.api.checkClawHubAuth().then(({ hasToken: t }) => setHasToken(t));
      window.api.listWorkspaceSkills().then((res) => {
        if (res.success) setInstalledSlugs(new Set(res.skills.map((s) => s.name)));
      });

      const unsub = window.api.onSkillInstallLog((log) => {
        setActiveInstall((prev) => {
          if (!prev || (prev.status !== 'installing' && prev.status !== 'downloading')) return prev;

          return { ...prev, logs: [...prev.logs, log] };
        });
      });

      return () => unsub();
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !apiKey || searching) return;

    setSearching(true);
    setSearchError('');
    setResults(null);
    setSearchSteps([]);
    setDebugLog([]);
    setShowDebug(false);

    const log: string[] = [];

    try {
      const res = await fetch('/api/skills/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), apiKey, provider }),
      });

      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => '请求失败');
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const evt = JSON.parse(line.slice(6)) as SSEEvent;

          if (evt.type === 'search_start') {
            const methodLabel = evt.method === 'cli' ? '[CLI]' : '[HTTP]';
            log.push(
              `[${evt.step}] ${methodLabel} search_skills(${JSON.stringify(evt.keywords)}) → 搜索中...`,
            );
            setSearchSteps((prev) => [
              ...prev,
              { step: evt.step, keywords: evt.keywords, method: evt.method },
            ]);
          }

          if (evt.type === 'search_end') {
            const label = evt.count === 0 ? '0 条' : `${evt.count} 条结果`;
            const methodLabel = evt.method === 'cli' ? '[CLI]' : '[HTTP]';
            log[log.length - 1] = log[log.length - 1].replace(
              '搜索中...',
              `${label} via ${methodLabel}`,
            );
            setSearchSteps((prev) =>
              prev.map((s) =>
                s.step === evt.step ? { ...s, count: evt.count, method: evt.method } : s,
              ),
            );
          }

          if (evt.type === 'result') setResults(evt.results);
          if (evt.type === 'error') throw new Error(evt.message);
          if (evt.type === 'done') break;
        }
      }
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
      setDebugLog(log);
    }
  }, [query, apiKey, searching]);

  const isBusy = Boolean(
    activeInstall &&
    ['installing', 'downloading', 'scan_reading', 'scanning'].includes(activeInstall.status),
  );

  // ── Install (direct) ────────────────────────────────────────────────────────
  const handleInstall = async (slug: string) => {
    if (!isElectron || isBusy) return;
    setActiveInstall({ slug, logs: [], status: 'installing' });

    try {
      const result = await window.api.installClawHubSkill(slug);
      setActiveInstall((prev) => {
        if (!prev) return null;

        const finalLog: InstallLogEvent = {
          type: result.success ? 'info' : 'error',
          message: result.success
            ? '✓ 安装完成'
            : `✗ 安装失败${result.error ? `：${result.error}` : ''}`,
          timestamp: Date.now(),
        };

        return {
          ...prev,
          status: result.success ? 'success' : 'error',
          logs: [...prev.logs, finalLog],
        };
      });

      if (result.success) {
        const res = await window.api.listWorkspaceSkills();
        if (res.success) setInstalledSlugs(new Set(res.skills.map((s) => s.name)));
      } else {
        const { hasToken: t } = await window.api.checkClawHubAuth();
        setHasToken(t);
      }
    } catch (e) {
      setActiveInstall((prev) => {
        if (!prev) return null;

        const finalLog: InstallLogEvent = {
          type: 'error',
          message: `✗ 安装出错：${(e as Error).message}`,
          timestamp: Date.now(),
        };

        return { ...prev, status: 'error', logs: [...prev.logs, finalLog] };
      });
    }
  };

  // ── Install (scan first) ─────────────────────────────────────────────────────
  const handleScanInstall = async (slug: string) => {
    if (!isElectron || isBusy) return;
    setActiveInstall({ slug, logs: [], status: 'downloading' });

    try {
      const installResult = await window.api.installClawHubSkill(slug);

      if (!installResult.success) {
        const { hasToken: t } = await window.api.checkClawHubAuth();
        setHasToken(t);
        setActiveInstall((prev) => {
          if (!prev) return null;

          const finalLog: InstallLogEvent = {
            type: 'error',
            message: `✗ 下载失败${installResult.error ? `：${installResult.error}` : ''}`,
            timestamp: Date.now(),
          };

          return { ...prev, status: 'error', logs: [...prev.logs, finalLog] };
        });

        return;
      }

      setActiveInstall((prev) => {
        if (!prev) return null;

        const bridgeLog: InstallLogEvent = {
          type: 'info',
          message: '✓ 下载完成，开始安全扫描…',
          timestamp: Date.now(),
        };

        return { ...prev, logs: [...prev.logs, bridgeLog] };
      });
    } catch (e) {
      setActiveInstall((prev) => {
        if (!prev) return null;

        const finalLog: InstallLogEvent = {
          type: 'error',
          message: `✗ 下载出错：${(e as Error).message}`,
          timestamp: Date.now(),
        };

        return { ...prev, status: 'error', logs: [...prev.logs, finalLog] };
      });

      return;
    }

    // Read SKILL.md
    setActiveInstall((prev) => (prev ? { ...prev, status: 'scan_reading' } : null));

    let fileContent = '';
    let skillPath = '';

    try {
      const listResult = await window.api.listWorkspaceSkills();
      const skill = listResult.skills.find((s) => s.name === slug);
      skillPath = skill?.path ?? '';

      if (skillPath) {
        const readResult = await window.api.executeCommand(`cat "${skillPath}/SKILL.md"`);
        fileContent = readResult.output ?? '';
      }
    } catch {
      // ignore — scan proceeds without content
    }

    // AI scan
    setActiveInstall((prev) =>
      prev ? { ...prev, status: 'scanning', skillPath, scanSteps: [] } : null,
    );

    try {
      const scanResult = await runSecurityScan(
        slug,
        apiKey,
        provider,
        fileContent,
        (steps) => setActiveInstall((prev) => (prev ? { ...prev, scanSteps: steps } : null)),
        (text) => setActiveInstall((prev) => (prev ? { ...prev, scanStreamText: text } : null)),
      );

      if (scanResult.verdict === 'safe') {
        setActiveInstall((prev) =>
          prev ? { ...prev, status: 'scan_safe', scanResult, skillPath } : null,
        );
      } else {
        setActiveInstall((prev) =>
          prev
            ? {
                ...prev,
                status: scanResult.verdict === 'dangerous' ? 'scan_dangerous' : 'scan_warning',
                scanResult,
                skillPath,
              }
            : null,
        );
      }
    } catch {
      const res = await window.api.listWorkspaceSkills();
      if (res.success) setInstalledSlugs(new Set(res.skills.map((s) => s.name)));
      setActiveInstall((prev) => (prev ? { ...prev, status: 'success' } : null));
    }
  };

  const handleKeepSkill = async () => {
    const res = await window.api.listWorkspaceSkills();
    if (res.success) setInstalledSlugs(new Set(res.skills.map((s) => s.name)));
    setActiveInstall(null);
  };

  const handleDeleteSkill = async () => {
    const path = activeInstall?.skillPath;

    if (path) {
      try {
        await window.api.executeCommand(`rm -rf "${path}"`);
      } catch {
        // ignore
      }
    }

    const res = await window.api.listWorkspaceSkills();
    if (res.success) setInstalledSlugs(new Set(res.skills.map((s) => s.name)));
    setActiveInstall(null);
  };

  const handleCancelInstall = async () => {
    const path = activeInstall?.skillPath;

    if (path) {
      try {
        await window.api.executeCommand(`rm -rf "${path}"`);
      } catch {
        // ignore
      }

      const res = await window.api.listWorkspaceSkills();
      if (res.success) setInstalledSlugs(new Set(res.skills.map((s) => s.name)));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight mb-1">AI 推荐</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          用自然语言描述需求，AI 将语义搜索 ClawHub 并为你精准推荐技能。
        </p>
      </div>

      {/* No key guard */}
      {!apiKey ? (
        <NoKeyPrompt />
      ) : (
        <>
          <div className="space-y-3">
            {/* Search row */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60 pointer-events-none" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && !searching) {
                        handleSearch();
                      }
                    }}
                    placeholder="描述你的需求，AI 将从 ClawHub 为你推荐"
                    disabled={searching}
                    className="pl-9 rounded-xl border-primary/30 focus:ring-primary/40"
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  disabled={searching || !query.trim()}
                  className="gap-1.5 rounded-xl px-5"
                >
                  {searching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  {searching ? '搜索中' : '推荐'}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground/50">
                  AI 调用 ClawHub 在线搜索，根据语义为你匹配最合适的技能 ·{' '}
                  <span className="text-primary/60">
                    {provider === 'kimi' ? 'Kimi moonshot-v1-8k' : 'DeepSeek V3'}
                  </span>
                </p>
                <Link
                  href="/settings"
                  className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  管理 Key
                </Link>
              </div>
            </div>

            {/* Live steps */}
            {searching && <SearchSteps steps={searchSteps} searching={searching} />}

            {/* Error */}
            {searchError && (
              <div className="rounded-xl border border-red-300/50 bg-red-50 dark:bg-red-950/20 dark:border-red-800/50 px-4 py-3 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">推荐失败</p>
                  <p className="text-xs text-red-600/70 dark:text-red-500/70 mt-0.5">
                    {searchError}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setSearchError('');
                    setResults(null);
                  }}
                  className="shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Debug panel */}
            {!searching && debugLog.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <Button
                  variant="ghost"
                  onClick={() => setShowDebug((v) => !v)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 h-auto rounded-none text-xs text-muted-foreground"
                >
                  <div className="flex items-center gap-1.5">
                    <Bug className="w-3 h-3" />
                    Agent 调试 · {debugLog.length} 次搜索
                  </div>
                  {showDebug ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </Button>
                {showDebug && (
                  <div className="border-t border-border bg-muted/30 px-3.5 py-3 space-y-1">
                    {debugLog.map((line, i) => (
                      <p key={i} className="text-[11px] font-mono text-muted-foreground/70">
                        {i + 1}. {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {!searching &&
              results !== null &&
              (results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">未找到匹配的技能</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">尝试换一种描述方式</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-muted-foreground/60">
                    找到 {results.length} 个推荐技能
                  </p>
                  {results.map((r) => (
                    <ResultCard
                      key={r.slug}
                      result={r}
                      installedSlugs={installedSlugs}
                      activeInstall={activeInstall}
                      isElectron={isElectron}
                      hasToken={hasToken}
                      provider={provider}
                      onInstall={handleInstall}
                      onScanInstall={handleScanInstall}
                    />
                  ))}
                </div>
              ))}

            {/* Idle hint */}
            {!searching && results === null && !searchError && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground/40">
                <Sparkles className="w-10 h-10 mb-3" />
                <p className="text-sm">用自然语言描述你的需求</p>
                <p className="text-xs mt-1">例如：帮我搜索网页、解析视频字幕、管理 Google 文档</p>
              </div>
            )}
          </div>

          {activeInstall && (
            <SkillInstallDrawer
              slug={activeInstall.slug}
              logs={activeInstall.logs}
              status={activeInstall.status}
              scanResult={activeInstall.scanResult}
              scanSteps={activeInstall.scanSteps}
              scanStreamText={activeInstall.scanStreamText}
              onClose={() => setActiveInstall(null)}
              onConfirmInstall={handleKeepSkill}
              onDeleteSkill={handleDeleteSkill}
              onCancelInstall={handleCancelInstall}
            />
          )}
        </>
      )}
    </div>
  );
}
