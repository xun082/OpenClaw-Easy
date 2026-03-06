'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Box, CheckCircle2, ExternalLink, Loader2, LogIn } from 'lucide-react';

import type { InstallLogEvent } from '@/electron';
import { getApiKey } from '@/services/deepseekService';
import { getKimiApiKey } from '@/services/kimiService';

import ClawHubSkillCard, { type ClawHubSkill } from './ClawHubSkillCard';
import SkillInstallDrawer, { type InstallStatus, type ScanStep } from './SkillInstallDrawer';

type AiProvider = 'deepseek' | 'kimi';

/** Returns { apiKey, provider } for whichever key is configured, DeepSeek preferred. */
function getAvailableApiKey(): { apiKey: string; provider: AiProvider } | null {
  const ds = getApiKey();
  if (ds) return { apiKey: ds, provider: 'deepseek' };

  const kimi = getKimiApiKey();
  if (kimi) return { apiKey: kimi, provider: 'kimi' };

  return null;
}

import type { ScanResult, ScanSSEEvent } from '@/app/api/skills/scan/route';

// ── API helpers (all calls go through the Next.js server to avoid browser-side 429s) ──

interface ListResponse {
  items: ClawHubSkill[];
  nextCursor: string | null;
}

interface SearchResultItem {
  slug: string;
  displayName: string;
  summary?: string;
  score?: number;
}

