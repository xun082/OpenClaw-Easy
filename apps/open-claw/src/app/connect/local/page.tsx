'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  CheckCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Terminal,
  ChevronDown,
  ChevronUp,
  Plug,
  ExternalLink,
  Key,
} from 'lucide-react';
import { useConfigStore } from '@/store/config-store';

type ConnStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'timeout';

interface TestResult {
  ok: boolean;
  latencyMs: number;
  method: 'ws' | 'http' | 'cli';
  error?: string;
  rawOutput?: string;
}

async function probeGateway(url: string, token: string): Promise<TestResult> {
  const t0 = Date.now();

  const httpUrl = url.replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'));
  const isLocal =
    url.includes('127.0.0.1') || url.includes('localhost') || url.includes('0.0.0.0');

  if (isLocal && typeof window !== 'undefined' && typeof window.api?.executeCommand === 'function') {
    try {
      const wsUrl = url.startsWith('ws') ? url : `ws://${url}`;
      const cmd = token
        ? `openclaw gateway status --url ${wsUrl} --token ${token}`
        : `openclaw gateway status --url ${wsUrl}`;
      const res = await window.api.executeCommand(cmd);
      const out = (res.output ?? '').trim();
      const latencyMs = Date.now() - t0;
      if (res.success || out.toLowerCase().includes('running') || out.toLowerCase().includes('ok')) {
        return { ok: true, latencyMs, method: 'cli', rawOutput: out };
      }
      if (out.length > 0) {
        return { ok: false, latencyMs, method: 'cli', error: '网关未运行', rawOutput: out };
      }
    } catch {
      /* openclaw not installed */
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(httpUrl, { method: 'GET', signal: controller.signal, headers });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;

    if (res.status === 401 || res.status === 403) {
      return { ok: false, latencyMs, method: 'http', error: '认证失败，Token 不正确' };
    }
    return { ok: true, latencyMs, method: 'http' };
  } catch (e: unknown) {
    const latencyMs = Date.now() - t0;
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, latencyMs, method: 'http', error: '连接超时（8s），请确认地址可达' };
    }
    const msg = e instanceof Error ? e.message : '';
    if (
      msg.includes('ECONNREFUSED') ||
      msg.includes('Failed to fetch') ||
      msg.includes('ERR_CONNECTION_REFUSED')
    ) {
      return {
        ok: false,
        latencyMs,
        method: 'http',
        error: '连接被拒绝，Gateway 未运行或端口未开放',
      };
    }
    return { ok: false, latencyMs, method: 'http', error: '无法连接：' + (msg || '未知错误') };
  }
}

