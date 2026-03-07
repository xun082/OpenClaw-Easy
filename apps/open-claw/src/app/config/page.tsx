'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { json as jsonLang } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FilePlus,
  FolderOpen,
  GripVertical,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Server,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { APIS_REQUIRING_MODELS, PROVIDER_MODELS, PROVIDER_PRESETS } from '@/lib/openclaw-providers';
import type { SSHConn } from '@/lib/ssh-utils';
import { buildSshCmd } from '@/lib/ssh-utils';
import { cn } from '@/lib/utils';
import { useConfigPageStore } from '@/store/config-page-store';
import type { OpenclawConfig } from '@/store/config-store';
import { EMPTY_CONFIG, normalizeConfig, useConfigStore } from '@/store/config-store';
import { selectActiveConn, useConnectionStore } from '@/store/connection-store';

import { AgentsSection } from './_components/AgentsSection';
import { CanvasSection } from './_components/CanvasSection';
import { EmptySlot } from './_components/EmptySlot';
import { EnvVarsSection } from './_components/EnvVarsSection';
import { FormSection } from './_components/FormSection';
import { GatewayFields } from './_components/GatewayFields';
import { ProviderCard } from './_components/ProviderCard';
import { ProviderPicker } from './_components/ProviderPicker';
import { SegmentedControl } from './_components/SegmentedControl';
import { TagInput } from './_components/TagInput';
import { ValidationBanner } from './_components/ValidationBanner';
import { VirtualProviderCard } from './_components/VirtualProviderCard';
import { WhatsAppSection } from './_components/WhatsAppSection';

// CodeMirror dynamically loaded — avoids SSR issues
const CodeMirrorEditor = dynamic(() => import('@uiw/react-codemirror'), { ssr: false });

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationIssue {
  type: 'error' | 'warning';
  key: string;
  message: string;
}

