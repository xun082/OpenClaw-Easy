'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Sparkles,
  Key,
  Search,
  Loader2,
  AlertCircle,
  RotateCcw,
  Settings,
  Package,
  ExternalLink,
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Bug,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

import SkillInstallDrawer, { type InstallStatus, type ScanStep } from './SkillInstallDrawer';

import { getApiKey, type AiRecommendResult, type SSEEvent } from '@/services/deepseekService';
import type { ScanResult, ScanSSEEvent } from '@/app/api/skills/scan/route';
import type { InstallLogEvent } from '@/electron';

// ── Helpers ───────────────────────────────────────────────────────────────────

const isElectronEnv = () =>
  typeof window !== 'undefined' && typeof window.api?.installClawHubSkill === 'function';

// ── Sub-components ────────────────────────────────────────────────────────────

function NoKeyPrompt() {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-6 flex flex-col items-center text-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <Key className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-1">需要配置 DeepSeek API Key</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          前往设置页面配置 API Key，AI 将在线搜索 ClawHub 并为你推荐最合适的技能。
        </p>
      </div>
      <Link
        href="/settings"
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium
          hover:opacity-90 transition-opacity"
      >
        <Settings className="w-3.5 h-3.5" />
        前往设置
      </Link>
    </div>
  );
}

// ── Live search steps ─────────────────────────────────────────────────────────

interface SearchStep {
  step: number;
  keywords: string[];
  count?: number;
}

function SearchSteps({ steps, searching }: { steps: SearchStep[]; searching: boolean }) {
  if (steps.length === 0 && !searching) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mb-2">
        <Sparkles className="w-3 h-3 text-primary" />
        AI 正在搜索 ClawHub 技能库...
      </div>
      {steps.map((s) => (
        <div key={s.step} className="flex items-center gap-2 text-[11px] font-mono">
          {s.count !== undefined ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
          ) : (
            <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
          )}
          <span className="text-muted-foreground/60">search_skills(</span>
          <span className="text-primary/80">{s.keywords.map((k) => `"${k}"`).join(', ')}</span>
          <span className="text-muted-foreground/60">)</span>
          {s.count !== undefined && (
            <span className="text-emerald-600 dark:text-emerald-400">→ {s.count} 条</span>
          )}
        </div>
      ))}
      {searching && steps.length > 0 && steps[steps.length - 1]?.count !== undefined && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/40">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          分析结果中...
        </div>
      )}
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

interface ActiveInstall {
  slug: string;
  logs: InstallLogEvent[];
  status: InstallStatus;
  scanResult?: ScanResult;
  scanSteps?: ScanStep[];
  skillPath?: string;
}

