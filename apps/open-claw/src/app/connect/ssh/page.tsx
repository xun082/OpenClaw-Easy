'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Server,
  XCircle,
  Loader2,
  Trash2,
  Terminal,
  ChevronDown,
  ChevronUp,
  Plus,
  Key,
  Lock,
  Plug,
  Play,
  Pencil,
  Eye,
  EyeOff,
  Download,
  Upload,
  Copy,
  CheckCheck,
  ExternalLink,
  Package,
  CheckCircle2,
  Activity,
  RefreshCw,
  Info,
  Shield,
  Fingerprint,
  Wand2,
} from 'lucide-react';

import { useConnectionStore } from '@/store/connection-store';
import {
  buildSshCmd,
  buildListLocalKeysCmd,
  buildReadPubKeyCmd,
  buildFixKeyPermCmd,
  buildGenKeyCmd,
  buildCopyIdCmd,
} from '@/lib/ssh-utils';
import type { SSHConn } from '@/lib/ssh-utils';

type SSHConnStatus =
  | 'idle'
  | 'testing'
  | 'ok'
  | 'fail'
  | 'deploying'
  | 'checking'
  | 'uninstalling'
  | 'restarting'
  | 'fetchingInfo'
  | 'approving';

interface SSHConnRuntimeState {
  status: SSHConnStatus;
  error?: string;
  latencyMs?: number;
}

interface LogEntry {
  type: 'info' | 'stdout' | 'stderr' | 'error';
  message: string;
}

const LOG_COLORS: Record<LogEntry['type'], string> = {
  info: 'text-sky-400',
  stdout: 'text-zinc-300',
  stderr: 'text-amber-400',
  error: 'text-red-400',
};

// ── SSH deploy / status scripts ───────────────────────────────────────────────

// Full deploy script: Node.js + OpenClaw CLI + systemd service + start
function buildDeployScript(gatewayPort: string): string {
  return `set -e
LOG=/tmp/openclaw-deploy.log
exec > "$LOG" 2>&1
echo "=== OpenClaw Gateway 部署开始: $(date) ==="

echo ""
echo "[1/4] 检查 Node.js..."
if command -v node &>/dev/null; then
  echo "✓ Node.js $(node -v)"
else
  echo "→ 未找到 Node.js，开始安装 LTS..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
    yum install -y nodejs
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
    dnf install -y nodejs
  else
    echo "✗ 无法识别包管理器，请手动安装 Node.js LTS"
    exit 1
  fi
  echo "✓ Node.js $(node -v)"
fi

echo ""
echo "[2/4] 安装 OpenClaw CLI..."
git config --global url."https://github.com/".insteadOf "git@github.com:"
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
echo "  → git 已配置为 HTTPS 模式"
npm install -g openclaw@latest
echo "✓ OpenClaw CLI 安装完成: $(openclaw --version 2>/dev/null || echo 已安装)"

HTTPS_PORT=${Number(gatewayPort) + 1}

echo ""
echo "[3/5] 初始化 OpenClaw 配置..."
mkdir -p /root/.openclaw
openclaw config set gateway.mode local 2>/dev/null || true
openclaw config set gateway.bind lan 2>/dev/null || true
openclaw config set gateway.auth.mode token 2>/dev/null || true
openclaw config set gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback true 2>/dev/null || true
openclaw config set gateway.controlUi.allowInsecureAuth true 2>/dev/null || true
echo "已配置 gateway.bind=lan, mode=local, auth.mode=token, allowInsecureAuth=true"
echo "Token: $(node -e "try{const c=require('/root/.openclaw/openclaw.json');console.log(c.gateway?.auth?.token||'(待生成)')}catch(e){}" 2>/dev/null)"

echo ""
echo "[4/5] 配置 systemd 服务（开机自启）..."
if ss -tlnp 2>/dev/null | grep -q ":${gatewayPort} "; then
  echo "⚠ 端口 ${gatewayPort} 已被占用，正在释放..."
  fuser -k ${gatewayPort}/tcp 2>/dev/null || true
  sleep 2
fi
OPENCLAW_BIN=$(which openclaw)
cat > /etc/systemd/system/openclaw-gateway.service << SVCEOF
[Unit]
Description=OpenClaw AI Gateway
After=network.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/root
ExecStart=$OPENCLAW_BIN gateway --port ${gatewayPort} --allow-unconfigured --bind lan --force
Restart=always
RestartSec=5
User=root
Environment=HOME=/root
Environment=PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/www/server/nodejs/v22.16.0/bin

[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable openclaw-gateway
echo "✓ 服务文件已写入，已设为开机自启"

echo ""
echo "[5/5] 启动 Gateway + 配置 Nginx HTTPS..."
systemctl restart openclaw-gateway
sleep 5
if ! systemctl is-active --quiet openclaw-gateway; then
  echo "✗ 服务启动失败，错误日志："
  journalctl -u openclaw-gateway --no-pager -n 30 2>/dev/null || true
  exit 1
fi
echo "✓ OpenClaw Gateway 已在端口 ${gatewayPort} 成功启动"

echo "→ 配置 Nginx HTTPS 反代 (端口 $HTTPS_PORT)..."
if command -v apt-get &>/dev/null; then
  apt-get install -y nginx openssl 2>/dev/null | tail -1
elif command -v yum &>/dev/null; then
  yum install -y nginx openssl 2>/dev/null | tail -1
fi

mkdir -p /etc/nginx/ssl/openclaw
if [ ! -f /etc/nginx/ssl/openclaw/cert.pem ]; then
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/openclaw/key.pem \
    -out /etc/nginx/ssl/openclaw/cert.pem \
    -subj "/CN=openclaw-gateway/O=OpenClaw/C=CN" 2>/dev/null
  echo "✓ SSL 自签名证书已生成"
fi

cat > /etc/nginx/sites-available/openclaw-https << NGINXEOF
server {
    listen $HTTPS_PORT ssl;
    server_name _;
    ssl_certificate     /etc/nginx/ssl/openclaw/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/openclaw/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    location / {
        proxy_pass         http://127.0.0.1:${gatewayPort};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$http_host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/openclaw-https /etc/nginx/sites-enabled/openclaw-https
nginx -t 2>/dev/null && systemctl reload nginx && echo "✓ Nginx HTTPS 反代已配置" || echo "⚠ Nginx 配置失败，请手动检查"

echo "→ 防火墙放行 HTTPS 端口 $HTTPS_PORT ..."
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "$HTTPS_PORT/tcp" 2>/dev/null && echo "✓ ufw 已放行 $HTTPS_PORT" || true
fi
if command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port="$HTTPS_PORT/tcp" 2>/dev/null && firewall-cmd --reload 2>/dev/null && echo "✓ firewalld 已放行 $HTTPS_PORT" || true
fi

echo ""
echo "=== ✅ 部署成功: $(date) ==="
echo "WebSocket:  ws://\$(curl -s ifconfig.me 2>/dev/null || echo PUBLIC_IP):${gatewayPort}"
echo "Dashboard:  https://\$(curl -s ifconfig.me 2>/dev/null || echo PUBLIC_IP):$HTTPS_PORT  (需在浏览器接受自签名证书)"
echo "密码:        openclaw2026"`;
}