export default function ConnectTestPage() {
  const config = useConfigStore((s) => s.config);

  // Derive defaults from config store
  const configPort = config?.gateway?.port ?? 18789;
  const configToken = config?.gateway?.auth?.token ?? '';

  const [gatewayUrl, setGatewayUrl] = useState(`ws://127.0.0.1:${configPort}`);
  const [token, setToken] = useState(configToken);
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [result, setResult] = useState<TestResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const probing = useRef(false);

  // Sync form when config loads (e.g. after Electron reads the file)
  useEffect(() => {
    if (configToken && !token) {
      setToken(configToken);
    }
    setGatewayUrl(`ws://127.0.0.1:${configPort}`);
  }, [configPort, configToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTest = useCallback(async () => {
    if (probing.current) return;
    probing.current = true;
    setStatus('connecting');
    setResult(null);
    setShowOutput(false);

    const url = gatewayUrl.trim() || `ws://127.0.0.1:${configPort}`;
    const res = await probeGateway(url, token.trim());
    probing.current = false;
    setStatus(res.ok ? 'connected' : res.error?.includes('超时') ? 'timeout' : 'failed');
    setResult(res);
  }, [gatewayUrl, token, configPort]);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(gatewayUrl).catch(() => {});
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const handleCopyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(token).catch(() => {});
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleOpenDashboard = () => {
    const httpUrl = gatewayUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://');
    const dashUrl = token ? `${httpUrl}/?token=${encodeURIComponent(token)}` : httpUrl;
    window.open(dashUrl, '_blank');
  };

  const statusConfig = {
    idle: { color: 'text-muted-foreground', bg: 'bg-muted/30 border-border', label: '未测试' },
    connecting: {
      color: 'text-sky-500',
      bg: 'bg-sky-500/10 border-sky-500/30',
      label: '连接中...',
    },
    connected: {
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      label: '连接成功',
    },
    failed: { color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30', label: '连接失败' },
    timeout: {
      color: 'text-amber-500',
      bg: 'bg-amber-500/10 border-amber-500/30',
      label: '连接超时',
    },
  }[status];

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-[22px] font-bold tracking-tight text-foreground mb-1.5">连接测试</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          测试本地或远端 OpenClaw Gateway 是否可达。Token 已从配置文件自动读取。
        </p>
      </div>

      {/* Token 快捷卡片（仅当有 token 时显示） */}
      {configToken && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 flex items-center gap-4">
          <Key className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground mb-0.5">当前网关 Auth Token</p>
            <code className="text-[11px] font-mono text-muted-foreground break-all">
              {showToken ? configToken : configToken.slice(0, 8) + '••••••••••••••••••••••••••••••••••••••••'}
            </code>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowToken((v) => !v)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={showToken ? '隐藏 Token' : '显示 Token'}
            >
              {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleCopyToken}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="复制 Token"
            >
              {tokenCopied ? (
                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={handleOpenDashboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              打开 Dashboard
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        {/* URL */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Gateway URL
          </label>
          <input
            type="text"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            placeholder="ws://127.0.0.1:18789"
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Token */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              Auth Token
            </label>
            {configToken && token !== configToken && (
              <button
                onClick={() => setToken(configToken)}
                className="text-[11px] text-primary hover:text-primary/80 transition-colors"
              >
                从配置文件重新读取
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={configToken ? '已从配置文件读取' : '留空表示无鉴权'}
              className="w-full pl-3 pr-10 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Token 来自 <code className="font-mono">~/.openclaw/openclaw.json</code>{' '}
            的 <code className="font-mono">gateway.auth.token</code> 字段，在「配置文件」页可修改
          </p>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyUrl}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {urlCopied ? (
              <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            复制 URL
          </button>

          <button
            onClick={handleOpenDashboard}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            打开 Dashboard
          </button>

          <div className="flex-1" />

          <button
            onClick={handleTest}
            disabled={status === 'connecting'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'connecting' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plug className="w-4 h-4" />
            )}
            测试连接
          </button>

          <button
            onClick={handleTest}
            disabled={status === 'connecting'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === 'connecting' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border px-5 py-4 space-y-3 ${statusConfig.bg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {result.ok ? (
                <CheckCircle2 className={`w-4 h-4 ${statusConfig.color}`} />
              ) : (
                <XCircle className={`w-4 h-4 ${statusConfig.color}`} />
              )}
              <span className={`text-sm font-medium ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              {result.latencyMs > 0 && (
                <span className="text-xs text-muted-foreground font-mono">
                  {result.latencyMs}ms
                </span>
              )}
            </div>
            <span className="text-xs font-mono text-muted-foreground/60 uppercase">
              via {result.method}
            </span>
          </div>

          {result.error && <p className="text-sm text-muted-foreground">{result.error}</p>}

          {/* 连接成功时显示 Dashboard 直达按钮 */}
          {result.ok && (
            <button
              onClick={handleOpenDashboard}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              前往 Gateway Dashboard
            </button>
          )}

          {result.rawOutput && (
            <div>
              <button
                onClick={() => setShowOutput((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Terminal className="w-3 h-3" />
                原始输出
                {showOutput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showOutput && (
                <pre className="mt-2 p-3 rounded-lg bg-zinc-950 font-mono text-xs text-zinc-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {result.rawOutput}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* 说明卡片 */}
      <div className="rounded-xl border border-border bg-muted/20 px-5 py-4 space-y-2">
        <p className="text-xs font-semibold text-foreground">如何使用 Gateway Dashboard？</p>
        <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
          <li>点击上方「打开 Dashboard」按钮，Token 会自动附加在 URL 中（<code className="font-mono">?token=…</code>）</li>
          <li>
            如浏览器提示「token missing」，点击 Dashboard 右上角设置图标，将 Token 粘贴进去
            <span className="ml-1 text-primary cursor-pointer" onClick={handleCopyToken}>
              {tokenCopied ? '（已复制）' : '（点此复制 Token）'}
            </span>
          </li>
          <li>Token 来源：<code className="font-mono">~/.openclaw/openclaw.json → gateway.auth.token</code>，保存配置后网关重启时会刷新</li>
        </ol>
      </div>
    </div>
  );
}
