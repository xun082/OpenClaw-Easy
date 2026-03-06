'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProviderConfig {
  baseUrl: string;
  api: string;
  apiKey: string;
  authHeader: boolean;
  [key: string]: unknown;
}

interface ParsedConfig {
  meta?: Record<string, unknown>;
  env?: Record<string, string>;
  models?: {
    mode?: 'merge' | 'replace';
    providers?: Record<string, ProviderConfig>;
  };
  [key: string]: unknown;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_CONFIG: ParsedConfig = {
  meta: {},
  env: {},
  models: { mode: 'merge', providers: {} },
};

const API_OPTIONS = [
  'anthropic-messages',
  'openai',
  'openai-compatible',
  'azure-openai',
  'gemini',
  'bedrock',
  'vertex',
];

const isElectronEnv = () =>
  typeof window !== 'undefined' && typeof window.api?.readOpenclawConfig === 'function';

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConfigEditor() {
  const [mounted, setMounted] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [config, setConfig] = useState<ParsedConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<ParsedConfig | null>(null);
  const [configPath, setConfigPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [exists, setExists] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');

  useEffect(() => {
    setMounted(true);
    setIsElectron(isElectronEnv());
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setSaveStatus('idle');
    setErrorMsg('');

    try {
      const res = await window.api.readOpenclawConfig();
      setConfigPath(res.path);

      if (res.success && res.content) {
        try {
          const parsed = JSON.parse(res.content) as ParsedConfig;
          setConfig(parsed);
          setSavedConfig(parsed);

          const providers = Object.keys(parsed.models?.providers ?? {});
          if (providers[0]) setExpandedProviders({ [providers[0]]: true });
        } catch {
          setConfig(EMPTY_CONFIG);
          setSavedConfig(EMPTY_CONFIG);
        }

        setExists(true);
      } else {
        setExists(false);
        setConfig(null);
        setSavedConfig(null);
        if (res.error !== 'not-found') setErrorMsg(res.error ?? '读取失败');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isElectron) loadConfig();
  }, [isElectron, loadConfig]);

  const configJson = useMemo(() => (config ? JSON.stringify(config, null, 2) : ''), [config]);
  const savedConfigJson = useMemo(
    () => (savedConfig ? JSON.stringify(savedConfig, null, 2) : ''),
    [savedConfig],
  );
  const isDirty = configJson !== savedConfigJson;
  const canSave = isElectron && !loading && isDirty && saveStatus !== 'saving' && !!config;

  const handleSave = async () => {
    if (!canSave || !config) return;
    setSaveStatus('saving');
    setErrorMsg('');

    try {
      const res = await window.api.writeOpenclawConfig(configJson);

      if (res.success) {
        setSavedConfig(config);
        setExists(true);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2500);
      } else {
        setErrorMsg(res.error ?? '保存失败');
        setSaveStatus('error');
      }
    } catch {
      setErrorMsg('保存时发生未知错误');
      setSaveStatus('error');
    }
  };

  const handleCopyPath = async () => {
    if (!configPath) return;
    await navigator.clipboard.writeText(configPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Config mutators ──────────────────────────────────────────────────────

  const mutate = (updater: (prev: ParsedConfig) => ParsedConfig) => {
    setConfig((prev) => (prev ? updater(prev) : prev));
  };

  const envEntries = Object.entries(config?.env ?? {});

  const setEnvVar = (oldKey: string, newKey: string, val: string) => {
    mutate((prev) => {
      const env = Object.fromEntries(
        Object.entries(prev.env ?? {}).map(([k, v]) => (k === oldKey ? [newKey, val] : [k, v])),
      );

      return { ...prev, env };
    });
  };

  const addEnvVar = () => {
    mutate((prev) => ({ ...prev, env: { ...prev.env, '': '' } }));
  };

  const removeEnvVar = (key: string) => {
    mutate((prev) => {
      const env = { ...prev.env };
      delete env[key];

      return { ...prev, env };
    });
  };

  const providerEntries = Object.entries(config?.models?.providers ?? {});

  const updateProvider = (name: string, patch: Partial<ProviderConfig>) => {
    mutate((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        providers: {
          ...prev.models?.providers,
          [name]: { ...(prev.models?.providers?.[name] ?? {}), ...patch } as ProviderConfig,
        },
      },
    }));
  };

  const removeProvider = (name: string) => {
    mutate((prev) => {
      const ps = { ...prev.models?.providers };
      delete ps[name];

      return { ...prev, models: { ...prev.models, providers: ps } };
    });
  };

  const handleAddProvider = () => {
    const n = newProviderName.trim();
    if (!n) return;
    mutate((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        providers: {
          ...prev.models?.providers,
          [n]: { baseUrl: '', api: 'anthropic-messages', apiKey: '', authHeader: true },
        },
      },
    }));
    setExpandedProviders((prev) => ({ ...prev, [n]: true }));
    setNewProviderName('');
    setAddingProvider(false);
  };