// Full uninstall script: stop service + remove files + remove CLI + remove config
function buildUninstallScript(): string {
  return `set -e
echo "=== 开始完整卸载 OpenClaw Gateway ==="

echo ""
echo "[1/5] 停止 Gateway 服务..."
systemctl stop openclaw-gateway 2>/dev/null && echo "✓ 服务已停止" || echo "→ 服务未运行，跳过"

echo "[2/5] 禁用开机自启..."
systemctl disable openclaw-gateway 2>/dev/null && echo "✓ 开机自启已禁用" || echo "→ 自启未启用，跳过"

echo "[3/5] 删除服务文件..."
if [ -f /etc/systemd/system/openclaw-gateway.service ]; then
  rm -f /etc/systemd/system/openclaw-gateway.service
  systemctl daemon-reload
  echo "✓ 服务文件已删除"
else
  echo "→ 服务文件不存在，跳过"
fi

echo "[4/5] 卸载 OpenClaw CLI..."
if command -v openclaw &>/dev/null; then
  npm uninstall -g openclaw && echo "✓ OpenClaw CLI 已卸载"
else
  echo "→ OpenClaw CLI 未安装，跳过"
fi

echo "[5/5] 清理配置目录和日志..."
rm -rf ~/.openclaw 2>/dev/null && echo "✓ 配置目录 ~/.openclaw 已删除" || true
rm -f /tmp/openclaw-deploy.log /tmp/openclaw-setup.sh 2>/dev/null || true
echo "✓ 临时文件已清理"

echo ""
echo "=== ✅ 卸载完成: $(date) ==="`;
}

// Status check: systemctl + port check + HTTP test + journalctl + log tail
function buildStatusScript(gatewayPort: string): string {
  return `echo "=== [1] Gateway 服务状态 ==="
if systemctl is-active --quiet openclaw-gateway 2>/dev/null; then
  echo "● 运行中 (active)"
  systemctl status openclaw-gateway --no-pager -n 3 2>/dev/null || true
else
  SVC_STATUS=$(systemctl is-active openclaw-gateway 2>/dev/null || echo "unknown")
  echo "● 未运行 (status: $SVC_STATUS)"
  systemctl status openclaw-gateway --no-pager -n 5 2>/dev/null || echo "（服务不存在或未配置）"
fi

echo ""
echo "=== [2] 端口监听 ==="
if ss -tlnp 2>/dev/null | grep -q ":${gatewayPort} "; then
  echo "✓ 端口 ${gatewayPort} 已监听"
  ss -tlnp | grep ":${gatewayPort} "
elif command -v netstat &>/dev/null && netstat -tlnp 2>/dev/null | grep -q ":${gatewayPort} "; then
  echo "✓ 端口 ${gatewayPort} 已监听"
  netstat -tlnp | grep ":${gatewayPort} "
else
  echo "✗ 端口 ${gatewayPort} 未监听"
fi

echo ""
echo "=== [3] HTTP 连接测试 ==="
HTTP_CODE=$(curl -s --connect-timeout 5 -o /dev/null -w "%{http_code}" http://localhost:${gatewayPort}/ 2>/dev/null || echo "failed")
echo "本地 HTTP 请求结果: $HTTP_CODE"
if [ "$HTTP_CODE" = "failed" ]; then
  echo "  → 连接被拒绝，服务可能未运行"
elif [ "$HTTP_CODE" = "502" ]; then
  echo "  ⚠ 502 Bad Gateway — 很可能有 Nginx/宝塔 在此端口做了反向代理"
  echo "  → 解决方案：在宝塔面板删除占用 ${gatewayPort} 的网站/反代配置，或换一个未被占用的端口重新部署"
elif [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "101" ] || [ "$HTTP_CODE" = "400" ]; then
  echo "  ✓ Gateway 响应正常 (HTTP $HTTP_CODE)"
else
  echo "  → HTTP 状态: $HTTP_CODE"
fi

echo ""
echo "=== [4] openclaw 进程 ==="
pids=$(pgrep -f "openclaw gateway" 2>/dev/null) || true
if [ -n "$pids" ]; then
  echo "✓ openclaw gateway 进程存在:"
  ps -p $pids -o pid,user,cmd --no-headers 2>/dev/null || true
else
  echo "✗ 未找到 openclaw gateway 进程"
fi

echo ""
echo "=== [5] systemd 日志 (最近 40 行) ==="
journalctl -u openclaw-gateway --no-pager -n 40 2>/dev/null || echo "（journalctl 不可用）"

echo ""
echo "=== [6] 部署日志 (最近 30 行) ==="
tail -30 /tmp/openclaw-deploy.log 2>/dev/null || echo "（无部署日志）"`;
}

