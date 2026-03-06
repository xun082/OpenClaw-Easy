'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { json as jsonLang } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus,
  FolderOpen,
  GripVertical,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ModelOption } from '@/lib/openclaw-providers';
import { API_OPTIONS, PROVIDER_MODELS, PROVIDER_PRESETS } from '@/lib/openclaw-providers';
import type { SSHConn } from '@/lib/ssh-utils';
import { buildSshCmd } from '@/lib/ssh-utils';
import { cn } from '@/lib/utils';
import { useConfigPageStore } from '@/store/config-page-store';
import type { AgentModelConfig, OpenclawConfig } from '@/store/config-store';
import { EMPTY_CONFIG, normalizeConfig, useConfigStore } from '@/store/config-store';
import { selectActiveConn, useConnectionStore } from '@/store/connection-store';

import { EmptySlot } from './_components/EmptySlot';
import { FieldGroup } from './_components/FieldGroup';
import { FormSection } from './_components/FormSection';
import { ModelSelector } from './_components/ModelSelector';
import { SegmentedControl } from './_components/SegmentedControl';
import { TagInput } from './_components/TagInput';

// CodeMirror dynamically loaded — avoids SSR issues
const CodeMirrorEditor = dynamic(() => import('@uiw/react-codemirror'), { ssr: false });

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [mounted, setMounted] = useState(false);

  // ── Connection store ────────────────────────────────────────────────────────
  const sshConns = useConnectionStore((s) => s.connections);
  const selectedConnId = useConnectionStore((s) => s.selectedConnId);
  const setSelectedConnId = useConnectionStore((s) => s.setSelectedConnId);
  const activeConn = useConnectionStore(selectActiveConn);

  // ── Page UI store (Zustand — persistent layout + transient toggles) ─────────
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

  // ── Local transient state (not worth persisting) ────────────────────────────
  const [copied, setCopied] = useState(false);
  const [customProviderName, setCustomProviderName] = useState('');
  const [newAgentModelKey, setNewAgentModelKey] = useState('');
  const [newAgentModelAlias, setNewAgentModelAlias] = useState('');

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
      const script = `cat ~/.openclaw/openclaw.json 2>/dev/null || echo '__NOTFOUND__'`;
      const res = await window.api.executeCommand(buildSshCmd(conn, script));
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
  const canSave =
    !loading && isDirty && saveStatus !== 'saving' && saveStatus !== 'reloading' && !!config;

  // ── Virtual providers: derive from agents.defaults.models alias keys ─────────
  // e.g. "kimi-coding/k2p5" → virtual provider "kimi-coding" (has model catalog)
  const virtualProviderEntries = useMemo(() => {
    const aliasModelKeys = Object.keys(config?.agents?.defaults?.models ?? {});
    const formalProviders = config?.models?.providers ?? {};
    const seen = new Map<string, ModelOption[]>();

    for (const ak of aliasModelKeys) {
      const slash = ak.indexOf('/');

      if (slash > 0) {
        const pName = ak.slice(0, slash);

        if (!formalProviders[pName] && PROVIDER_MODELS[pName] && !seen.has(pName)) {
          seen.set(pName, PROVIDER_MODELS[pName]);
        }
      }
    }

    return [...seen.entries()]; // [["kimi-coding", [...]]]
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

  const addCustomProvider = () => {
    const n = customProviderName.trim();
    if (!n) return;
    addProvider(n, { baseUrl: '', api: 'anthropic-messages', apiKey: '', authHeader: true });
    setExpandedProviders((prev) => ({ ...prev, [n]: true }));
    setCustomProviderName('');
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
  const envEntries = Object.entries(config?.env ?? {});

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
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="端口 (port)" hint="也可通过 OPENCLAW_GATEWAY_PORT 覆盖">
                    <Input
                      type="number"
                      value={gw?.port ?? 18789}
                      onChange={(e) => setGatewayPort(Number(e.target.value))}
                      placeholder="18789"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="热重载模式 (reload.mode)"
                    hint="hybrid：安全变更热应用，关键变更时重启；off：禁用"
                  >
                    <SegmentedControl
                      value={gw?.reload?.mode ?? 'hybrid'}
                      options={[
                        { value: 'hybrid', label: '混合热重载' },
                        { value: 'off', label: '禁用' },
                      ]}
                      onChange={(v) => setGatewayReloadMode(v as 'hybrid' | 'off')}
                    />
                  </FieldGroup>
                </div>

                <FieldGroup
                  label="认证模式 (auth.mode)"
                  hint="本地使用推荐「无认证」；对外暴露时选 Token 或 Password"
                >
                  <SegmentedControl
                    value={gw?.auth?.mode ?? 'none'}
                    options={[
                      { value: 'none', label: '无认证' },
                      { value: 'token', label: 'Token' },
                      { value: 'password', label: 'Password' },
                      { value: 'trusted-proxy', label: 'Trusted Proxy' },
                    ]}
                    onChange={(v) =>
                      setGatewayAuthMode(v as 'none' | 'token' | 'password' | 'trusted-proxy')
                    }
                  />
                </FieldGroup>

                {gw?.auth?.mode === 'token' && (
                  <FieldGroup
                    label="认证令牌 (auth.token)"
                    hint="或设置 OPENCLAW_GATEWAY_TOKEN 环境变量"
                  >
                    <div className="relative">
                      <Input
                        type={showGatewayToken ? 'text' : 'password'}
                        value={gw?.auth?.token ?? ''}
                        onChange={(e) => setGatewayAuthToken(e.target.value)}
                        placeholder="向导自动生成或手动填写"
                        className="pr-9 font-mono"
                      />
                      <button
                        onClick={() => setShowGatewayToken((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                      >
                        {showGatewayToken ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </FieldGroup>
                )}

                {gw?.auth?.mode === 'password' && (
                  <FieldGroup
                    label="认证密码 (auth.password)"
                    hint="客户端 connect.params.auth.password 中携带"
                  >
                    <div className="relative">
                      <Input
                        type={showGatewayPassword ? 'text' : 'password'}
                        value={gw?.auth?.password ?? ''}
                        onChange={(e) => setGatewayAuthPassword(e.target.value)}
                        placeholder="客户端连接时携带"
                        className="pr-9 font-mono"
                      />
                      <button
                        onClick={() => setShowGatewayPassword((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                      >
                        {showGatewayPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </FieldGroup>
                )}
              </div>
            </FormSection>

            {/* Canvas */}
            <FormSection
              title="Canvas 服务 (canvasHost)"
              description="为 ~/.openclaw/workspace/canvas 提供 HTTP 文件服务，默认端口 gateway.port + 4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between py-0.5">
                  <div>
                    <p className="text-sm font-medium">启用 Canvas 服务</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      可设置 OPENCLAW_SKIP_CANVAS_HOST=1 全局禁用
                    </p>
                  </div>
                  <Switch
                    checked={config?.canvasHost?.enabled !== false}
                    onCheckedChange={setCanvasEnabled}
                  />
                </div>
                {config?.canvasHost?.enabled !== false && (
                  <FieldGroup
                    label="端口 (port)"
                    hint={`访问路径：http://127.0.0.1:${config?.canvasHost?.port ?? 18793}/__openclaw__/canvas/`}
                  >
                    <Input
                      type="number"
                      value={config?.canvasHost?.port ?? 18793}
                      onChange={(e) => setCanvasPort(Number(e.target.value))}
                      placeholder="18793"
                    />
                  </FieldGroup>
                )}
              </div>
            </FormSection>

            {/* ── Models section ─────────────────────────────────────────── */}
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
              {/* Provider picker */}
              {providerPickerOpen && (
                <div className="mb-3 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                    <p className="text-xs font-semibold">选择提供商模板</p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setProviderPickerOpen(false);
                        setCustomProviderName('');
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="p-3 grid grid-cols-3 gap-2">
                    {PROVIDER_PRESETS.map((preset) => {
                      const already = !!config?.models?.providers?.[preset.id];

                      return (
                        <button
                          key={preset.id}
                          onClick={() => !already && addProviderFromPreset(preset)}
                          disabled={already}
                          className={cn(
                            'flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all',
                            already
                              ? 'border-border bg-muted/30 opacity-50 cursor-not-allowed'
                              : 'border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer',
                          )}
                        >
                          <div
                            className="w-6 h-6 rounded-md shrink-0 mt-0.5 flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ backgroundColor: preset.color }}
                          >
                            {preset.name[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight">{preset.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              {preset.description}
                            </p>
                            {already && (
                              <p className="text-[10px] text-emerald-500 mt-0.5">已添加</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-3 pb-3 pt-2 flex items-center gap-2 border-t border-border">
                    <Input
                      value={customProviderName}
                      onChange={(e) => setCustomProviderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addCustomProvider();

                        if (e.key === 'Escape') {
                          setProviderPickerOpen(false);
                          setCustomProviderName('');
                        }
                      }}
                      placeholder="自定义名称（如 my-proxy）"
                      className="flex-1 font-mono text-xs h-8"
                    />
                    <Button
                      size="sm"
                      onClick={addCustomProvider}
                      disabled={!customProviderName.trim()}
                    >
                      添加自定义
                    </Button>
                  </div>
                </div>
              )}

              {/* Formal providers */}
              {providerEntries.length > 0 && (
                <div className="space-y-2">
                  {providerEntries.map(([name, provider]) => {
                    const isExpanded = !!expandedProviders[name];
                    const isKeyVisible = !!showKeys[name];

                    return (
                      <div
                        key={name}
                        className="rounded-xl border border-border bg-card overflow-hidden"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleProvider(name)}
                          onKeyDown={(e) => e.key === 'Enter' && toggleProvider(name)}
                          className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition select-none"
                        >
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="flex-1 text-sm font-semibold font-mono">{name}</span>
                          {Array.isArray(provider.models) && provider.models.length > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700 mr-1"
                            >
                              {provider.models.length} 模型
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground font-mono mr-1">
                            {provider.api}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeProvider(name);
                            }}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                        </div>

                        {isExpanded && (
                          <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/10">
                            <div className="grid grid-cols-2 gap-3">
                              <FieldGroup label="Base URL">
                                <Input
                                  value={provider.baseUrl}
                                  onChange={(e) =>
                                    updateProvider(name, { baseUrl: e.target.value })
                                  }
                                  placeholder="http://127.0.0.1:8080/api"
                                  className="font-mono"
                                />
                              </FieldGroup>
                              <FieldGroup label="API 类型">
                                <Select
                                  value={provider.api}
                                  onValueChange={(v) => updateProvider(name, { api: v })}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {API_OPTIONS.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FieldGroup>
                            </div>
                            <FieldGroup label="API Key">
                              <div className="relative">
                                <Input
                                  type={isKeyVisible ? 'text' : 'password'}
                                  value={provider.apiKey}
                                  onChange={(e) => updateProvider(name, { apiKey: e.target.value })}
                                  placeholder="sk-..."
                                  className="font-mono pr-9"
                                />
                                <button
                                  onClick={() => toggleShowKey(name)}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                                >
                                  {isKeyVisible ? (
                                    <EyeOff className="w-3.5 h-3.5" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </FieldGroup>
                            <div className="flex items-center justify-between py-0.5">
                              <div>
                                <p className="text-sm font-medium">Auth Header</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  通过 Authorization 请求头传递 API Key
                                </p>
                              </div>
                              <Switch
                                checked={!!provider.authHeader}
                                onCheckedChange={(v) => updateProvider(name, { authHeader: v })}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Virtual providers (alias-based, env-var driven) ─────── */}
              {virtualProviderEntries.length > 0 && (
                <div className={cn('space-y-2', providerEntries.length > 0 && 'mt-2')}>
                  {virtualProviderEntries.map(([name, models]) => {
                    const key = `virtual:${name}`;
                    const isExpanded = !!expandedProviders[key];
                    const preset = PROVIDER_PRESETS.find((p) => p.id === name);

                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-sky-200/70 dark:border-sky-800/50 bg-sky-50/40 dark:bg-sky-950/20 overflow-hidden"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleProvider(key)}
                          onKeyDown={(e) => e.key === 'Enter' && toggleProvider(key)}
                          className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-sky-100/50 dark:hover:bg-sky-900/20 transition select-none"
                        >
                          <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          <span className="flex-1 text-sm font-semibold font-mono text-foreground">
                            {name}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] text-sky-600 border-sky-300 dark:text-sky-400 dark:border-sky-700 mr-1"
                          >
                            env var
                          </Badge>
                          <span className="text-[11px] text-sky-500/70 font-mono mr-1">
                            {models.length} 模型
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!preset) return;
                              addProviderFromPreset(preset);
                            }}
                            className="text-[11px] text-sky-600 hover:text-sky-700 hover:bg-sky-100 dark:text-sky-400 dark:hover:bg-sky-900/30 h-6 px-2"
                          >
                            <Plus className="w-3 h-3 mr-0.5" />
                            转为正式提供商
                          </Button>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-sky-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-sky-400 shrink-0" />
                          )}
                        </div>

                        {isExpanded && (
                          <div className="border-t border-sky-200/50 dark:border-sky-800/40 px-4 py-3 space-y-3 bg-sky-50/20 dark:bg-sky-950/10">
                            <p className="text-[11px] text-sky-600 dark:text-sky-400 leading-relaxed">
                              此提供商通过环境变量接入（如{' '}
                              <code className="font-mono bg-sky-100 dark:bg-sky-900/40 px-1 rounded">
                                KIMI_API_KEY
                              </code>
                              ），无需在此配置 API Key，模型目录仅供参考。
                              点击「转为正式提供商」可升级为完整配置项。
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {models.map((m) => (
                                <div
                                  key={m.id}
                                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-sky-100/50 dark:bg-sky-900/20 border border-sky-200/50 dark:border-sky-800/30"
                                >
                                  <span className="text-[11px] font-mono text-foreground flex-1 truncate">
                                    {m.id}
                                  </span>
                                  {m.desc && (
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                      {m.desc}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state — only when truly nothing to show */}
              {providerEntries.length === 0 &&
                virtualProviderEntries.length === 0 &&
                !providerPickerOpen && (
                  <EmptySlot message="暂无提供商配置，点击右上角「添加提供商」" />
                )}
            </FormSection>

            {/* Agents Defaults */}
            <FormSection
              title="智能体默认值 (agents.defaults)"
              description="Pi 智能体会话的工作目录与上下文裁剪策略（pi-coding-agent 集成）"
            >
              <div className="space-y-3">
                <FieldGroup
                  label="工作目录 (workspace)"
                  hint="Pi 智能体的 cwd；--dev 模式下默认为 ~/.openclaw/workspace-dev"
                >
                  <Input
                    value={config?.agents?.defaults?.workspace ?? ''}
                    onChange={(e) => setAgentWorkspace(e.target.value)}
                    placeholder="~/.openclaw/workspace"
                    className="font-mono"
                  />
                </FieldGroup>

                <FieldGroup
                  label="上下文裁剪模式 (contextPruning.mode)"
                  hint="cache-ttl：基于缓存 TTL 自动裁剪上下文窗口，减少 token 消耗"
                >
                  <SegmentedControl
                    value={config?.agents?.defaults?.contextPruning?.mode ?? 'off'}
                    options={[
                      { value: 'off', label: '关闭' },
                      { value: 'cache-ttl', label: 'cache-ttl' },
                    ]}
                    onChange={(v) => setContextPruningMode(v as 'cache-ttl' | 'off')}
                    compact
                  />
                </FieldGroup>

                <FieldGroup label="默认模型 (model.primary)">
                  <ModelSelector
                    value={config?.agents?.defaults?.model?.primary ?? ''}
                    providers={config?.models?.providers ?? {}}
                    aliasKeys={Object.keys(config?.agents?.defaults?.models ?? {})}
                    onChange={setAgentDefaultModel}
                  />
                </FieldGroup>

                {/* Agent model aliases */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>模型别名 (models)</Label>
                    <span className="text-[10px] text-muted-foreground/60">
                      为 provider/modelId 设置别名，Kimi Coding 必填
                    </span>
                  </div>
                  {Object.entries(config?.agents?.defaults?.models ?? {}).length > 0 && (
                    <div className="space-y-2 mb-2">
                      {Object.entries(config?.agents?.defaults?.models ?? {}).map(
                        ([key, cfg]: [string, AgentModelConfig]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="h-9 flex items-center px-3 rounded-lg border border-border bg-muted/30 text-muted-foreground text-xs font-mono flex-1 select-all overflow-hidden">
                              {key}
                            </span>
                            <span className="text-muted-foreground text-sm shrink-0">→</span>
                            <Input
                              value={cfg.alias ?? ''}
                              onChange={(e) =>
                                updateAgentModelEntry(key, { alias: e.target.value })
                              }
                              placeholder="别名（如 Kimi K2.5）"
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeAgentModelEntry(key)}
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newAgentModelKey}
                      onChange={(e) => setNewAgentModelKey(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newAgentModelKey.trim()) {
                          addAgentModelEntry(newAgentModelKey.trim(), newAgentModelAlias.trim());
                          setNewAgentModelKey('');
                          setNewAgentModelAlias('');
                        }
                      }}
                      placeholder="provider/modelId（如 kimi-coding/k2p5）"
                      className="flex-1 font-mono text-xs"
                    />
                    <Input
                      value={newAgentModelAlias}
                      onChange={(e) => setNewAgentModelAlias(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newAgentModelKey.trim()) {
                          addAgentModelEntry(newAgentModelKey.trim(), newAgentModelAlias.trim());
                          setNewAgentModelKey('');
                          setNewAgentModelAlias('');
                        }
                      }}
                      placeholder="别名"
                      className="w-36"
                    />
                    <Button
                      size="icon-sm"
                      onClick={() => {
                        if (!newAgentModelKey.trim()) return;
                        addAgentModelEntry(newAgentModelKey.trim(), newAgentModelAlias.trim());
                        setNewAgentModelKey('');
                        setNewAgentModelAlias('');
                      }}
                      disabled={!newAgentModelKey.trim()}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                    示例：key = <code className="font-mono">kimi-coding/k2p5</code>，别名 = Kimi
                    K2.5。Kimi Coding 订阅用户可在「环境变量」里设置 KIMI_API_KEY 并在此处添加
                    alias，或直接在上方「模型提供商」中添加 Kimi Code 提供商。
                  </p>
                </div>
              </div>
            </FormSection>

            {/* WhatsApp */}
            <FormSection
              title="渠道 - WhatsApp"
              description="WhatsApp 消息渠道的接入白名单与群组触发规则"
            >
              <div className="space-y-3">
                <FieldGroup
                  label="群组策略 (groupPolicy)"
                  hint="open：允许所有群组消息；allowlist：仅允许 allowFrom 白名单中的号码"
                >
                  <SegmentedControl
                    value={config?.channels?.whatsapp?.groupPolicy ?? 'open'}
                    options={[
                      { value: 'open', label: '开放（open）' },
                      { value: 'allowlist', label: '白名单（allowlist）' },
                    ]}
                    onChange={(v) => setWaGroupPolicy(v as 'open' | 'allowlist')}
                  />
                </FieldGroup>

                <FieldGroup
                  label="允许的号码白名单 (allowFrom)"
                  hint="填写国际格式号码；仅在群组策略为「白名单」时生效"
                >
                  <TagInput
                    values={config?.channels?.whatsapp?.allowFrom ?? []}
                    onChange={setWaAllowFrom}
                    placeholder="+8613800138000，按 Enter 添加，留空允许所有来源"
                  />
                </FieldGroup>

                <div className="flex items-center justify-between py-2 px-4 rounded-lg border border-border bg-muted/20">
                  <div>
                    <p className="text-sm font-medium">群组消息需要 @ 提及</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      groups[&quot;*&quot;].requireMention — 群聊须 @openclaw 才触发智能体
                    </p>
                  </div>
                  <Switch
                    checked={config?.channels?.whatsapp?.groups?.['*']?.requireMention !== false}
                    onCheckedChange={setWaRequireMention}
                  />
                </div>
              </div>
            </FormSection>

            {/* Message Rules */}
            <FormSection
              title="消息规则 (messages)"
              description="群聊中触发 Pi 智能体响应的 @ 关键词列表"
            >
              <FieldGroup
                label="群聊触发词 (groupChat.mentionPatterns)"
                hint="群聊消息包含以下任一词时触发智能体响应"
              >
                <TagInput
                  values={config?.messages?.groupChat?.mentionPatterns ?? []}
                  onChange={setMentionPatterns}
                  placeholder="@openclaw，按 Enter 添加"
                />
              </FieldGroup>
            </FormSection>

            {/* Env Vars */}
            <FormSection
              title="环境变量 (env)"
              description="注入到 Gateway 网关运行环境的 KEY=VALUE 键值对"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addEnvVar}
                  className="gap-1 text-xs text-primary hover:text-primary/80"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加变量
                </Button>
              }
            >
              {envEntries.length === 0 ? (
                <EmptySlot message="暂无环境变量，点击右上角「添加变量」" />
              ) : (
                <div className="space-y-2">
                  {envEntries.map(([key, value], idx) => (
                    <div key={`${key}-${idx}`} className="flex items-center gap-2">
                      <Input
                        value={key}
                        onChange={(e) => setEnvVar(key, e.target.value, value)}
                        placeholder="KEY_NAME"
                        className="flex-1 font-mono"
                      />
                      <span className="text-muted-foreground text-sm select-none">=</span>
                      <Input
                        value={value}
                        onChange={(e) => setEnvVar(key, key, e.target.value)}
                        placeholder="value"
                        className="flex-1 font-mono"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeEnvVar(key)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

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
          <div className="flex items-center gap-2 h-8">
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
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => useConfigStore.getState().setConfig(savedConfig)}
              disabled={!isDirty || loading}
            >
              撤销更改
            </Button>
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
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