async function runSecurityScan(
  slug: string,
  apiKey: string,
  content: string | undefined,
  onSteps: (steps: ScanStep[]) => void,
): Promise<ScanResult> {
  const res = await fetch('/api/skills/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, apiKey, content }),
  });

  if (!res.ok || !res.body) throw new Error(`扫描请求失败 (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ScanResult | null = null;
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
        const fetchStep = steps.find((s) => s.id === 'fetch');
        if (fetchStep) fetchStep.done = true;
        steps.push({ id: 'analyze', label: 'AI 安全分析', done: false });
        onSteps([...steps]);
      }

      if (evt.type === 'result') {
        result = evt.result;

        const analyzeStep = steps.find((s) => s.id === 'analyze');
        if (analyzeStep) analyzeStep.done = true;
        onSteps([...steps]);
      }

      if (evt.type === 'error') throw new Error(evt.message);
    }
  }

  return result ?? { verdict: 'safe', issues: [], summary: '扫描完成，未发现问题。' };
}

interface ResultCardProps {
  result: AiRecommendResult;
  installedSlugs: Set<string>;
  activeInstall: ActiveInstall | null;
  isElectron: boolean;
  hasToken: boolean | null;
  onInstall: (slug: string) => void;
  onScanInstall: (slug: string) => void;
}

function ResultCard({
  result,
  installedSlugs,
  activeInstall,
  isElectron,
  hasToken,
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
      <div className="px-4 pt-3 pb-2.5 border-b border-border/50 bg-primary/5 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-primary/80 leading-relaxed flex-1">{result.reason}</p>
        <span className="shrink-0 text-[10px] font-mono text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded">
          {pct}%
        </span>
      </div>
      <div className="flex items-start gap-3.5 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Package className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{result.displayName}</span>
            <span className="text-[11px] text-muted-foreground/50 font-mono">/{result.slug}</span>
          </div>
          {result.summary && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {result.summary}
            </p>
          )}
        </div>
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
            <button
              onClick={() => onInstall(result.slug)}
              disabled={isBusy || installDisabled}
              title={
                installDisabled
                  ? '请先登录 ClawHub'
                  : isBusy
                    ? '处理中…'
                    : `安装 ${result.displayName}`
              }
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border
                text-muted-foreground hover:text-foreground hover:bg-muted hover:border-primary/30 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="w-3.5 h-3.5" />
              )}
              {isBusy ? '处理中' : '安装'}
            </button>
            <button
              onClick={() => onScanInstall(result.slug)}
              disabled={isBusy || installDisabled}
              title={installDisabled ? '请先登录 ClawHub' : '安全扫描后安装'}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-border
                text-muted-foreground hover:text-sky-500 hover:border-sky-400/50 hover:bg-sky-50/5 transition-all
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AiSkillSearch() {
  const [apiKey, setApiKeyState] = useState('');

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchSteps, setSearchSteps] = useState<SearchStep[]>([]);
  const [results, setResults] = useState<AiRecommendResult[] | null>(null);
  const [searchError, setSearchError] = useState('');

  // Debug transcript
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // Install state
  const [isElectron, setIsElectron] = useState(false);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [activeInstall, setActiveInstall] = useState<ActiveInstall | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setApiKeyState(getApiKey());

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
        body: JSON.stringify({ query: query.trim(), apiKey }),
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
            log.push(`search_skills(${JSON.stringify(evt.keywords)}) → 搜索中...`);
            setSearchSteps((prev) => [...prev, { step: evt.step, keywords: evt.keywords }]);
          }

          if (evt.type === 'search_end') {
            log[log.length - 1] = log[log.length - 1].replace('搜索中...', `${evt.count} 条结果`);
            setSearchSteps((prev) =>
              prev.map((s) => (s.step === evt.step ? { ...s, count: evt.count } : s)),
            );
          }

          if (evt.type === 'result') {
            setResults(evt.results);
          }

          if (evt.type === 'error') {
            throw new Error(evt.message);
          }

          if (evt.type === 'done') {
            break;
          }
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

  // Direct install — no scan
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

  // Scan install — install first, read SKILL.md, then AI scan
  const handleScanInstall = async (slug: string) => {
    if (!isElectron || isBusy) return;

    // Step 1: download + install (logs stream in via onSkillInstallLog)
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

    // Step 2: read the installed SKILL.md
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
      // ignore — scan will proceed without content
    }

    // Step 3: AI scan
    setActiveInstall((prev) =>
      prev ? { ...prev, status: 'scanning', skillPath, scanSteps: [] } : null,
    );

    try {
      const scanResult = await runSecurityScan(slug, apiKey, fileContent, (steps) => {
        setActiveInstall((prev) => (prev ? { ...prev, scanSteps: steps } : null));
      });

      if (scanResult.verdict === 'safe') {
        const res = await window.api.listWorkspaceSkills();
        if (res.success) setInstalledSlugs(new Set(res.skills.map((s) => s.name)));
        // Show explicit scan-passed confirmation so user knows the scan ran
        setActiveInstall((prev) => (prev ? { ...prev, status: 'scan_safe', scanResult } : null));
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

    setActiveInstall(null);
  };

  if (!apiKey) return <NoKeyPrompt />;

  return (
    <>
      <div className="space-y-3">
        {/* Search input */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && !searching) {
                    handleSearch();
                  }
                }}
                placeholder="描述你的需求，AI 将从 ClawHub 为你推荐"
                disabled={searching}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-primary/30 bg-background text-sm text-foreground
                  placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40
                  disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium
                hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {searching ? '搜索中' : '推荐'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground/50">
              AI 调用 ClawHub 在线搜索，根据语义为你匹配最合适的技能
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

        {/* Live search steps */}
        {searching && <SearchSteps steps={searchSteps} searching={searching} />}

        {/* Error */}
        {searchError && (
          <div className="rounded-xl border border-red-300/50 bg-red-50 dark:bg-red-950/20 dark:border-red-800/50 px-4 py-3 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">推荐失败</p>
              <p className="text-xs text-red-600/70 dark:text-red-500/70 mt-0.5">{searchError}</p>
            </div>
            <button
              onClick={() => {
                setSearchError('');
                setResults(null);
              }}
              className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Debug panel */}
        {!searching && debugLog.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-muted-foreground
                hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Bug className="w-3 h-3" />
                Agent 调试 · {debugLog.length} 次搜索
              </div>
              {showDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
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
              <p className="text-xs text-muted-foreground/60">找到 {results.length} 个推荐技能</p>
              {results.map((r) => (
                <ResultCard
                  key={r.slug}
                  result={r}
                  installedSlugs={installedSlugs}
                  activeInstall={activeInstall}
                  isElectron={isElectron}
                  hasToken={hasToken}
                  onInstall={handleInstall}
                  onScanInstall={handleScanInstall}
                />
              ))}
            </div>
          ))}

        {/* Idle hint */}
        {!searching && results === null && !searchError && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground/40">
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
          onClose={() => setActiveInstall(null)}
          onConfirmInstall={handleKeepSkill}
          onDeleteSkill={handleDeleteSkill}
        />
      )}
    </>
  );
}