function getConfigIssues(config: OpenclawConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const providers = config.models?.providers ?? {};

  if (Object.keys(providers).length === 0) {
    issues.push({ type: 'warning', key: 'no-providers', message: '未配置任何模型提供商' });
  }

  for (const [name, provider] of Object.entries(providers)) {
    if (
      APIS_REQUIRING_MODELS.has(provider.api) &&
      (!provider.models || provider.models.length === 0)
    ) {
      issues.push({
        type: 'error',
        key: `${name}:no-models`,
        message: `提供商「${name}」缺少模型列表（${provider.api} 必须配置模型，否则网关无法启动）`,
      });
    }

    if (
      !provider.apiKey?.trim() &&
      provider.api !== 'ollama' &&
      provider.api !== 'bedrock-converse-stream'
    ) {
      issues.push({
        type: 'warning',
        key: `${name}:no-apikey`,
        message: `提供商「${name}」未填写 API Key`,
      });
    }

    if (!provider.baseUrl?.trim() && provider.api !== 'bedrock-converse-stream') {
      issues.push({
        type: 'warning',
        key: `${name}:no-baseurl`,
        message: `提供商「${name}」未填写 Base URL`,
      });
    }
  }

  const primary = config.agents?.defaults?.model?.primary;

  if (!primary || !primary.includes('/') || !primary.split('/')[1]) {
    issues.push({
      type: 'warning',
      key: 'no-default-model',
      message: '未设置默认模型（agents.defaults.model.primary）',
    });
  }

  return issues;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [mounted, setMounted] = useState(false);

  // ── Connection store ────────────────────────────────────────────────────────
  const sshConns = useConnectionStore((s) => s.connections);
  const selectedConnId = useConnectionStore((s) => s.selectedConnId);
  const setSelectedConnId = useConnectionStore((s) => s.setSelectedConnId);
  const activeConn = useConnectionStore(selectActiveConn);

  // ── Page UI store ───────────────────────────────────────────────────────────
  const showPreview = useConfigPageStore((s) => s.showPreview);
  const panelWidth = useConfigPageStore((s) => s.panelWidth);
  const expandedProviders = useConfigPageStore((s) => s.expandedProviders);
  const showKeys = useConfigPageStore((s) => s.showKeys);
  const showGatewayToken = useConfigPageStore((s) => s.showGatewayToken);
  const showGatewayPassword = useConfigPageStore((s) => s.showGatewayPassword);
  const providerPickerOpen = useConfigPageStore((s) => s.providerPickerOpen);
  const {
    setShowPreview,
    setPanelWidth,
    toggleProvider,
    setExpandedProviders,
    toggleShowKey,
    setShowGatewayToken,
    setShowGatewayPassword,
    setProviderPickerOpen,
  } = useConfigPageStore();

  // ── Local transient state ───────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  // JSON editor
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const editorFocused = useRef(false);

  // Drag-to-resize refs
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // ── Config store ────────────────────────────────────────────────────────────
  const {
    config,
    savedConfig,
    configPath,
    loading,
    exists,
    saveStatus,
    errorMsg,
    restartLog,
    autoNormalized,
    loadConfig,
    saveConfig,
    setRestartLog,
    initWithEmpty,
    setGatewayPort,
    setGatewayAuthMode,
    setGatewayAuthToken,
    setGatewayAuthPassword,
    setGatewayReloadMode,
    setCanvasEnabled,
    setCanvasPort,
    setModelsMode,
    updateProvider,
    removeProvider,
    addProvider,
    addProviderModel,
    removeProviderModel,
    setAgentWorkspace,
    setContextPruningMode,
    setAgentDefaultModel,
    addAgentModelEntry,
    updateAgentModelEntry,
    removeAgentModelEntry,
    setWaGroupPolicy,
    setWaAllowFrom,
    setWaRequireMention,
    setMentionPatterns,
    setEnvVar,
    addEnvVar,
    removeEnvVar,
  } = useConfigStore();

  // ── Fix Cmd+A / Ctrl+A in inputs ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;

        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
          e.preventDefault();
          el.select();
        }
      }
    };

    document.addEventListener('keydown', handler);

    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Drag-to-resize JSON panel ───────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const delta = dragStartX.current - e.clientX;
      setPanelWidth(Math.max(260, Math.min(720, dragStartWidth.current + delta)));
    };
    const onUp = () => {
      isDragging.current = false;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [setPanelWidth]);

  // ── Remote config helpers ───────────────────────────────────────────────────

  const loadRemoteConfig = async (conn: SSHConn) => {
    useConfigStore.setState({ loading: true, saveStatus: 'idle', errorMsg: '' });

    const remotePath = `${conn.username}@${conn.host}:~/.openclaw/openclaw.json`;

    try {
      const res = await window.api.executeCommand(
        buildSshCmd(conn, `cat ~/.openclaw/openclaw.json 2>/dev/null || echo '__NOTFOUND__'`),
      );
      const output = (res.output ?? '').trim();

      if (!res.success || output === '__NOTFOUND__' || output === '') {
        useConfigStore.setState({
          exists: false,
          config: null,
          savedConfig: null,
          configPath: remotePath,
          loading: false,
        });
      } else {
        try {
          const parsed = normalizeConfig(JSON.parse(output) as OpenclawConfig);
          useConfigStore.setState({
            config: parsed,
            savedConfig: parsed,
            exists: true,
            configPath: remotePath,
            loading: false,
          });

          const keys = Object.keys(parsed?.models?.providers ?? {});
          if (keys[0]) setExpandedProviders({ [keys[0]]: true });
        } catch {
          useConfigStore.setState({
            config: EMPTY_CONFIG,
            savedConfig: EMPTY_CONFIG,
            exists: true,
            configPath: remotePath,
            loading: false,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '读取失败';
      useConfigStore.setState({ errorMsg: msg, saveStatus: 'error', loading: false });
    }
  };

  const saveRemoteConfig = async (conn: SSHConn) => {
    if (!config) return;

    const jsonStr = JSON.stringify(config, null, 2);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const script = `mkdir -p ~/.openclaw && echo '${b64}' | base64 -d > ~/.openclaw/openclaw.json && echo "SAVED" || echo "FAILED"`;
    useConfigStore.setState({ saveStatus: 'saving', errorMsg: '' });

    try {
      const res = await window.api.executeCommand(buildSshCmd(conn, script));
      const out = (res.output ?? '').trim();

      if (out.includes('SAVED') || res.success) {
        useConfigStore.setState({ savedConfig: config, exists: true, saveStatus: 'reloading' });

        const rRes = await window.api.executeCommand(
          buildSshCmd(
            conn,
            `systemctl restart openclaw-gateway 2>/dev/null && echo "RESTARTED" || echo "NO_SERVICE"`,
          ),
        );
        const rOut = (rRes.output ?? '').trim();
        useConfigStore.setState({
          saveStatus: rOut.includes('RESTARTED') ? 'saved' : 'saved-no-gateway',
          restartLog: {
            output: rOut.includes('RESTARTED')
              ? `✓ 远端 ${conn.host} 配置已保存，网关已重启`
              : `✓ 配置已保存至 ${conn.host}（远端网关服务未运行，可手动重启）`,
            success: rOut.includes('RESTARTED'),
            visible: true,
          },
        });
        setTimeout(() => useConfigStore.setState({ saveStatus: 'idle' }), 6000);
      } else {
        useConfigStore.setState({ saveStatus: 'error', errorMsg: res.error ?? '保存失败' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存失败';
      useConfigStore.setState({ saveStatus: 'error', errorMsg: msg });
    }
  };

  // ── Load / Save ─────────────────────────────────────────────────────────────

  const handleLoadConfig = () => {
    if (!activeConn) {
      loadConfig().then(() => {
        const keys = Object.keys(useConfigStore.getState().config?.models?.providers ?? {});
        if (keys[0])
          setExpandedProviders((prev) => (Object.keys(prev).length ? prev : { [keys[0]]: true }));
      });
    } else {
      void loadRemoteConfig(activeConn);
    }
  };

  const handleSaveConfig = () => {
    if (!activeConn) saveConfig();
    else void saveRemoteConfig(activeConn);
  };

  // ── Mount + initial load ────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    handleLoadConfig();
  }, [mounted, selectedConnId]);

  // ── Sync config → JSON editor ───────────────────────────────────────────────
  useEffect(() => {
    if (config && !editorFocused.current) {
      setJsonText(JSON.stringify(config, null, 2));
    }
  }, [config]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const configJson = useMemo(() => (config ? JSON.stringify(config, null, 2) : ''), [config]);
  const savedConfigJson = useMemo(
    () => (savedConfig ? JSON.stringify(savedConfig, null, 2) : ''),
    [savedConfig],
  );
  const isDirty = configJson !== savedConfigJson;

  const validationIssues = useMemo(() => (config ? getConfigIssues(config) : []), [config]);
  const hasErrors = validationIssues.some((i) => i.type === 'error');
  const hasWarnings = validationIssues.some((i) => i.type === 'warning');

  const canSave =
    !loading &&
    isDirty &&
    saveStatus !== 'saving' &&
    saveStatus !== 'reloading' &&
    !!config &&
    !hasErrors;

  // ── Virtual providers (alias-based, env-var driven) ─────────────────────────
  const virtualProviderEntries = useMemo(() => {
    const aliasModelKeys = Object.keys(config?.agents?.defaults?.models ?? {});
    const formalProviders = config?.models?.providers ?? {};
    const seen = new Map<string, (typeof PROVIDER_MODELS)[string]>();

    for (const ak of aliasModelKeys) {
      const slash = ak.indexOf('/');

      if (slash > 0) {
        const pName = ak.slice(0, slash);

        if (!formalProviders[pName] && PROVIDER_MODELS[pName] && !seen.has(pName)) {
          seen.set(pName, PROVIDER_MODELS[pName]);
        }
      }
    }

    return [...seen.entries()];
  }, [config?.agents?.defaults?.models, config?.models?.providers]);

  // ── JSON editor handler ─────────────────────────────────────────────────────
  const handleJsonChange = (value: string) => {
    setJsonText(value);

    try {
      const parsed = JSON.parse(value) as OpenclawConfig;
      useConfigStore.getState().setConfig(normalizeConfig(parsed));
      setJsonError(null);
    } catch {
      setJsonError('JSON 格式错误');
    }
  };

  // ── Provider picker helpers ─────────────────────────────────────────────────
  const addProviderFromPreset = (preset: (typeof PROVIDER_PRESETS)[number]) => {
    addProvider(preset.id, {
      baseUrl: preset.baseUrl,
      api: preset.api,
      apiKey: '',
      authHeader: preset.authHeader,
      ...(preset.fullModels ? { models: preset.fullModels } : {}),
    });
    setExpandedProviders((prev) => ({ ...prev, [preset.id]: true }));
    setProviderPickerOpen(false);
  };

  const addCustomProvider = (name: string) => {
    addProvider(name, { baseUrl: '', api: 'anthropic-messages', apiKey: '', authHeader: true });
    setExpandedProviders((prev) => ({ ...prev, [name]: true }));
    setProviderPickerOpen(false);
  };

  const handleCopyPath = async () => {
    if (!configPath) return;
    await navigator.clipboard.writeText(configPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Convenience aliases ─────────────────────────────────────────────────────
  const gw = config?.gateway;
  const providerEntries = Object.entries(config?.models?.providers ?? {});
  const envEntries = Object.entries(config?.env ?? {}) as [string, string][];

  // ── Early render states ─────────────────────────────────────────────────────
  if (!mounted) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">正在读取配置文件…</p>
        </div>
      </div>
    );
  }

  if (!exists && !config) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 p-8">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <FilePlus className="w-8 h-8 text-muted-foreground/60" />
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-sm font-semibold">配置文件不存在</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
            未找到 <code className="font-mono text-foreground/70">~/.openclaw/openclaw.json</code>
            ，运行 <code className="font-mono text-foreground/70">openclaw onboard</code>{' '}
            可自动创建，或点击下方按钮使用默认模板。
          </p>
        </div>
        <Button onClick={initWithEmpty} className="gap-2">
          <FilePlus className="w-4 h-4" />
          使用默认模板
        </Button>
      </div>
    );
  }

  // ── Main editor ─────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Connection source bar */}
        <div className="shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-border bg-muted/20">
          <span className="text-[11px] text-muted-foreground shrink-0 mr-1">配置目标：</span>
          <button
            onClick={() => setSelectedConnId('local')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
              selectedConnId === 'local'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <Monitor className="w-3 h-3" />
            本地
          </button>
          {sshConns.map((conn) => (
            <button
              key={conn.id}
              onClick={() => setSelectedConnId(conn.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
                selectedConnId === conn.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Server className="w-3 h-3" />
              {conn.name || `${conn.username}@${conn.host}`}
            </button>
          ))}
          {sshConns.length === 0 && (
            <span className="text-[11px] text-muted-foreground/50 italic ml-1">
              （前往「安装与连接 → SSH 远程部署」添加远程服务器）
            </span>
          )}
          {selectedConnId !== 'local' && (
            <Badge
              variant="outline"
              className="ml-auto text-[10px] text-sky-600 border-sky-300 dark:text-sky-400 dark:border-sky-700"
            >
              远端配置
            </Badge>
          )}
        </div>

        {/* Header */}
        <div className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-3 bg-card/50">
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-bold tracking-tight">配置文件</h1>
            {configPath && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                <code className="text-[11px] font-mono text-muted-foreground truncate max-w-[360px]">
                  {configPath}
                </code>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleCopyPath}
                      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{copied ? '已复制' : '复制路径'}</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((p) => !p)}
              className="gap-1.5 text-xs"
            >
              <Code2 className="w-3.5 h-3.5" />
              {showPreview ? '隐藏 JSON' : '显示 JSON'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadConfig}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              重新加载
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Form panel */}
          <div
            className={cn(
              'overflow-y-auto overflow-x-hidden p-5 space-y-4',
              showPreview ? 'flex-1 min-w-0' : 'w-full',
            )}
          >
            {/* Auto-normalize notice */}
            {autoNormalized && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    配置已自动修复
                  </p>
                  <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                    检测到配置缺少必要字段（如 openai-compatible provider 缺少 models
                    列表）。已自动补全，请点击「保存」写入磁盘并重启网关。
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveConfig}
                  disabled={!canSave}
                  className="shrink-0 gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                >
                  <Save className="w-3.5 h-3.5" />
                  立即保存
                </Button>
              </div>
            )}

            <ValidationBanner issues={validationIssues} />

            {/* Meta (read-only) */}
            {config?.meta && Object.keys(config.meta).length > 0 && (
              <FormSection title="元数据" description="配置文件版本信息（只读）">
                <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border text-xs">
                  {Object.entries(config.meta).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-4 px-3 py-2">
                      <span className="font-mono text-muted-foreground w-40 shrink-0">{k}</span>
                      <span className="font-mono text-foreground/80">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </FormSection>
            )}

            {/* Gateway */}
            <FormSection
              title="Gateway 网关"
              description="服务端口、认证方式与热重载策略"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const port = gw?.port ?? 18789;
                    const token = gw?.auth?.token ?? '';
                    const url = token
                      ? `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`
                      : `http://127.0.0.1:${port}/`;
                    window.open(url, '_blank');
                  }}
                  className="gap-1.5 text-xs text-primary hover:text-primary/80"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  打开 Dashboard
                </Button>
              }
            >
              <GatewayFields
                gw={gw}
                showGatewayToken={showGatewayToken}
                showGatewayPassword={showGatewayPassword}
                setShowGatewayToken={setShowGatewayToken}
                setShowGatewayPassword={setShowGatewayPassword}
                setGatewayPort={setGatewayPort}
                setGatewayAuthMode={setGatewayAuthMode}
                setGatewayAuthToken={setGatewayAuthToken}
                setGatewayAuthPassword={setGatewayAuthPassword}
                setGatewayReloadMode={setGatewayReloadMode}
              />
            </FormSection>

            <CanvasSection
              canvasHost={config?.canvasHost}
              setCanvasEnabled={setCanvasEnabled}
              setCanvasPort={setCanvasPort}
            />

            {/* Models */}
            <FormSection
              title="模型提供商 (models)"
              description="AI 模型网关，支持 Anthropic、OpenAI、Gemini、Bedrock 等，带故障转移的多账号轮换"
              action={
                <div className="flex items-center gap-2">
                  <SegmentedControl
                    value={config?.models?.mode ?? 'merge'}
                    options={[
                      { value: 'merge', label: '合并' },
                      { value: 'replace', label: '替换' },
                    ]}
                    onChange={(v) => setModelsMode(v as 'merge' | 'replace')}
                    compact
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProviderPickerOpen((p) => !p)}
                    className="gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加提供商
                  </Button>
                </div>
              }
            >
              {providerPickerOpen && (
                <ProviderPicker
                  existingProviders={config?.models?.providers ?? {}}
                  onAddFromPreset={addProviderFromPreset}
                  onAddCustom={addCustomProvider}
                  onClose={() => setProviderPickerOpen(false)}
                />
              )}

              {providerEntries.length > 0 && (
                <div className="space-y-2">
                  {providerEntries.map(([name, provider]) => (
                    <ProviderCard
                      key={name}
                      name={name}
                      provider={provider}
                      isExpanded={!!expandedProviders[name]}
                      isKeyVisible={!!showKeys[name]}
                      onToggle={() => toggleProvider(name)}
                      onToggleKey={() => toggleShowKey(name)}
                      onRemove={() => removeProvider(name)}
                      onUpdate={(patch) => updateProvider(name, patch)}
                      onAddModel={(model) => addProviderModel(name, model)}
                      onRemoveModel={(modelId) => removeProviderModel(name, modelId)}
                    />
                  ))}
                </div>
              )}

              {virtualProviderEntries.length > 0 && (
                <div className={cn('space-y-2', providerEntries.length > 0 && 'mt-2')}>
                  {virtualProviderEntries.map(([name, models]) => {
                    const key = `virtual:${name}`;
                    const preset = PROVIDER_PRESETS.find((p) => p.id === name);

                    return (
                      <VirtualProviderCard
                        key={key}
                        name={name}
                        models={models}
                        isExpanded={!!expandedProviders[key]}
                        preset={preset}
                        onToggle={() => toggleProvider(key)}
                        onPromoteToFormal={() => preset && addProviderFromPreset(preset)}
                      />
                    );
                  })}
                </div>
              )}

              {providerEntries.length === 0 &&
                virtualProviderEntries.length === 0 &&
                !providerPickerOpen && (
                  <EmptySlot message="暂无提供商配置，点击右上角「添加提供商」" />
                )}
            </FormSection>

            <AgentsSection
              config={config}
              setAgentWorkspace={setAgentWorkspace}
              setContextPruningMode={setContextPruningMode}
              setAgentDefaultModel={setAgentDefaultModel}
              addAgentModelEntry={addAgentModelEntry}
              updateAgentModelEntry={updateAgentModelEntry}
              removeAgentModelEntry={removeAgentModelEntry}
            />

            <WhatsAppSection
              config={config}
              setWaGroupPolicy={setWaGroupPolicy}
              setWaAllowFrom={setWaAllowFrom}
              setWaRequireMention={setWaRequireMention}
            />

            {/* Message Rules */}
            <FormSection
              title="消息规则 (messages)"
              description="群聊中触发 Pi 智能体响应的 @ 关键词列表"
            >
              <TagInput
                values={config?.messages?.groupChat?.mentionPatterns ?? []}
                onChange={setMentionPatterns}
                placeholder="@openclaw，按 Enter 添加"
              />
            </FormSection>

            <EnvVarsSection
              entries={envEntries}
              onSetEnvVar={setEnvVar}
              onAdd={addEnvVar}
              onRemove={removeEnvVar}
            />

            <div className="h-3" />
          </div>

          {/* Drag handle */}
          {showPreview && (
            <div
              onMouseDown={(e) => {
                isDragging.current = true;
                dragStartX.current = e.clientX;
                dragStartWidth.current = panelWidth;
                e.preventDefault();
              }}
              className="shrink-0 w-1 hover:w-1.5 bg-border hover:bg-primary/50 cursor-col-resize transition-all duration-150 flex items-center justify-center group relative"
            >
              <GripVertical className="w-3 h-6 text-muted-foreground/30 group-hover:text-primary/50 absolute transition-colors" />
            </div>
          )}

          {/* JSON editor panel */}
          {showPreview && (
            <div
              style={{ width: panelWidth, background: '#1e1e2e' }}
              className="shrink-0 flex flex-col overflow-hidden border-l border-border"
            >
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/8 shrink-0 select-none bg-black/20">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                </div>
                <span className="text-[11px] text-zinc-400 font-mono flex-1">openclaw.json</span>
                {isDirty && (
                  <span className="text-[10px] text-amber-400/80 font-mono">• 未保存</span>
                )}
                {jsonError && (
                  <span className="flex items-center gap-1 text-[10px] text-red-400 font-mono">
                    <AlertCircle className="w-3 h-3" />
                    格式错误
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
                <CodeMirrorEditor
                  value={jsonText}
                  extensions={[jsonLang()]}
                  theme={oneDark}
                  onChange={handleJsonChange}
                  onFocus={() => {
                    editorFocused.current = true;
                  }}
                  onBlur={() => {
                    editorFocused.current = false;
                  }}
                  height="100%"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                    autocompletion: false,
                    bracketMatching: true,
                  }}
                  style={{ height: '100%', fontSize: '12px' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Restart log panel */}
        {restartLog?.visible && (
          <div className="shrink-0 border-t border-zinc-700/60 bg-zinc-950 text-zinc-100 font-mono text-[11px] animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/80">
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </span>
                <span className="text-zinc-400 text-[10px] tracking-wide">
                  openclaw gateway restart
                </span>
                <span
                  className={cn(
                    'ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold',
                    restartLog.success
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400',
                  )}
                >
                  {restartLog.success ? '✓ 成功' : '✕ 失败'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setRestartLog(restartLog ? { ...restartLog, visible: false } : null)}
                className="text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 h-6 w-6"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <pre className="px-4 py-3 max-h-40 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all text-zinc-300">
              {restartLog.output
                ? restartLog.output.split('\n').map((line, i) => {
                    const isErr =
                      /error|invalid|failed|problem/i.test(line) && !line.includes('best-effort');
                    const isOk = /success|started|ready|running|restarted/i.test(line);

                    return (
                      <span
                        key={i}
                        className={isErr ? 'text-red-400' : isOk ? 'text-emerald-400' : ''}
                      >
                        {line}
                        {'\n'}
                      </span>
                    );
                  })
                : '（无输出）'}
            </pre>
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-border flex items-center justify-between bg-card/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 h-8 min-w-0 flex-1 mr-4">
            {saveStatus === 'reloading' && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                已写入文件，正在重启网关…
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                已保存，配置已生效
              </span>
            )}
            {saveStatus === 'saved-no-gateway' && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                已保存（网关未运行）
                <button
                  onClick={async () => {
                    const cmd = await window.api.restartGateway();
                    const out = (cmd.output ?? '').trim();
                    setRestartLog({
                      output: cmd.success
                        ? `✓ ${out || '网关已启动'}`
                        : `✗ 启动失败:\n${out}\n\n请在终端手动运行: openclaw gateway start`,
                      success: cmd.success,
                      visible: true,
                    });
                  }}
                  className="ml-1 underline underline-offset-2 hover:opacity-80 transition"
                >
                  点击启动
                </button>
              </span>
            )}
            {saveStatus === 'error' && errorMsg && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5" />
                {errorMsg}
              </span>
            )}
            {saveStatus === 'idle' && isDirty && hasErrors && (
              <span className="flex items-center gap-1.5 text-xs text-destructive truncate">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                有错误需修复后才能保存
              </span>
            )}
            {saveStatus === 'idle' && isDirty && !hasErrors && hasWarnings && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 truncate">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                有配置建议（不影响保存）
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => useConfigStore.getState().setConfig(savedConfig)}
              disabled={!isDirty || loading}
            >
              撤销更改
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    onClick={handleSaveConfig}
                    disabled={!canSave}
                    className="gap-1.5 min-w-[76px]"
                  >
                    {saveStatus === 'saving' || saveStatus === 'reloading' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    保存
                  </Button>
                </span>
              </TooltipTrigger>
              {hasErrors && (
                <TooltipContent side="top">
                  <p className="text-xs">
                    {validationIssues
                      .filter((i) => i.type === 'error')
                      .map((i) => i.message)
                      .join('\n')}
                  </p>
                </TooltipContent>
              )}
              {!hasErrors && !canSave && (
                <TooltipContent side="top">
                  <p className="text-xs">{!isDirty ? '暂无更改' : '正在处理…'}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