// Restart service
function buildRestartScript(): string {
  return `#!/bin/bash
set -e
echo "=== 修复并重启 OpenClaw Gateway ==="

echo ""
echo "[1/3] 更新 openclaw 配置（写入 openclaw.json）..."
mkdir -p /root/.openclaw
openclaw config set gateway.mode local 2>/dev/null || true
openclaw config set gateway.bind lan 2>/dev/null || true
openclaw config set gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback true 2>/dev/null || true
echo "配置已更新: gateway.bind=lan (对外监听), mode=local, CORS=允许"

echo ""
echo "[2/3] 确认 systemd 服务文件..."
SVC=/etc/systemd/system/openclaw-gateway.service
if [ ! -f "$SVC" ]; then
  echo "服务文件不存在，请先执行一键部署"
  exit 1
fi
echo "服务文件内容:"
grep ExecStart "$SVC"

echo ""
echo "[3/3] 重载配置并重启服务..."
systemctl daemon-reload
systemctl restart openclaw-gateway
echo "等待启动..."
sleep 6
if systemctl is-active --quiet openclaw-gateway; then
  echo "服务重启成功"
  ss -tlnp | grep 18789 || echo "端口监听检查..."
  journalctl -u openclaw-gateway --no-pager -n 5 2>/dev/null || true
else
  echo "重启失败，错误日志："
  journalctl -u openclaw-gateway --no-pager -n 30 2>/dev/null || true
fi`;
}

// Fetch connection info: gateway URL + auth token from remote server
function buildConnInfoScript(host: string, gatewayPort: string): string {
  return `#!/bin/bash
TOKEN=$(node -e "try{const c=require('/root/.openclaw/openclaw.json');console.log(c.gateway?.auth?.token||'')}catch(e){}" 2>/dev/null)
MODE=$(node -e "try{const c=require('/root/.openclaw/openclaw.json');console.log(c.gateway?.auth?.mode||'none')}catch(e){}" 2>/dev/null)
HTTPS_PORT=${Number(gatewayPort) + 1}

echo "Gateway WebSocket : ws://${host}:${gatewayPort}"
echo "Dashboard HTTPS   : https://${host}:$HTTPS_PORT"
echo "Auth Mode         : $MODE"
if [ -n "$TOKEN" ]; then
  echo "Token             : $TOKEN"
fi`;
}

// List + auto-approve all pending device pairing requests
function buildApproveDevicesScript(): string {
  return `#!/bin/bash
echo "=== 查询待配对设备 ==="
openclaw devices list 2>&1
echo ""
echo "=== 批准所有待配对请求 ==="
PENDING=$(openclaw devices list 2>&1 | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -20)
if [ -z "$PENDING" ]; then
  echo "没有待批准的设备请求"
else
  for id in $PENDING; do
    echo "批准: $id"
    openclaw devices approve "$id" 2>&1 && echo "  ✓ 已批准" || echo "  ⚠ 已跳过（可能已批准）"
  done
fi
echo ""
echo "=== 当前已配对设备 ==="
openclaw devices list 2>&1`;
}

// ── Small components ──────────────────────────────────────────────────────────