  // ── Early render states ──────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isElectron) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50 px-6 py-4 max-w-sm text-center">
          <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            请在 Electron 客户端中运行以使用此功能。
          </p>
        </div>
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
          onClick={() => {
            setConfig(EMPTY_CONFIG);
            setSavedConfig(null);
            setExists(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
        >
          <FilePlus className="w-4 h-4" />
          使用默认模板
        </button>
      </div>
    );
  }

  // ── Main editor ──────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
            onClick={() => loadConfig()}
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
        {/* Form panel */}
        <div className={`overflow-y-auto p-6 space-y-7 ${showPreview ? 'flex-1' : 'w-full'}`}>
          {/* Meta section */}
          {config?.meta && Object.keys(config.meta).length > 0 && (
            <section>
              <SectionHeader title="元数据" description="配置文件的版本和元信息（只读）" />
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

          {/* ENV VARS section */}
          <section>
            <SectionHeader
              title="环境变量"
              description="注入到运行环境的 KEY=VALUE 键值对"
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
                      className={inputCls + ' flex-1 font-mono'}
                    />
                    <span className="text-muted-foreground text-sm select-none">=</span>
                    <input
                      value={value}
                      onChange={(e) => setEnvVar(key, key, e.target.value)}
                      placeholder="value"
                      className={inputCls + ' flex-2 font-mono'}
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

          {/* MODELS section */}
          <section>
            <SectionHeader
              title="模型提供商"
              description="配置 AI 模型网关和 API 接入点"
              action={
                <div className="flex items-center gap-2">
                  {/* Mode toggle */}
                  <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border">
                    {(['merge', 'replace'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() =>
                          mutate((prev) => ({ ...prev, models: { ...prev.models, mode: m } }))
                        }
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          config?.models?.mode === m
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {m === 'merge' ? '合并模式' : '替换模式'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setAddingProvider(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2.5 py-1 rounded-lg hover:bg-primary/10 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加提供商
                  </button>
                </div>
              }
            />

            {/* Add provider input */}
            {addingProvider && (
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddProvider();

                    if (e.key === 'Escape') {
                      setAddingProvider(false);
                      setNewProviderName('');
                    }
                  }}
                  autoFocus
                  placeholder="提供商名称（如 my-provider）"
                  className={inputCls + ' flex-1 font-mono'}
                />
                <button
                  onClick={handleAddProvider}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition"
                >
                  确认
                </button>
                <button
                  onClick={() => {
                    setAddingProvider(false);
                    setNewProviderName('');
                  }}
                  className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition"
                >
                  取消
                </button>
              </div>
            )}

            {providerEntries.length === 0 && !addingProvider ? (
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
                      {/* Provider header row */}
                      <button
                        onClick={() =>
                          setExpandedProviders((prev) => ({ ...prev, [name]: !prev[name] }))
                        }
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition"
                      >
                        <div className="w-2 h-2 rounded-full bg-emerald-500/80 shrink-0" />
                        <span className="flex-1 text-sm font-semibold font-mono text-foreground">
                          {name}
                        </span>
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
                      </button>

                      {/* Provider fields */}
                      {isExpanded && (
                        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/10">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={labelCls}>Base URL</label>
                              <input
                                value={provider.baseUrl}
                                onChange={(e) => updateProvider(name, { baseUrl: e.target.value })}
                                placeholder="https://api.example.com"
                                className={inputCls + ' font-mono'}
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
                                className={inputCls + ' font-mono pr-9'}
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
                            <button
                              onClick={() =>
                                updateProvider(name, { authHeader: !provider.authHeader })
                              }
                              className={`relative inline-flex w-10 h-6 rounded-full transition-colors duration-200 ${
                                provider.authHeader ? 'bg-primary' : 'bg-muted-foreground/30'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                  provider.authHeader ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* bottom padding */}
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

      {/* ── Footer ── */}
      <div className="shrink-0 px-6 py-3 border-t border-border flex items-center justify-between bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              已保存
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
            onClick={() => setConfig(savedConfig)}
            disabled={!isDirty || loading}
            className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all disabled:opacity-40"
          >
            撤销更改
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary/20"
          >
            {saveStatus === 'saving' ? (
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

// ─── Shared style helpers ─────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition';

const labelCls = 'text-[11px] font-medium text-muted-foreground block mb-1.5';

// ─── Sub-components (local, not exported) ────────────────────────────────────

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
