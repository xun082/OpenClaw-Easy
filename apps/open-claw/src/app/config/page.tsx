'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Save,
  RefreshCw,
  FilePlus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
  Copy,
  Check,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Code2,
  X,
  Monitor,
  Server,
} from 'lucide-react';

import {
  API_OPTIONS,
  PROVIDER_PRESETS,
  PROVIDER_MODELS,
  resolveModelListKey,
} from '@/lib/openclaw-providers';
import type { ProviderConfig, ModelOption } from '@/lib/openclaw-providers';
import {
  useConfigStore,
  autoSelectModel,
  normalizeConfig,
  EMPTY_CONFIG,
} from '@/store/config-store';
import type { OpenclawConfig } from '@/store/config-store';
import { useConnectionStore, selectActiveConn } from '@/store/connection-store';
import { buildSshCmd } from '@/lib/ssh-utils';
import type { SSHConn } from '@/lib/ssh-utils';

// ─── Style helpers ────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition';

const labelCls = 'text-[11px] font-medium text-muted-foreground block mb-1.5';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [mounted, setMounted] = useState(false);

  // ── Connection source (global store) ──────────────────────────────────────
  const sshConns = useConnectionStore((s) => s.connections);
  const selectedConnId = useConnectionStore((s) => s.selectedConnId);
  const setSelectedConnId = useConnectionStore((s) => s.setSelectedConnId);
  const activeConn = useConnectionStore(selectActiveConn);

  // ── UI-only state ──────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [showGatewayToken, setShowGatewayToken] = useState(false);
  const [showGatewayPassword, setShowGatewayPassword] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [customProviderName, setCustomProviderName] = useState('');

  // ── Store ──────────────────────────────────────────────────────────────────
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
    // Mutation helpers
    setGatewayPort,
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
    setWaAllowFrom,
    setWaRequireMention,
    setMentionPatterns,
    setEnvVar,
    addEnvVar,
    removeEnvVar,
  } = useConfigStore();

  // ── Fix Cmd+A / Ctrl+A select-all in all input / textarea elements ─────────
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

  // ── Remote config helpers ──────────────────────────────────────────────────

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

          const providers = Object.keys(parsed?.models?.providers ?? {});
          if (providers[0]) setExpandedProviders({ [providers[0]]: true });
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

    const json = JSON.stringify(config, null, 2);
    const b64json = btoa(unescape(encodeURIComponent(json)));
    const script = `mkdir -p ~/.openclaw && echo '${b64json}' | base64 -d > ~/.openclaw/openclaw.json && echo "SAVED" || echo "FAILED"`;

    useConfigStore.setState({ saveStatus: 'saving', errorMsg: '' });

    try {
      const res = await window.api.executeCommand(buildSshCmd(conn, script));
      const out = (res.output ?? '').trim();

      if (out.includes('SAVED') || res.success) {
        useConfigStore.setState({ savedConfig: config, exists: true, saveStatus: 'reloading' });

        const restartScript = `systemctl restart openclaw-gateway 2>/dev/null && echo "RESTARTED" || echo "NO_SERVICE"`;
        const rRes = await window.api.executeCommand(buildSshCmd(conn, restartScript));
        const rOut = (rRes.output ?? '').trim();

        useConfigStore.setState({
          saveStatus: rOut.includes('RESTARTED') ? 'saved' : 'saved-no-gateway',
          restartLog: {
            output: rOut.includes('RESTARTED')
              ? `✓ 远端 ${conn.host} 配置已保存，网关已重启`
              : `✓ 配置已保存至 ${conn.host}（远端网关服务未运行，可在 SSH 部署页手动重启）`,
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

  // ── Active source load/save ────────────────────────────────────────────────

  const handleLoadConfig = () => {
    if (!activeConn) {
      loadConfig().then(() => {
        const providers = Object.keys(useConfigStore.getState().config?.models?.providers ?? {});
        if (providers[0])
          setExpandedProviders((prev) =>
            Object.keys(prev).length ? prev : { [providers[0]]: true },
          );
      });
    } else {
      void loadRemoteConfig(activeConn);
    }
  };

  const handleSaveConfig = () => {
    if (!activeConn) {
      saveConfig();
    } else {
      void saveRemoteConfig(activeConn);
    }
  };

  // ── Mount + initial load ───────────────────────────────────────────────────

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    handleLoadConfig();
  }, [mounted, selectedConnId]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const configJson = useMemo(() => (config ? JSON.stringify(config, null, 2) : ''), [config]);
  const savedConfigJson = useMemo(
    () => (savedConfig ? JSON.stringify(savedConfig, null, 2) : ''),
    [savedConfig],
  );
  const isDirty = configJson !== savedConfigJson;
  const canSave =
    !loading && isDirty && saveStatus !== 'saving' && saveStatus !== 'reloading' && !!config;

  // ── Provider picker helpers ────────────────────────────────────────────────
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

  // ── Convenience aliases ────────────────────────────────────────────────────
  const gw = config?.gateway;
  const providerEntries = Object.entries(config?.models?.providers ?? {});
  const envEntries = Object.entries(config?.env ?? {});

  // ── Early render states ────────────────────────────────────────────────────

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
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">正在读取配置文件…</span>
        </div>
      </div>
    );
  }

  if (!exists && !config) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 p-8">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <FilePlus className="w-7 h-7 text-muted-foreground/60" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground mb-1.5">配置文件不存在</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
            未找到 <code className="font-mono">~/.openclaw/openclaw.json</code>，运行{' '}
            <code className="font-mono">openclaw onboard</code>{' '}
            可自动创建，或点击下方按钮使用默认模板。
          </p>
        </div>
        <button
          onClick={initWithEmpty}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
        >
          <FilePlus className="w-4 h-4" />
          使用默认模板
        </button>
      </div>
    );
  }

  // ── Main editor ────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Connection source selector ── */}
      <div className="shrink-0 flex items-center gap-1.5 px-6 py-2 border-b border-border bg-muted/20">
        <span className="text-xs text-muted-foreground shrink-0 mr-0.5">配置目标：</span>
        <button
          onClick={() => setSelectedConnId('local')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            selectedConnId === 'local'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Monitor className="w-3 h-3" />
          本地
        </button>
        {sshConns.map((conn) => (
          <button
            key={conn.id}
            onClick={() => setSelectedConnId(conn.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedConnId === conn.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Server className="w-3 h-3" />
            {conn.name || `${conn.username}@${conn.host}`}
          </button>
        ))}
        {sshConns.length === 0 && (
          <span className="text-xs text-muted-foreground/50 italic ml-1">
            （前往「安装与连接 → SSH 远程部署」添加远程服务器）
          </span>
        )}
        {selectedConnId !== 'local' && (
          <span className="ml-auto text-[11px] text-sky-500 font-medium">正在编辑远端配置</span>
        )}
      </div>

      {/* ── Header ── */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold text-foreground tracking-tight">配置文件</h1>
          {configPath && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
              <code className="text-[11px] font-mono text-muted-foreground truncate">
                {configPath}
              </code>
              <button
                onClick={handleCopyPath}
                className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowPreview((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-muted"
          >
            <Code2 className="w-3.5 h-3.5" />
            {showPreview ? '隐藏预览' : '显示预览'}
          </button>
          <button
            onClick={handleLoadConfig}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            重新加载
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Form panel — overflow-x-hidden prevents horizontal scroll */}
        <div
          className={`overflow-y-auto overflow-x-hidden p-6 space-y-7 ${showPreview ? 'flex-1 min-w-0' : 'w-full'}`}
        >
          {/* Meta (read-only) */}
          {config?.meta && Object.keys(config.meta).length > 0 && (
            <section>
              <SectionHeader title="元数据" description="配置文件的版本信息（只读）" />
              <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border">
                {Object.entries(config.meta).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-4 px-4 py-2.5">
                    <span className="font-mono text-xs text-muted-foreground w-48 shrink-0">
                      {k}
                    </span>
                    <span className="font-mono text-xs text-foreground/80">{String(v)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Gateway ── */}
          <section>
            <SectionHeader
              title="Gateway 网关"
              description="Gateway 服务的端口、认证令牌和热重载策略"
            />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>端口 (port)</label>
                  <input
                    type="number"
                    value={gw?.port ?? 18789}
                    onChange={(e) => setGatewayPort(Number(e.target.value))}
                    className={inputCls}
                    placeholder="18789"
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    也可通过 OPENCLAW_GATEWAY_PORT 或 --port 覆盖
                  </p>
                </div>
                <div>
                  <label className={labelCls}>热重载模式 (reload.mode)</label>
                  <SegmentedControl
                    value={gw?.reload?.mode ?? 'hybrid'}
                    options={[
                      { value: 'hybrid', label: '混合热重载' },
                      { value: 'off', label: '禁用' },
                    ]}
                    onChange={(v) => setGatewayReloadMode(v as 'hybrid' | 'off')}
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    hybrid：安全变更热应用，关键变更时重启；off：禁用热重载
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>认证令牌 (auth.token)</label>
                  <div className="relative">
                    <input
                      type={showGatewayToken ? 'text' : 'password'}
                      value={gw?.auth?.token ?? ''}
                      onChange={(e) => setGatewayAuthToken(e.target.value)}
                      placeholder="向导自动生成或手动填写"
                      className={`${inputCls} pr-9`}
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
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    或设置 OPENCLAW_GATEWAY_TOKEN 环境变量
                  </p>
                </div>
                <div>
                  <label className={labelCls}>认证密码 (auth.password)</label>
                  <div className="relative">
                    <input
                      type={showGatewayPassword ? 'text' : 'password'}
                      value={gw?.auth?.password ?? ''}
                      onChange={(e) => setGatewayAuthPassword(e.target.value)}
                      placeholder="与 token 二选一"
                      className={`${inputCls} pr-9`}
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
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    客户端 connect.params.auth.password 中携带
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Canvas Host ── */}
          <section>
            <SectionHeader
              title="Canvas 服务 (canvasHost)"
              description="为 ~/.openclaw/workspace/canvas 提供 HTTP 文件服务，默认端口 gateway.port + 4"
            />
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">启用 Canvas 服务</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    可设置 OPENCLAW_SKIP_CANVAS_HOST=1 全局禁用
                  </p>
                </div>
                <Toggle
                  checked={config?.canvasHost?.enabled !== false}
                  onChange={setCanvasEnabled}
                />
              </div>
              {config?.canvasHost?.enabled !== false && (
                <div>
                  <label className={labelCls}>端口 (port)</label>
                  <input
                    type="number"
                    value={config?.canvasHost?.port ?? 18793}
                    onChange={(e) => setCanvasPort(Number(e.target.value))}
                    className={inputCls}
                    placeholder="18793"
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    访问路径：http://127.0.0.1:{config?.canvasHost?.port ?? 18793}
                    /__openclaw__/canvas/
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Models ── */}
          <section>
            <SectionHeader
              title="模型提供商 (models)"
              description="AI 模型网关，支持 Anthropic、OpenAI、Gemini、Bedrock 等，带故障转移的多账号轮换"
              action={
                <div className="flex items-center gap-2">
                  <SegmentedControl
                    value={config?.models?.mode ?? 'merge'}
                    options={[
                      { value: 'merge', label: '合并模式' },
                      { value: 'replace', label: '替换模式' },
                    ]}
                    onChange={(v) => setModelsMode(v as 'merge' | 'replace')}
                  />
                  <button
                    onClick={() => setProviderPickerOpen((p) => !p)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2.5 py-1 rounded-lg hover:bg-primary/10 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加提供商
                  </button>
                </div>
              }
            />

            {/* Provider picker */}
            {providerPickerOpen && (
              <div className="mb-3 rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p className="text-xs font-semibold text-foreground">选择提供商</p>
                  <button
                    onClick={() => {
                      setProviderPickerOpen(false);
                      setCustomProviderName('');
                    }}
                    className="text-muted-foreground hover:text-foreground transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-3 grid grid-cols-3 gap-2">
                  {PROVIDER_PRESETS.map((preset) => {
                    const alreadyAdded = !!config?.models?.providers?.[preset.id];

                    return (
                      <button
                        key={preset.id}
                        onClick={() => !alreadyAdded && addProviderFromPreset(preset)}
                        disabled={alreadyAdded}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                          alreadyAdded
                            ? 'border-border bg-muted/30 opacity-50 cursor-not-allowed'
                            : 'border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer'
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded-md shrink-0 mt-0.5 flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: preset.color }}
                        >
                          {preset.name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground leading-tight">
                            {preset.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                            {preset.description}
                          </p>
                          {alreadyAdded && (
                            <p className="text-[10px] text-emerald-500 mt-0.5">已添加</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="px-3 pb-3 flex items-center gap-2 border-t border-border pt-3">
                  <input
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
                    className={`${inputCls} flex-1 font-mono text-xs`}
                  />
                  <button
                    onClick={addCustomProvider}
                    disabled={!customProviderName.trim()}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition disabled:opacity-40"
                  >
                    添加自定义
                  </button>
                </div>
              </div>
            )}

            {providerEntries.length === 0 && !providerPickerOpen ? (
              <EmptySlot message="暂无提供商配置，点击右上角添加" />
            ) : (
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
                        onClick={() =>
                          setExpandedProviders((prev) => ({ ...prev, [name]: !prev[name] }))
                        }
                        onKeyDown={(e) =>
                          e.key === 'Enter' &&
                          setExpandedProviders((prev) => ({ ...prev, [name]: !prev[name] }))
                        }
                        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition select-none"
                      >
                        <div className="w-2 h-2 rounded-full bg-emerald-500/80 shrink-0" />
                        <span className="flex-1 text-sm font-semibold font-mono text-foreground">
                          {name}
                        </span>
                        {Array.isArray(provider.models) && provider.models.length > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mr-1">
                            {provider.models.length} 模型
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground font-mono mr-2">
                          {provider.api}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeProvider(name);
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/10">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={labelCls}>Base URL</label>
                              <input
                                value={provider.baseUrl}
                                onChange={(e) => updateProvider(name, { baseUrl: e.target.value })}
                                placeholder="http://127.0.0.1:8080/api"
                                className={`${inputCls} font-mono`}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>API 类型</label>
                              <select
                                value={provider.api}
                                onChange={(e) => updateProvider(name, { api: e.target.value })}
                                className={inputCls}
                              >
                                {API_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className={labelCls}>API Key</label>
                            <div className="relative">
                              <input
                                type={isKeyVisible ? 'text' : 'password'}
                                value={provider.apiKey}
                                onChange={(e) => updateProvider(name, { apiKey: e.target.value })}
                                placeholder="sk-..."
                                className={`${inputCls} font-mono pr-9`}
                              />
                              <button
                                onClick={() =>
                                  setShowKeys((prev) => ({ ...prev, [name]: !prev[name] }))
                                }
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                              >
                                {isKeyVisible ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between py-0.5">
                            <div>
                              <p className="text-sm font-medium text-foreground">Auth Header</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                通过 Authorization 请求头传递 API Key
                              </p>
                            </div>
                            <Toggle
                              checked={!!provider.authHeader}
                              onChange={(v) => updateProvider(name, { authHeader: v })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Agents Defaults ── */}
          <section>
            <SectionHeader
              title="智能体默认值 (agents.defaults)"
              description="Pi 智能体会话的工作目录与上下文裁剪策略（pi-coding-agent 集成）"
            />
            <div className="space-y-3">
              <div>
                <label className={labelCls}>工作目录 (workspace)</label>
                <input
                  value={config?.agents?.defaults?.workspace ?? ''}
                  onChange={(e) => setAgentWorkspace(e.target.value)}
                  placeholder="~/.openclaw/workspace"
                  className={`${inputCls} font-mono`}
                />
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  Pi 智能体的 cwd；--dev 模式下默认为 ~/.openclaw/workspace-dev
                </p>
              </div>
              <div>
                <label className={labelCls}>上下文裁剪模式 (contextPruning.mode)</label>
                <SegmentedControl
                  value={config?.agents?.defaults?.contextPruning?.mode ?? 'off'}
                  options={[
                    { value: 'off', label: '关闭' },
                    { value: 'cache-ttl', label: 'cache-ttl' },
                  ]}
                  onChange={(v) => setContextPruningMode(v as 'cache-ttl' | 'off')}
                  className="w-48"
                />
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  cache-ttl：基于缓存 TTL 自动裁剪上下文窗口，减少 token 消耗
                </p>
              </div>
              <div>
                <label className={labelCls}>默认模型 (model.primary)</label>
                <ModelSelector
                  value={config?.agents?.defaults?.model?.primary ?? ''}
                  providers={config?.models?.providers ?? {}}
                  onChange={setAgentDefaultModel}
                />
              </div>
            </div>
          </section>

          {/* ── WhatsApp Channel ── */}
          <section>
            <SectionHeader
              title="渠道 - WhatsApp"
              description="WhatsApp 消息渠道的接入白名单与群组触发规则"
            />
            <div className="space-y-3">
              <div>
                <label className={labelCls}>允许的号码白名单 (allowFrom)</label>
                <TagInput
                  values={config?.channels?.whatsapp?.allowFrom ?? []}
                  onChange={setWaAllowFrom}
                  placeholder="+8613800138000，按 Enter 添加，留空允许所有来源"
                />
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  填写国际格式号码；留空列表表示允许所有来源
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">群组消息需要 @ 提及</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      groups[&quot;*&quot;].requireMention — 群聊须 @openclaw 才触发智能体
                    </p>
                  </div>
                  <Toggle
                    checked={config?.channels?.whatsapp?.groups?.['*']?.requireMention !== false}
                    onChange={setWaRequireMention}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Message Rules ── */}
          <section>
            <SectionHeader
              title="消息规则 (messages)"
              description="群聊中触发 Pi 智能体响应的 @ 关键词列表"
            />
            <div>
              <label className={labelCls}>群聊触发词 (groupChat.mentionPatterns)</label>
              <TagInput
                values={config?.messages?.groupChat?.mentionPatterns ?? []}
                onChange={setMentionPatterns}
                placeholder="@openclaw，按 Enter 添加"
              />
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                群聊消息包含以下任一词时触发智能体响应
              </p>
            </div>
          </section>

          {/* ── Env Vars ── */}
          <section>
            <SectionHeader
              title="环境变量 (env)"
              description="注入到 Gateway 网关运行环境的 KEY=VALUE 键值对"
              action={
                <button
                  onClick={addEnvVar}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2.5 py-1 rounded-lg hover:bg-primary/10 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加变量
                </button>
              }
            />
            {envEntries.length === 0 ? (
              <EmptySlot message="暂无环境变量，点击右上角添加" />
            ) : (
              <div className="space-y-2">
                {envEntries.map(([key, value], idx) => (
                  <div key={`${key}-${idx}`} className="flex items-center gap-2">
                    <input
                      value={key}
                      onChange={(e) => setEnvVar(key, e.target.value, value)}
                      placeholder="KEY_NAME"
                      className={`${inputCls} flex-1 font-mono`}
                    />
                    <span className="text-muted-foreground text-sm select-none">=</span>
                    <input
                      value={value}
                      onChange={(e) => setEnvVar(key, key, e.target.value)}
                      placeholder="value"
                      className={`${inputCls} flex-1 font-mono`}
                    />
                    <button
                      onClick={() => removeEnvVar(key)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="h-2" />
        </div>

        {/* ── Preview panel ── */}
        {showPreview && (
          <div className="w-[320px] shrink-0 border-l border-border bg-zinc-950 dark:bg-black flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/80 shrink-0 select-none">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              </div>
              <span className="text-[11px] text-zinc-500 font-mono flex-1">openclaw.json</span>
              {isDirty && <span className="text-[10px] text-amber-400/80 font-mono">• 未保存</span>}
            </div>
            <pre className="flex-1 overflow-auto p-4 text-[11px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap break-all">
              {configJson}
            </pre>
          </div>
        )}
      </div>

      {/* ── Restart Log Panel ── */}
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
                className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                  restartLog.success
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {restartLog.success ? '✓ 成功' : '✕ 失败'}
              </span>
            </div>
            <button
              onClick={() => setRestartLog(restartLog ? { ...restartLog, visible: false } : null)}
              className="text-zinc-500 hover:text-zinc-200 transition p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <pre className="px-4 py-3 max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all text-zinc-300">
            {restartLog.output
              ? restartLog.output.split('\n').map((line, i) => {
                  const isErr =
                    /error|invalid|failed|problem/i.test(line) && !line.includes('best-effort');
                  const isOk = /success|started|ready|running|restarted/i.test(line);
                  const cls = isErr ? 'text-red-400' : isOk ? 'text-emerald-400' : '';

                  return (
                    <span key={i} className={cls}>
                      {line}
                      {'\n'}
                    </span>
                  );
                })
              : '（无输出）'}
          </pre>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="shrink-0 px-6 py-3 border-t border-border flex items-center justify-between bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
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
                className="ml-1 underline underline-offset-2 hover:text-amber-500 transition text-amber-600 dark:text-amber-400"
              >
                点击启动
              </button>
            </span>
          )}
          {saveStatus === 'error' && errorMsg && (
            <span className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="w-3.5 h-3.5" />
              {errorMsg}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => useConfigStore.getState().setConfig(savedConfig)}
            disabled={!isDirty || loading}
            className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all disabled:opacity-40"
          >
            撤销更改
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={!canSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary/20"
          >
            {saveStatus === 'saving' || saveStatus === 'reloading' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Local sub-components ─────────────────────────────────────────────────────

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h2>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</p>
      </div>
      {action}
    </div>
  );
}

function EmptySlot({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-10 h-6 rounded-full transition-colors duration-200 shrink-0 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center p-0.5 rounded-lg bg-muted border border-border h-[38px] ${className ?? ''}`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1 rounded-md text-xs font-medium transition-all px-2 ${
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();

    if (v) {
      onChange([...values.filter((x) => x !== v), v]);
      setInput('');
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-border bg-background min-h-[42px] focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition cursor-text">
      {values.map((v) => (
        <span
          key={v}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-mono text-foreground"
        >
          {v}
          <button
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-muted-foreground hover:text-red-500 transition"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }

          if (e.key === 'Backspace' && !input && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={values.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[140px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
      />
    </div>
  );
}

function ModelSelector({
  value,
  providers,
  onChange,
}: {
  value: string;
  providers: Record<string, ProviderConfig>;
  onChange: (v: string) => void;
}) {
  const providerKeys = Object.keys(providers);
  const slashIdx = value.indexOf('/');
  const selectedProvider = slashIdx >= 0 ? value.slice(0, slashIdx) : value;
  const selectedModel = slashIdx >= 0 ? value.slice(slashIdx + 1) : '';

  const getModels = (key: string): ModelOption[] => {
    const provConfig = providers[key];
    if (!provConfig) return [];

    const listKey = resolveModelListKey(key, provConfig);

    return listKey ? (PROVIDER_MODELS[listKey] ?? []) : [];
  };

  const models = selectedProvider ? getModels(selectedProvider) : [];
  const modelInList = models.some((m) => m.id === selectedModel);

  if (providerKeys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-1">
        请先在上方「模型提供商」中添加提供商
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Provider — auto-select first model on change */}
        <select
          value={selectedProvider}
          onChange={(e) => {
            const p = e.target.value;

            if (!p) {
              onChange('');

              return;
            }

            onChange(autoSelectModel(p, providers));
          }}
          className={`${inputCls} w-44 shrink-0 font-mono`}
        >
          <option value="">选择提供商…</option>
          {providerKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        {selectedProvider && (
          <>
            <span className="text-muted-foreground font-mono shrink-0 text-sm">/</span>
            {models.length > 0 ? (
              <select
                value={modelInList ? selectedModel : selectedModel ? '__custom__' : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && v !== '__custom__') onChange(`${selectedProvider}/${v}`);
                }}
                className={`${inputCls} flex-1 ${!selectedModel ? 'border-amber-400/60' : ''}`}
              >
                <option value="">— 请选择模型 —</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.desc ? ` — ${m.desc}` : ''}
                  </option>
                ))}
                {!modelInList && selectedModel && (
                  <option value="__custom__">{selectedModel}（自定义）</option>
                )}
              </select>
            ) : (
              <input
                value={selectedModel}
                onChange={(e) => onChange(`${selectedProvider}/${e.target.value}`)}
                placeholder="model-id（如 deepseek-chat）"
                className={`${inputCls} flex-1 font-mono ${!selectedModel ? 'border-amber-400/60' : ''}`}
              />
            )}
          </>
        )}

        {value && (
          <button
            onClick={() => onChange('')}
            className="shrink-0 text-muted-foreground hover:text-red-500 transition"
            title="清除此字段"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {value && value.includes('/') && value.split('/')[1] ? (
          <code className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            ✓ {value}
          </code>
        ) : value ? (
          <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3 shrink-0" />
            请选择模型（格式：<code className="font-mono">提供商/模型ID</code>）
          </span>
        ) : null}
        {selectedProvider && value && !providerKeys.includes(selectedProvider) && (
          <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3 shrink-0" />
            提供商未配置
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        格式 <code className="font-mono">提供商/模型ID</code>；留空或清除表示不设置默认模型
      </p>
    </div>
  );
}