function LogPanel({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="w-3.5 h-3.5" />
          <span>输出日志</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          清空
        </button>
      </div>
      <div className="p-4 max-h-72 overflow-y-auto font-mono text-xs leading-relaxed space-y-0.5">
        {logs.map((l, i) => (
          <div key={i} className={LOG_COLORS[l.type]}>
            {l.message}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

// ── Sshpass banner ────────────────────────────────────────────────────────────

type SshpassStatus = 'checking' | 'found' | 'missing' | 'installing' | 'error';

function SshpassBanner() {
  const [status, setStatus] = useState<SshpassStatus>('checking');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState<'brew' | 'apt' | null>(null);

  const pushLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  const checkSshpass = useCallback(async () => {
    if (!window.api) return;
    setStatus('checking');

    try {
      const res = await window.api.executeCommand('which sshpass');
      const path = res.output?.trim() ?? '';

      if (res.success && path.length > 0) {
        setStatus('found');
      } else {
        setStatus('missing');
      }
    } catch {
      setStatus('missing');
    }
  }, []);

  useEffect(() => {
    if (window.api) {
      checkSshpass();
    }
  }, [checkSshpass]);

  const handleInstall = async (method: 'brew' | 'apt') => {
    if (!window.api) return;
    setStatus('installing');
    setLogs([]);
    setShowLogs(true);

    const cmd =
      method === 'brew'
        ? 'brew install hudochenkov/sshpass/sshpass'
        : 'sudo apt-get install -y sshpass';

    pushLog({ type: 'info', message: `正在安装 sshpass（${method}）...` });
    pushLog({ type: 'stdout', message: `$ ${cmd}` });

    try {
      const res = await window.api.executeCommand(cmd);

      if (res.success || res.output?.toLowerCase().includes('already installed')) {
        pushLog({ type: 'info', message: '✓ sshpass 安装成功，请重新测试连接' });
        await checkSshpass();
      } else {
        pushLog({
          type: 'error',
          message: res.error ?? res.output ?? '安装失败，请手动运行上方命令',
        });
        setStatus('error');
      }
    } catch (e: unknown) {
      pushLog({ type: 'error', message: e instanceof Error ? e.message : '安装出错' });
      setStatus('error');
    }
  };

  const handleCopy = (method: 'brew' | 'apt') => {
    const cmd =
      method === 'brew'
        ? 'brew install hudochenkov/sshpass/sshpass'
        : 'sudo apt-get install -y sshpass';
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(method);
    setTimeout(() => setCopied(null), 2000);
  };

  if (status === 'checking') return null;
  if (status === 'found') return null;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Package className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">需要安装 sshpass</span>
            {status === 'installing' && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
            )}
            {status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            密码认证需要本机安装 <code className="font-mono bg-muted px-1 rounded">sshpass</code>。
            如使用 SSH 密钥认证则无需安装。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 space-y-2.5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            macOS（Homebrew）
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2.5 py-1.5 rounded bg-zinc-950 font-mono text-xs text-zinc-300 truncate">
              brew install hudochenkov/sshpass/sshpass
            </code>
            <button
              onClick={() => handleCopy('brew')}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied === 'brew' ? (
                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <button
            onClick={() => handleInstall('brew')}
            disabled={status === 'installing'}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'installing' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            自动安装（brew）
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-2.5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Linux（apt）
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2.5 py-1.5 rounded bg-zinc-950 font-mono text-xs text-zinc-300 truncate">
              sudo apt-get install -y sshpass
            </code>
            <button
              onClick={() => handleCopy('apt')}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied === 'apt' ? (
                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <button
            onClick={() => handleInstall('apt')}
            disabled={status === 'installing'}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'installing' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            自动安装（apt）
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <div>
          <button
            onClick={() => setShowLogs((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <Terminal className="w-3 h-3" />
            安装日志
            {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showLogs && <LogPanel logs={logs} onClear={() => setLogs([])} />}
        </div>
      )}
    </div>
  );
}

// ── Connection card ───────────────────────────────────────────────────────────

interface ConnCardProps {
  conn: SSHConn;
  runtime: SSHConnRuntimeState;
  logs: LogEntry[];
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onDeploy: () => void;
  onCheckStatus: () => void;
  onRestart: () => void;
  onConnInfo: () => void;
  onApproveDevices: () => void;
  onUninstall: () => void;
  onClearLogs: () => void;
}

function ConnCard({
  conn,
  runtime,
  logs,
  onEdit,
  onDelete,
  onTest,
  onDeploy,
  onCheckStatus,
  onRestart,
  onConnInfo,
  onApproveDevices,
  onUninstall,
  onClearLogs,
}: ConnCardProps) {
  const isBusy =
    runtime.status === 'testing' ||
    runtime.status === 'deploying' ||
    runtime.status === 'checking' ||
    runtime.status === 'uninstalling' ||
    runtime.status === 'restarting' ||
    runtime.status === 'fetchingInfo' ||
    runtime.status === 'approving';

  const badge: Record<SSHConnStatus, { label: string; cls: string } | null> = {
    idle: null,
    testing: { label: '测试中', cls: 'bg-sky-500/10 text-sky-500' },
    ok: { label: '✓ 连接正常', cls: 'bg-emerald-500/10 text-emerald-500' },
    fail: { label: '✗ 失败', cls: 'bg-red-500/10 text-red-500' },
    deploying: { label: '部署中', cls: 'bg-amber-500/10 text-amber-500' },
    checking: { label: '检查中', cls: 'bg-sky-500/10 text-sky-500' },
    restarting: { label: '重启中', cls: 'bg-amber-500/10 text-amber-500' },
    fetchingInfo: { label: '获取中', cls: 'bg-sky-500/10 text-sky-500' },
    approving: { label: '审批中', cls: 'bg-emerald-500/10 text-emerald-500' },
    uninstalling: { label: '卸载中', cls: 'bg-red-500/10 text-red-500' },
  };

  const b = badge[runtime.status];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">
                {conn.name || `${conn.username}@${conn.host}`}
              </span>
              {b && (
                <span
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${b.cls}`}
                >
                  {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                  {b.label}
                </span>
              )}
              {runtime.latencyMs != null && runtime.status === 'ok' && (
                <span className="text-xs font-mono text-muted-foreground">
                  {runtime.latencyMs}ms
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs font-mono text-muted-foreground">
              <span className="flex items-center gap-1">
                {conn.authType === 'key' ? (
                  <Key className="w-3 h-3" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                {conn.username}@{conn.host}:{conn.port}
              </span>
              <span className="text-muted-foreground/50">
                Gateway :{conn.gatewayPort || '18789'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="编辑"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title="删除记录"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {runtime.error && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 leading-relaxed break-words">
          {runtime.error.includes('Permission denied') ? (
            <div className="space-y-1.5">
              <div className="font-mono text-[11px]">{runtime.error}</div>
              {conn.authType === 'key' ? (
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p>可能原因（按可能性排序）：</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>
                      公钥未添加到服务器的{' '}
                      <code className="font-mono bg-muted px-1 rounded">
                        ~/.ssh/authorized_keys
                      </code>
                    </li>
                    <li>
                      私钥文件权限不正确（需 600）——点击「编辑」后使用{' '}
                      <code className="font-mono bg-muted px-1 rounded">chmod 600</code> 按钮修复
                    </li>
                    <li>私钥路径错误，或 .pem 文件不匹配此服务器</li>
                    <li>密钥有密码短语但未配置 SSH Agent</li>
                  </ul>
                  <p className="mt-1 text-muted-foreground/70">
                    → 点击「编辑」打开 SSH 密钥向导，可生成密钥、查看公钥、或一键部署公钥到服务器。
                  </p>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <p>密码错误，或服务器已禁用密码认证（PasswordAuthentication no）。</p>
                  <p>
                    建议改用 SSH 密钥认证：点击「编辑」→ 切换认证方式为「SSH 密钥」，
                    按向导生成密钥并部署公钥。
                  </p>
                </div>
              )}
            </div>
          ) : runtime.error.includes('No such file') ||
            runtime.error.includes('invalid format') ||
            runtime.error.includes('bad permissions') ? (
            <div className="space-y-1">
              <div className="font-mono text-[11px]">{runtime.error}</div>
              <div className="text-[11px] text-muted-foreground">
                私钥文件路径不存在或格式错误。点击「编辑」重新选择密钥文件，并确认权限为 600。
              </div>
            </div>
          ) : (
            runtime.error
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={onTest}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runtime.status === 'testing' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plug className="w-3.5 h-3.5" />
          )}
          测试连接
        </button>

        <button
          onClick={onDeploy}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runtime.status === 'deploying' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          一键部署
        </button>

        <button
          onClick={onCheckStatus}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runtime.status === 'checking' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Activity className="w-3.5 h-3.5" />
          )}
          检查状态
        </button>

        <button
          onClick={onRestart}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runtime.status === 'restarting' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          重启服务
        </button>

        <button
          onClick={onConnInfo}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-medium hover:bg-sky-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runtime.status === 'fetchingInfo' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Key className="w-3.5 h-3.5" />
          )}
          查看令牌
        </button>

        <button
          onClick={onApproveDevices}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="批准所有待配对的浏览器设备 (pairing required 时使用)"
        >
          {runtime.status === 'approving' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          批准设备
        </button>

        <button
          onClick={onUninstall}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runtime.status === 'uninstalling' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          完整卸载
        </button>

        <a
          href="https://docs.openclaw.ai/zh-CN/install"
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          部署文档
        </a>
      </div>

      <LogPanel logs={logs} onClear={onClearLogs} />
    </div>
  );
}

// ── SSH Key auth panel ────────────────────────────────────────────────────────

interface KeyAuthPanelProps {
  keyPath: string;
  host: string;
  port: string;
  username: string;
  onChange: (path: string) => void;
}

function KeyAuthPanel({ keyPath, host, port, username, onChange }: KeyAuthPanelProps) {
  const [detectedKeys, setDetectedKeys] = useState<string[]>([]);
  const [pubKeyContent, setPubKeyContent] = useState('');
  const [pubKeyLoading, setPubKeyLoading] = useState(false);
  const [copiedPub, setCopiedPub] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [fixingPerm, setFixingPerm] = useState(false);
  const [permMsg, setPermMsg] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genLogs, setGenLogs] = useState<LogEntry[]>([]);
  const [deployOpen, setDeployOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [deployLogs, setDeployLogs] = useState<LogEntry[]>([]);
  const [deploying, setDeploying] = useState(false);

  // Scan ~/.ssh/ once on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) return;

    window.api
      .executeCommand(buildListLocalKeysCmd())
      .then((res) => {
        if (res.success && res.output?.trim()) {
          setDetectedKeys(res.output.trim().split('\n').filter(Boolean));
        }
      })
      .catch(() => {});
  }, []);

  // Reload public key whenever keyPath changes
  useEffect(() => {
    const trimmed = keyPath.trim();

    if (!trimmed || typeof window === 'undefined' || !window.api) {
      setPubKeyContent('');

      return;
    }

    setPubKeyLoading(true);
    window.api
      .executeCommand(buildReadPubKeyCmd(trimmed))
      .then((res) => {
        const raw = res.output?.trim() ?? '';

        setPubKeyContent(raw.startsWith('ssh-') ? raw : '');
      })
      .catch(() => setPubKeyContent(''))
      .finally(() => setPubKeyLoading(false));
  }, [keyPath]);

  const handleFixPerm = async () => {
    const trimmed = keyPath.trim();

    if (!trimmed || !window.api) return;
    setFixingPerm(true);
    setPermMsg('');

    const res = await window.api.executeCommand(buildFixKeyPermCmd(trimmed));
    const ok = res.success || res.output?.includes('✓');

    setPermMsg(ok ? '✓ 权限已修复（600）' : (res.error ?? '修复失败'));
    setFixingPerm(false);
    if (ok) setTimeout(() => setPermMsg(''), 4000);
  };

  const handleGenerate = async () => {
    if (!window.api) return;

    const newPath = '~/.ssh/id_ed25519_openclaw';

    setGenerating(true);
    setGenLogs([{ type: 'info', message: `→ 生成 ${newPath} ...` }]);

    const res = await window.api.executeCommand(buildGenKeyCmd(newPath));
    const lines = (res.output ?? res.error ?? '').trim().split('\n');

    setGenLogs(lines.map((m) => ({ type: res.success ? 'stdout' : 'error', message: m })));
    setGenerating(false);

    if (res.success && !res.output?.includes('已存在')) {
      onChange(newPath);
      setDetectedKeys((prev) => [...new Set([...prev, newPath])]);
    }
  };

  const handleDeploy = async () => {
    if (!window.api || !tempPassword.trim() || !host.trim() || !keyPath.trim()) return;
    setDeploying(true);
    setDeployLogs([{ type: 'info', message: `→ 部署公钥到 ${username}@${host} ...` }]);

    const res = await window.api.executeCommand(
      buildCopyIdCmd(keyPath.trim(), tempPassword, username, host, port),
    );
    const out = (res.output ?? res.error ?? '').trim();
    const lines = out.split('\n');
    const ok = res.success || out.includes('authorized_keys');

    setDeployLogs([
      { type: 'info', message: `→ 部署公钥到 ${username}@${host} ...` },
      ...lines.map((m) => ({ type: ok ? ('info' as const) : ('error' as const), message: m })),
    ]);
    setDeploying(false);
  };

  const manualCmd = pubKeyContent
    ? `mkdir -p ~/.ssh && echo '${pubKeyContent.split(' ').slice(0, 2).join(' ')}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
    : '';

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="space-y-3">
      {/* ── Key path row ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-muted-foreground">私钥路径</label>
          {keyPath.trim() && (
            <button
              onClick={handleFixPerm}
              disabled={fixingPerm}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {fixingPerm ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Shield className="w-3 h-3" />
              )}
              chmod 600
            </button>
          )}
        </div>

        <input
          type="text"
          value={keyPath}
          onChange={(e) => onChange(e.target.value)}
          placeholder="~/.ssh/id_rsa  或  ~/Downloads/server.pem"
          className={inputCls}
        />

        {permMsg && (
          <p
            className={`text-[11px] mt-1 ${permMsg.startsWith('✓') ? 'text-emerald-500' : 'text-red-400'}`}
          >
            {permMsg}
          </p>
        )}

        {/* Detected key chips */}
        {detectedKeys.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] text-muted-foreground/50 mb-1.5">检测到本地密钥：</p>
            <div className="flex flex-wrap gap-1.5">
              {detectedKeys.map((k) => (
                <button
                  key={k}
                  onClick={() => onChange(k)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                    keyPath === k
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {k.split('/').pop()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Public key viewer ── */}
      {keyPath.trim() && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">对应公钥</span>
            {pubKeyContent && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(pubKeyContent).catch(() => {});
                  setCopiedPub(true);
                  setTimeout(() => setCopiedPub(false), 2000);
                }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedPub ? (
                  <CheckCheck className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copiedPub ? '已复制' : '复制'}
              </button>
            )}
          </div>

          {pubKeyLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              读取中…
            </div>
          ) : pubKeyContent ? (
            <code className="block text-[10.5px] font-mono text-zinc-400 break-all leading-relaxed">
              {pubKeyContent}
            </code>
          ) : (
            <p className="text-[11px] text-muted-foreground/50 italic">
              未找到公钥（路径错误、文件不存在或 .pub 文件缺失）
            </p>
          )}

          {pubKeyContent && (
            <div className="flex items-start gap-1.5 text-[10.5px] text-amber-500/80 dark:text-amber-400/70">
              <Info className="w-3 h-3 shrink-0 mt-px" />
              <span>
                请确保此公钥已添加到服务器的{' '}
                <code className="font-mono">~/.ssh/authorized_keys</code>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── SSH Key Wizard ── */}
      <div className="rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => setShowWizard((v) => !v)}
          className="flex items-center justify-between w-full px-3 py-2.5 text-[11.5px] text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5" />
            SSH 密钥向导
          </span>
          {showWizard ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showWizard && (
          <div className="px-4 pb-4 pt-2 border-t border-border space-y-5">
            {/* Step 1: Generate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">① 生成密钥对</p>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Fingerprint className="w-3 h-3" />
                  )}
                  {generating ? '生成中…' : '生成 ed25519 密钥'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                在本机生成 <code className="font-mono">~/.ssh/id_ed25519_openclaw</code>{' '}
                密钥对（无密码短语）
              </p>
              {genLogs.length > 0 && (
                <div className="rounded-lg bg-zinc-950 p-3 font-mono text-[10.5px] space-y-px max-h-36 overflow-y-auto">
                  {genLogs.map((l, i) => (
                    <div key={i} className={LOG_COLORS[l.type]}>
                      {l.message}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border" />

            {/* Step 2: Deploy via ssh-copy-id */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">② 一键部署公钥</p>
                <button
                  onClick={() => setDeployOpen((v) => !v)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {deployOpen ? '收起' : '展开'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                若服务器暂时允许密码登录，可一键将公钥追加到{' '}
                <code className="font-mono">~/.ssh/authorized_keys</code>，之后无需密码。
              </p>

              {deployOpen && (
                <div className="space-y-2 pt-1">
                  {!host.trim() && (
                    <p className="text-[11px] text-amber-500/80">← 请先在上方填写服务器地址</p>
                  )}
                  {!keyPath.trim() && (
                    <p className="text-[11px] text-amber-500/80">← 请先选择或生成密钥文件</p>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      placeholder="服务器登录密码（仅此一次）"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={handleDeploy}
                      disabled={
                        deploying || !tempPassword.trim() || !host.trim() || !keyPath.trim()
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deploying ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Upload className="w-3 h-3" />
                      )}
                      部署公钥
                    </button>
                  </div>

                  <p className="text-[10.5px] text-muted-foreground/50">
                    需本地已安装 <code className="font-mono">sshpass</code>
                    ；密码仅用于此次部署，不会被保存
                  </p>

                  {deployLogs.length > 0 && (
                    <div className="rounded-lg bg-zinc-950 p-3 font-mono text-[10.5px] space-y-px max-h-36 overflow-y-auto">
                      {deployLogs.map((l, i) => (
                        <div key={i} className={LOG_COLORS[l.type]}>
                          {l.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border" />

            {/* Step 3: Manual */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">③ 手动添加公钥（备选）</p>
              <p className="text-[11px] text-muted-foreground/60">
                若有云厂商的 VNC / Web 终端，在服务器上执行以下命令：
              </p>
              {manualCmd ? (
                <div className="space-y-1.5">
                  <code className="block px-3 py-2 rounded-lg bg-zinc-950 font-mono text-[10.5px] text-zinc-400 break-all leading-relaxed">
                    {manualCmd}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(manualCmd).catch(() => {});
                      setCopiedCmd(true);
                      setTimeout(() => setCopiedCmd(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copiedCmd ? (
                      <CheckCheck className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedCmd ? '已复制' : '复制命令'}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground/40 italic">
                  选择或生成密钥文件后，命令将自动生成
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Connection form ───────────────────────────────────────────────────────────

type FormData = Omit<SSHConn, 'id' | 'createdAt'>;

const FORM_DEFAULT: FormData = {
  name: '',
  host: '',
  port: '22',
  username: 'root',
  authType: 'password',
  password: '',
  keyPath: '',
  gatewayPort: '18789',
};

interface ConnFormProps {
  initial?: FormData;
  onSave: (data: FormData) => void;
  onCancel: () => void;
}

function ConnForm({ initial, onSave, onCancel }: ConnFormProps) {
  const [form, setForm] = useState<FormData>(initial ?? FORM_DEFAULT);
  const [showPassword, setShowPassword] = useState(false);

  const set = (patch: Partial<FormData>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {initial ? '编辑连接' : '新建 SSH 连接'}
        </h3>
        <button
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          取消
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">连接名称</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="生产服务器"
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">用户名</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => set({ username: e.target.value })}
            placeholder="root"
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            服务器地址
          </label>
          <input
            type="text"
            value={form.host}
            onChange={(e) => set({ host: e.target.value })}
            placeholder="192.168.1.100 或 example.com"
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">SSH 端口</label>
          <input
            type="number"
            value={form.port}
            onChange={(e) => set({ port: e.target.value })}
            placeholder="22"
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Gateway 端口
          </label>
          <input
            type="number"
            value={form.gatewayPort}
            onChange={(e) => set({ gatewayPort: e.target.value })}
            placeholder="18789"
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Auth type */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">认证方式</label>
        <div className="flex gap-2 p-1 rounded-lg bg-muted w-fit">
          {(['password', 'key'] as const).map((type) => (
            <button
              key={type}
              onClick={() => set({ authType: type })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                form.authType === type
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {type === 'password' ? <Lock className="w-3 h-3" /> : <Key className="w-3 h-3" />}
              {type === 'password' ? '密码' : 'SSH 密钥'}
            </button>
          ))}
        </div>
      </div>

      {form.authType === 'password' ? (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">密码</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
              placeholder="服务器登录密码"
              className="w-full pl-3 pr-10 py-2 rounded-lg border border-border bg-muted/30 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1">
            密码模式需要本地安装 <code className="font-mono">sshpass</code>（见页面顶部提示）
          </p>
        </div>
      ) : (
        <KeyAuthPanel
          keyPath={form.keyPath}
          host={form.host}
          port={form.port}
          username={form.username}
          onChange={(path) => set({ keyPath: path })}
        />
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          取消
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={!form.host.trim() || !form.username.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {initial ? '保存修改' : '添加连接'}
        </button>
      </div>
    </div>
  );
}

// ── Deploy steps info banner ──────────────────────────────────────────────────

function DeployInfoBanner() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          <span>「一键部署」将在远程服务器执行的操作</span>
        </div>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {[
            '① 检测 Node.js，未安装则自动安装 LTS（apt / yum）',
            '② npm install -g openclaw@latest',
            '③ 写入 /etc/systemd/system/openclaw-gateway.service',
            '④ systemctl enable openclaw-gateway（开机自启）',
            '⑤ systemctl start openclaw-gateway（立即启动）',
          ].map((s) => (
            <div key={s} className="flex items-start gap-2">
              <span className="text-primary mt-0.5">›</span>
              <span>{s}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-border text-muted-foreground/60">
            部署在后台运行，日志写入 /tmp/openclaw-deploy.log，点击「检查状态」查看进度。
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SSHDeployPage() {
  // ── Connection list from global store ──────────────────────────────────────
  const connections = useConnectionStore((s) => s.connections);
  const addConnection = useConnectionStore((s) => s.addConnection);
  const updateConnection = useConnectionStore((s) => s.updateConnection);
  const removeConnection = useConnectionStore((s) => s.removeConnection);

  // Guard against SSR/client hydration mismatch (Zustand persist hydrates from
  // localStorage only on the client, so connections is [] on the server).
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // ── Per-connection runtime state (deploy status, logs) — local only ────────
  const [runtimeMap, setRuntimeMap] = useState<Record<string, SSHConnRuntimeState>>({});
  const [logsMap, setLogsMap] = useState<Record<string, LogEntry[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<SSHConn | null>(null);

  const setRuntime = (id: string, patch: Partial<SSHConnRuntimeState>) => {
    setRuntimeMap((prev) => {
      const existing: SSHConnRuntimeState = prev[id] ?? { status: 'idle' };

      return { ...prev, [id]: { ...existing, ...patch } };
    });
  };

  const pushLog = (id: string, entry: LogEntry) => {
    setLogsMap((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), entry] }));
  };

  const handleSave = (data: FormData) => {
    if (editingConn) {
      updateConnection(editingConn.id, data);
    } else {
      addConnection(data);
    }

    setShowForm(false);
    setEditingConn(null);
  };

  const handleEdit = (conn: SSHConn) => {
    setEditingConn(conn);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    removeConnection(id);
  };

  const handleTest = async (conn: SSHConn) => {
    if (!window.api) return;

    const t0 = Date.now();
    setRuntime(conn.id, { status: 'testing', error: undefined });
    setLogsMap((prev) => ({ ...prev, [conn.id]: [] }));
    pushLog(conn.id, {
      type: 'info',
      message: `连接 ${conn.username}@${conn.host}:${conn.port}...`,
    });

    try {
      const res = await window.api.executeCommand(buildSshCmd(conn, 'echo __ok__'));
      const latencyMs = Date.now() - t0;
      const out = res.output?.trim() ?? '';

      if (res.success && out.includes('__ok__')) {
        setRuntime(conn.id, { status: 'ok', latencyMs });
        pushLog(conn.id, { type: 'info', message: `✓ SSH 连接成功（${latencyMs}ms）` });
      } else {
        const errMsg = res.error ?? out ?? '连接失败';
        setRuntime(conn.id, { status: 'fail', error: errMsg, latencyMs });
        pushLog(conn.id, { type: 'error', message: errMsg });
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '连接出错';
      setRuntime(conn.id, { status: 'fail', error: errMsg });
      pushLog(conn.id, { type: 'error', message: errMsg });
    }
  };

  const handleDeploy = async (conn: SSHConn) => {
    if (!window.api) return;

    const gwPort = conn.gatewayPort || '18789';
    setRuntime(conn.id, { status: 'deploying', error: undefined });
    setLogsMap((prev) => ({ ...prev, [conn.id]: [] }));
    pushLog(conn.id, { type: 'info', message: '正在向远端后台启动完整部署脚本...' });
    pushLog(conn.id, {
      type: 'info',
      message: '步骤: Node.js → OpenClaw CLI → systemd 服务 → 启动',
    });

    // Run deploy script in background, return PID immediately.
    // The whole remoteCmd is passed to buildSshCmd which base64-encodes it,
    // so we don't need to shell-escape the inner deployCmd separately.
    const deployCmd = buildDeployScript(gwPort).replace('__HOST__', conn.host);
    const remoteCmd = `nohup bash << 'DEPLOYEOF'\n${deployCmd}\nDEPLOYEOF\n> /tmp/openclaw-deploy.log 2>&1 & echo "DEPLOY_PID:$!"`;

    try {
      const res = await window.api.executeCommand(buildSshCmd(conn, remoteCmd));

      if (res.success || res.output?.includes('DEPLOY_PID:')) {
        const pid = res.output?.match(/DEPLOY_PID:(\d+)/)?.[1];
        setRuntime(conn.id, { status: 'ok' });
        pushLog(conn.id, {
          type: 'info',
          message: `✓ 部署脚本已在远端后台启动${pid ? `（PID: ${pid}）` : ''}`,
        });
        pushLog(conn.id, { type: 'info', message: '点击「检查状态」可查看实时进度和日志' });
      } else {
        const errMsg = res.error ?? res.output ?? '启动失败';
        setRuntime(conn.id, { status: 'fail', error: errMsg });
        pushLog(conn.id, { type: 'error', message: errMsg });
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '部署出错';
      setRuntime(conn.id, { status: 'fail', error: errMsg });
      pushLog(conn.id, { type: 'error', message: errMsg });
    }
  };

  const handleCheckStatus = async (conn: SSHConn) => {
    if (!window.api) return;

    const gwPort = conn.gatewayPort || '18789';
    setRuntime(conn.id, { status: 'checking', error: undefined });
    pushLog(conn.id, { type: 'info', message: '正在读取远端状态...' });

    try {
      const res = await window.api.executeCommand(buildSshCmd(conn, buildStatusScript(gwPort)));
      const out = (res.output ?? res.error ?? '无输出').trim();
      setRuntime(conn.id, { status: 'idle' });
      out.split('\n').forEach((line) => pushLog(conn.id, { type: 'stdout', message: line }));
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '检查失败';
      setRuntime(conn.id, { status: 'fail', error: errMsg });
      pushLog(conn.id, { type: 'error', message: errMsg });
    }
  };

  const handleRestart = async (conn: SSHConn) => {
    if (!window.api) return;
    setRuntime(conn.id, { status: 'restarting', error: undefined });
    pushLog(conn.id, { type: 'info', message: '正在重启 Gateway 服务...' });

    try {
      const res = await window.api.executeCommand(buildSshCmd(conn, buildRestartScript()));
      const out = (res.output ?? res.error ?? '无输出').trim();
      setRuntime(conn.id, { status: 'idle' });
      out.split('\n').forEach((line) => pushLog(conn.id, { type: 'stdout', message: line }));
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '重启失败';
      setRuntime(conn.id, { status: 'fail', error: errMsg });
      pushLog(conn.id, { type: 'error', message: errMsg });
    }
  };

  const handleConnInfo = async (conn: SSHConn) => {
    if (!window.api) return;

    const gwPort = conn.gatewayPort || '18789';
    setRuntime(conn.id, { status: 'fetchingInfo', error: undefined });
    setLogsMap((prev) => ({ ...prev, [conn.id]: [] }));
    pushLog(conn.id, { type: 'info', message: '正在获取 Gateway 连接信息...' });

    try {
      const res = await window.api.executeCommand(
        buildSshCmd(conn, buildConnInfoScript(conn.host, gwPort)),
      );
      const out = (res.output ?? res.error ?? '无输出').trim();
      setRuntime(conn.id, { status: 'idle' });
      out.split('\n').forEach((line) => pushLog(conn.id, { type: 'stdout', message: line }));
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '获取失败';
      setRuntime(conn.id, { status: 'fail', error: errMsg });
      pushLog(conn.id, { type: 'error', message: errMsg });
    }
  };

  const handleApproveDevices = async (conn: SSHConn) => {
    if (!window.api) return;
    setRuntime(conn.id, { status: 'approving', error: undefined });
    setLogsMap((prev) => ({ ...prev, [conn.id]: [] }));
    pushLog(conn.id, { type: 'info', message: '正在批准待配对设备...' });

    try {
      const res = await window.api.executeCommand(buildSshCmd(conn, buildApproveDevicesScript()));
      const out = (res.output ?? res.error ?? '无输出').trim();
      setRuntime(conn.id, { status: 'idle' });
      out.split('\n').forEach((line) => pushLog(conn.id, { type: 'stdout', message: line }));
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '批准失败';
      setRuntime(conn.id, { status: 'fail', error: errMsg });
      pushLog(conn.id, { type: 'error', message: errMsg });
    }
  };

  const handleUninstall = async (conn: SSHConn) => {
    if (!window.api) return;
    setRuntime(conn.id, { status: 'uninstalling', error: undefined });
    setLogsMap((prev) => ({ ...prev, [conn.id]: [] }));
    pushLog(conn.id, {
      type: 'info',
      message: '开始完整卸载（停止服务 + 删除配置 + 卸载 CLI）...',
    });

    try {
      const res = await window.api.executeCommand(buildSshCmd(conn, buildUninstallScript()));
      const out = (res.output ?? '').trim();

      if (res.success || out.includes('卸载完成')) {
        setRuntime(conn.id, { status: 'ok' });
        out.split('\n').forEach((line) => pushLog(conn.id, { type: 'info', message: line }));
      } else {
        const errMsg = res.error ?? out ?? '卸载失败';
        setRuntime(conn.id, { status: 'fail', error: errMsg });
        out.split('\n').forEach((line) => pushLog(conn.id, { type: 'stdout', message: line }));

        if (res.error) {
          pushLog(conn.id, { type: 'error', message: res.error });
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '卸载出错';
      setRuntime(conn.id, { status: 'fail', error: errMsg });
      pushLog(conn.id, { type: 'error', message: errMsg });
    }
  };

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-[22px] font-bold tracking-tight text-foreground mb-1.5">
          SSH 远程部署
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          通过 SSH 连接到远程服务器，自动安装 OpenClaw 并设置为系统服务（开机自启）。
        </p>
      </div>

      <SshpassBanner />
      <DeployInfoBanner />

      {!showForm && (
        <button
          onClick={() => {
            setEditingConn(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors w-full justify-center"
        >
          <Plus className="w-4 h-4" />
          添加 SSH 连接
        </button>
      )}

      {showForm && (
        <ConnForm
          initial={
            editingConn
              ? {
                  name: editingConn.name,
                  host: editingConn.host,
                  port: editingConn.port,
                  username: editingConn.username,
                  authType: editingConn.authType,
                  password: editingConn.password,
                  keyPath: editingConn.keyPath,
                  gatewayPort: editingConn.gatewayPort || '18789',
                }
              : undefined
          }
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingConn(null);
          }}
        />
      )}

      {mounted && connections.length === 0 && !showForm && (
        <div className="py-14 text-center text-sm text-muted-foreground">
          暂无 SSH 连接，点击上方按钮添加
        </div>
      )}

      <div className="space-y-4">
        {mounted &&
          connections.map((conn) => (
            <ConnCard
              key={conn.id}
              conn={conn}
              runtime={runtimeMap[conn.id] ?? { status: 'idle' }}
              logs={logsMap[conn.id] ?? []}
              onEdit={() => handleEdit(conn)}
              onDelete={() => handleDelete(conn.id)}
              onTest={() => handleTest(conn)}
              onDeploy={() => handleDeploy(conn)}
              onCheckStatus={() => handleCheckStatus(conn)}
              onRestart={() => handleRestart(conn)}
              onConnInfo={() => handleConnInfo(conn)}
              onApproveDevices={() => handleApproveDevices(conn)}
              onUninstall={() => handleUninstall(conn)}
              onClearLogs={() => setLogsMap((p) => ({ ...p, [conn.id]: [] }))}
            />
          ))}
      </div>
    </div>
  );
}