async function fetchPage(cursor?: string): Promise<ListResponse> {
  const params = new URLSearchParams({ sort: 'downloads' });
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`/api/skills/browse?${params}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<ListResponse>;
}

async function fetchSearch(q: string): Promise<ClawHubSkill[]> {
  const res = await fetch(`/api/skills/search?${new URLSearchParams({ q })}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  const data = (await res.json()) as { results: SearchResultItem[] };

  return data.results
    .filter((r) => r.slug)
    .map((r) => ({
      slug: r.slug,
      displayName: r.displayName ?? r.slug,
      summary: r.summary ?? '',
      tags: {},
      stats: {
        downloads: 0,
        stars: 0,
        comments: 0,
        installsAllTime: 0,
        installsCurrent: 0,
        versions: 0,
      },
      createdAt: 0,
      updatedAt: 0,
      latestVersion: null,
      metadata: null,
    }));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveInstall {
  slug: string;
  logs: InstallLogEvent[];
  status: InstallStatus;
  scanResult?: ScanResult;
  scanSteps?: ScanStep[];
  scanStreamText?: string; // accumulated real-time AI analysis tokens
  skillPath?: string;
}

// ── Security scan helper ───────────────────────────────────────────────────────

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

  if (!res.ok || !res.body) {
    throw new Error(`扫描请求失败 (${res.status})`);
  }

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

const isElectronEnv = () =>
  typeof window !== 'undefined' && typeof window.api?.installClawHubSkill === 'function';

interface Props {
  /** Live query string shown in the input (used for display only) */
  searchQuery: string;
  /** Only updates when user explicitly submits (Enter / search button) */
  submittedQuery: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClawHubTab({ submittedQuery }: Props) {
  // Browse mode (no search)
  const [browseSkills, setBrowseSkills] = useState<ClawHubSkill[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  // Search mode
  const [searchSkills, setSearchSkills] = useState<ClawHubSkill[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Install state
  const [activeInstall, setActiveInstall] = useState<ActiveInstall | null>(null);

  // Installed slugs (workspace skills)
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());

  // Auth
  const [isElectron, setIsElectron] = useState(false);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);

  const mountedRef = useRef(true);
  const searchAbortRef = useRef<AbortController | null>(null);

  // ── Init ────────────────────────────────────────────────────────────────────

  const refreshInstalledSlugs = useCallback(async () => {
    if (!isElectronEnv()) return;

    try {
      const res = await window.api.listWorkspaceSkills();

      if (res.success) {
        setInstalledSlugs(new Set(res.skills.map((s) => s.name)));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setHasApiKey(Boolean(getAvailableApiKey()));

    const electron = isElectronEnv();
    setIsElectron(electron);

    if (electron) {
      window.api.checkClawHubAuth().then(({ hasToken: t }) => setHasToken(t));
      refreshInstalledSlugs();
    } else {
      setHasToken(false);
    }
  }, [refreshInstalledSlugs]);

  // ── Browse load ─────────────────────────────────────────────────────────────

  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    setBrowseError('');

    try {
      const data = await fetchPage();
      if (!mountedRef.current) return;
      setBrowseSkills(data.items);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      if (!mountedRef.current) return;
      setBrowseError((e as Error).message || '加载失败');
    } finally {
      if (mountedRef.current) setBrowseLoading(false);
    }
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const data = await fetchPage(nextCursor);
      setBrowseSkills((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadBrowse();

    if (!isElectronEnv()) return;

    const unsubscribe = window.api.onSkillInstallLog((log) => {
      setActiveInstall((prev) => {
        // Capture logs for both direct install AND scan-install download phase
        if (!prev || (prev.status !== 'installing' && prev.status !== 'downloading')) return prev;

        return { ...prev, logs: [...prev.logs, log] };
      });
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [loadBrowse]);

  // ── Server-side search — fires only when submittedQuery changes ────────────

  useEffect(() => {
    if (!submittedQuery.trim()) {
      setSearchSkills([]);
      setSearchError('');

      return;
    }

    searchAbortRef.current?.abort();

    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;

    (async () => {
      setSearchLoading(true);
      setSearchError('');

      try {
        const results = await fetchSearch(submittedQuery.trim());
        if (ctrl.signal.aborted) return;
        setSearchSkills(results);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setSearchError((e as Error).message || '搜索失败');
      } finally {
        if (!ctrl.signal.aborted) setSearchLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [submittedQuery]);

  // ── Auth ────────────────────────────────────────────────────────────────────

  const handleLogin = async () => {
    if (!isElectron) return;
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const result = await window.api.clawHubLogin();

      if (result.success) {
        setHasToken(true);
      } else {
        setLoginError(result.error ?? '登录失败，请重试');
      }
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ── Install helpers ──────────────────────────────────────────────────────────

  const isBusy = Boolean(
    activeInstall &&
    ['installing', 'downloading', 'scan_reading', 'scanning'].includes(activeInstall.status),
  );

  // Direct install — shows live logs, no scan
  const handleInstall = useCallback(
    async (slug: string) => {
      if (!isElectron || isBusy) return;
      setActiveInstall({ slug, logs: [], status: 'installing' });

      try {
        const result = await window.api.installClawHubSkill(slug);
        // Add a synthetic completion line so the log doesn't end ambiguously mid-process
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
          await refreshInstalledSlugs();
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
    },
    [isElectron, isBusy, refreshInstalledSlugs],
  );

  // Scan install — install first, then read the actual SKILL.md, then AI scan
  const handleScanInstall = useCallback(
    async (slug: string) => {
      if (!isElectron || isBusy) return;

      const keyInfo = getAvailableApiKey();
      if (!keyInfo) return;

      const { apiKey, provider } = keyInfo;

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

        // Add a bridging message before switching to scan phase
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

      // Step 2: find skill path from workspace list
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
        // Reading failed — scan will proceed without content
      }

      // Step 3: AI security scan using actual file content
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
          // Keep skillPath so we can remove skill if user closes without confirming
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
        // Scan API error — treat as safe but go to plain success (no false alarm)
        await refreshInstalledSlugs();
        setActiveInstall((prev) => (prev ? { ...prev, status: 'success' } : null));
      }
    },
    [isElectron, isBusy, refreshInstalledSlugs],
  );

  // Keep the skill despite warning
  const handleKeepSkill = useCallback(async () => {
    await refreshInstalledSlugs();
    setActiveInstall(null);
  }, [refreshInstalledSlugs]);

  // Delete a skill after a dangerous/warned scan result, or when user closes without confirming (scan_safe)
  const handleDeleteSkill = useCallback(async () => {
    const path = activeInstall?.skillPath;

    if (path) {
      try {
        await window.api.executeCommand(`rm -rf "${path}"`);
      } catch {
        // ignore
      }
    }

    await refreshInstalledSlugs();
    setActiveInstall(null);
  }, [activeInstall, refreshInstalledSlugs]);

  // When user closes drawer without clicking "安装" (scan_safe), remove the skill from workspace
  const handleCancelInstall = useCallback(async () => {
    const path = activeInstall?.skillPath;

    if (path) {
      try {
        await window.api.executeCommand(`rm -rf "${path}"`);
      } catch {
        // ignore
      }

      await refreshInstalledSlugs();
    }
  }, [activeInstall?.skillPath, refreshInstalledSlugs]);

  // ── Derived display ─────────────────────────────────────────────────────────

  const isSearchMode = Boolean(submittedQuery.trim());
  const displaySkills = isSearchMode ? searchSkills : browseSkills;
  const isLoading = isSearchMode ? searchLoading : browseLoading;
  const displayError = isSearchMode ? searchError : browseError;

  // ── Render ──────────────────────────────────────────────────────────────────

  const renderSkillList = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-14 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">
            {isSearchMode ? `正在搜索 "${submittedQuery}"...` : '正在加载 ClawHub 技能...'}
          </span>
        </div>
      );
    }

    if (displayError) {
      return (
        <div className="rounded-xl border border-red-300/50 bg-red-50 dark:bg-red-950/20 dark:border-red-800/50 px-4 py-3.5 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {isSearchMode ? '搜索失败' : '加载失败'}
            </p>
            <p className="text-xs text-red-600/70 dark:text-red-500/70 mt-0.5">{displayError}</p>
          </div>
        </div>
      );
    }

    if (displaySkills.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Box className="w-8 h-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {isSearchMode ? `未找到匹配 "${submittedQuery}" 的技能` : '暂无技能数据'}
          </p>
        </div>
      );
    }

    return (
      <>
        {isSearchMode && (
          <p className="text-xs text-muted-foreground/60 mb-2">
            找到 {displaySkills.length} 个结果（按 Enter 或点击搜索按钮搜索）
          </p>
        )}
        <div className="space-y-1.5">
          {displaySkills.map((skill) => (
            <ClawHubSkillCard
              key={skill.slug}
              skill={skill}
              isInstalling={activeInstall?.slug === skill.slug && isBusy}
              isInstalled={installedSlugs.has(skill.slug)}
              installDisabled={!isElectron || hasToken === false}
              scanDisabled={!hasApiKey}
              onInstall={handleInstall}
              onScanInstall={handleScanInstall}
            />
          ))}
        </div>

        {/* Load more — only in browse mode */}
        {!isSearchMode && nextCursor && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full mt-4 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        )}

        <div className="flex items-center justify-center mt-4">
          <a
            href={
              isSearchMode
                ? `https://clawhub.ai/skills?q=${encodeURIComponent(submittedQuery)}`
                : 'https://clawhub.ai/skills'
            }
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {isSearchMode
              ? `在 clawhub.ai 上查看更多 "${submittedQuery}" 结果`
              : '在 clawhub.ai 上浏览全部技能'}
          </a>
        </div>
      </>
    );
  };

  return (
    <>
      {/* Auth banner */}
      {isElectron && hasToken === false && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">需要登录 ClawHub 才能安装技能</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              浏览器会自动打开登录页面，完成后即可一键安装任意技能。
            </p>
            {loginError && <p className="text-xs text-red-500 mt-1">{loginError}</p>}
          </div>
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium
              hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {isLoggingIn ? '等待登录...' : '登录 ClawHub'}
          </button>
        </div>
      )}

      {/* Auth badge */}
      {isElectron && hasToken === true && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          已登录 ClawHub，可直接安装技能
        </div>
      )}

      {renderSkillList()}

      {/* Install / scan modal */}
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
  );
}
