import { is } from '@electron-toolkit/utils';
import { exec, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { createServer } from 'http';
import { homedir, userInfo } from 'os';
import { dirname, join } from 'path';
import { basename, extname } from 'path';
import { promisify } from 'util';

// Callback HTML served to the browser after ClawHub OAuth redirect
const CLAWHUB_CALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>ClawHub Login</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; }
    .card { max-width: 520px; margin: 60px auto; padding: 20px 24px;
            border: 1px solid rgba(127,127,127,.35); border-radius: 12px; }
    h1 { margin: 0 0 10px; font-size: 18px; }
    p  { margin: 0; opacity: .8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Completing login…</h1>
    <p id="status">Waiting for token.</p>
  </div>
  <script>
    const statusEl = document.getElementById('status');
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    const token = p.get('token'), registry = p.get('registry'), state = p.get('state');
    if (!token || !state) {
      statusEl.textContent = 'Missing token or state. Close this tab and try again.';
    } else {
      fetch('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, registry, state }),
      })
        .then(() => {
          statusEl.textContent = 'Logged in! You can close this tab.';
          setTimeout(() => window.close(), 400);
        })
        .catch(() => {
          statusEl.textContent = 'Failed to send token. Close this tab and try again.';
        });
    }
  </script>
</body>
</html>`;

// Extract a short description from a skill directory (reads SKILL.md or package.json)
function extractSkillDescription(skillPath: string): string {
  try {
    const content = readFileSync(join(skillPath, 'SKILL.md'), 'utf-8');
    // Frontmatter: description: "..."
    const fmMatch = content.match(/^description:\s*(.+)$/m);
    if (fmMatch) return fmMatch[1].trim().replace(/^["']|["']$/g, '');

    // First non-frontmatter heading
    const stripped = content.replace(/^---[\s\S]*?---\s*/m, '');
    const heading = stripped.match(/^#+\s+(.+)$/m);
    if (heading) return heading[1].trim();

    // First non-empty paragraph line
    const line = stripped.split('\n').find((l) => l.trim() && !l.startsWith('#'));

    return line?.trim().slice(0, 100) ?? '';
  } catch {
    /* ignore */
  }

  try {
    const pkg = JSON.parse(readFileSync(join(skillPath, 'package.json'), 'utf-8'));

    return (pkg.description as string) ?? '';
  } catch {
    /* ignore */
  }

  return '';
}

const execAsync = promisify(exec);

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  children?: FileEntry[];
}

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.DS_Store']);

function readDirTree(dir: string, maxDepth: number, depth = 0): FileEntry[] {
  if (depth >= maxDepth) return [];

  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => !SKIP_DIRS.has(e.name))
      .sort((a, b) => {
        // Directories first, then files; alphabetical within each group
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;

        return a.name.localeCompare(b.name);
      })
      .map((e) => ({
        name: e.name,
        type: (e.isDirectory() ? 'dir' : 'file') as 'file' | 'dir',
        children: e.isDirectory() ? readDirTree(join(dir, e.name), maxDepth, depth + 1) : undefined,
      }));
  } catch {
    return [];
  }
}

type LogSender = (type: string, message: string) => void;

export class IpcConfig {
  private mainWindow: BrowserWindow | null;
  private storedNpmPath: string | null = null;

  constructor(mainWindow: BrowserWindow | null = null) {
    this.mainWindow = mainWindow;
  }

  updateMainWindow(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;
  }

  setupHandlers(): void {
    this.setupFileHandlers();
    this.setupNotificationHandlers();
    this.setupWindowHandlers();
    this.setupDebugHandlers();
    this.setupAppStatusHandlers();
    this.setupCommandHandlers();
    this.setupAgentAuthHandlers();
    this.setupInstallHandlers();
    this.setupConfigHandlers();
    this.setupMarkdownFileHandlers();
    this.setupSkillHandlers();
    this.setupEnvToolHandlers();
  }

  private setupFileHandlers(): void {
    ipcMain.handle('open-file-dialog', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ['openFile'],
        filters: [
          {
            name: '视频文件',
            extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg'],
          },
          { name: '所有文件', extensions: ['*'] },
          { name: '文本文件', extensions: ['txt', 'md'] },
          { name: '图片文件', extensions: ['jpg', 'png', 'gif'] },
        ],
      });

      return result;
    });

    ipcMain.handle('save-file-dialog', async () => {
      const result = await dialog.showSaveDialog(this.mainWindow!, {
        filters: [
          { name: '文本文件', extensions: ['txt'] },
          { name: 'Markdown 文件', extensions: ['md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      return result;
    });
  }

  private setupNotificationHandlers(): void {
    ipcMain.handle('show-notification', (_, title, body) => {
      if (Notification.isSupported()) {
        new Notification({
          title,
          body,
          icon: join(__dirname, '../../resources/icon.png'),
        }).show();
      }
    });
  }

  private setupWindowHandlers(): void {
    ipcMain.handle('minimize-window', () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle('maximize-window', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle('close-window', () => {
      this.mainWindow?.close();
    });
  }

  private setupDebugHandlers(): void {
    ipcMain.handle('open-devtools', () => {
      this.mainWindow?.webContents.openDevTools();
    });

    ipcMain.handle('close-devtools', () => {
      this.mainWindow?.webContents.closeDevTools();
    });

    ipcMain.handle('toggle-devtools', () => {
      if (this.mainWindow?.webContents.isDevToolsOpened()) {
        this.mainWindow.webContents.closeDevTools();
      } else {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    ipcMain.handle('log-to-console', (_, message, level = 'info') => {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

      switch (level) {
        case 'error':
          console.error(logMessage);
          break;
        case 'warn':
          console.warn(logMessage);
          break;
        case 'debug':
          console.debug(logMessage);
          break;
        default:
          console.log(logMessage);
      }

      return logMessage;
    });
  }

  private setupAppStatusHandlers(): void {
    ipcMain.handle('get-app-status', () => {
      return {
        isDev: is.dev,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        windowCount: BrowserWindow.getAllWindows().length,
        isDevToolsOpen: this.mainWindow?.webContents.isDevToolsOpened() || false,
      };
    });

    ipcMain.handle('get-system-info', () => {
      return {
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron,
      };
    });

    ipcMain.handle('get-app-version', () => {
      return process.env.npm_package_version || '1.0.0';
    });

    ipcMain.handle('get-platform', () => {
      return process.platform;
    });
  }

  private setupAgentAuthHandlers(): void {
    // Sync openclaw.json provider API keys into every agent's auth-profiles.json
    // so the agent can find credentials without running `openclaw agents add` manually.
    ipcMain.handle(
      'sync-agent-auth',
      async (_, providers: Record<string, { apiKey?: string; api?: string }>) => {
        try {
          const agentDir = join(homedir(), '.openclaw', 'agents', 'main', 'agent');
          const authPath = join(agentDir, 'auth-profiles.json');

          mkdirSync(agentDir, { recursive: true });

          let existing: {
            version?: number;
            profiles?: Record<string, unknown>;
            usageStats?: Record<string, unknown>;
          } = { version: 1, profiles: {} };

          try {
            existing = JSON.parse(readFileSync(authPath, 'utf8'));
          } catch {
            // file doesn't exist yet — that's fine
          }

          const profiles = { ...(existing.profiles ?? {}) };

          for (const [name, p] of Object.entries(providers)) {
            if (p.apiKey) {
              profiles[name] = { type: 'api_key', provider: name, key: p.apiKey };
            }
          }

          const updated = { ...existing, profiles };

          writeFileSync(authPath, JSON.stringify(updated, null, 2), 'utf8');

          return { success: true };
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);

          return { success: false, error: msg };
        }
      },
    );
  }

  private setupCommandHandlers(): void {
    ipcMain.handle('execute-command', async (_, command: string) => {
      try {
        console.log(`执行命令: ${command}`);

        const env = this.getSystemEnv();
        const { stdout, stderr } = await execAsync(command, {
          timeout: 15000,
          maxBuffer: 1024 * 1024 * 10,
          env,
        });

        if (stderr && !stdout) {
          return { success: true, output: stderr, error: null };
        }

        return { success: true, output: stdout, error: null };
      } catch (error: any) {
        console.error('执行命令失败:', error);

        return {
          success: false,
          output: error.stdout || null,
          error: error.message || '执行命令时发生未知错误',
        };
      }
    });

    // Dedicated handler for restarting the OpenClaw gateway.
    // Strategy (macOS):
    //   1. launchctl kickstart -k  (works when LaunchAgent is already loaded)
    //   2. launchctl bootstrap     (registers + starts plist if not yet loaded)
    //   3. zsh -l -c "openclaw gateway start"  (fallback, runs via user shell)
    // Strategy (Windows): openclaw gateway start via system PATH
    ipcMain.handle('restart-gateway', async () => {
      try {
        if (process.platform === 'win32') {
          const env = this.getSystemEnv();
          const { stdout, stderr } = await execAsync('openclaw gateway start', {
            env,
            timeout: 15000,
          });

          return { success: true, output: (stdout || stderr || '').trim() || '网关已启动' };
        }

        // macOS — get UID from Node.js, no shell substitution needed
        const uid = userInfo().uid;
        const serviceLabel = 'ai.openclaw.gateway';
        const target = `gui/${uid}/${serviceLabel}`;
        const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${serviceLabel}.plist`);

        const env = this.getSystemEnv();

        // 1. Try kickstart (service already registered with launchd)
        try {
          const { stdout, stderr } = await execAsync(`/bin/launchctl kickstart -k ${target}`, {
            timeout: 15000,
          });
          const out = (stdout || stderr || '').trim();
          console.log('launchctl kickstart ok:', out);

          return { success: true, output: out || '网关已重启' };
        } catch (e1: any) {
          console.log('kickstart failed:', e1.message);
        }

        // 2. If plist is missing, run `openclaw gateway install` to create it
        if (!existsSync(plistPath)) {
          console.log('plist not found, running openclaw gateway install…');

          try {
            const { stdout, stderr } = await execAsync(
              '/bin/zsh -l -c "openclaw gateway install"',
              { env, timeout: 20000 },
            );
            console.log('gateway install:', (stdout || stderr || '').trim());
          } catch (installErr: any) {
            console.log('gateway install failed:', installErr.message);
          }
        }

        // 3. Bootstrap via plist (registers + starts the service)
        if (existsSync(plistPath)) {
          try {
            // bootout is best-effort (ignore if not loaded)
            await execAsync(`/bin/launchctl bootout ${target}`, { timeout: 5000 }).catch(
              () => null,
            );

            const { stdout, stderr } = await execAsync(
              `/bin/launchctl bootstrap gui/${uid} "${plistPath}"`,
              { timeout: 15000 },
            );
            const out = (stdout || stderr || '').trim();
            console.log('launchctl bootstrap ok:', out);

            return {
              success: true,
              output: out || '已通过 LaunchAgent 启动网关',
            };
          } catch (e2: any) {
            console.log('bootstrap failed:', e2.message);
          }
        }

        // 4. Last resort: run via user login shell so PATH / nvm / brew are loaded
        try {
          const { stdout, stderr } = await execAsync(
            '/bin/zsh -l -c "openclaw gateway start > /tmp/openclaw-gateway.log 2>&1 &"',
            { env, timeout: 10000 },
          );
          const out = (stdout || stderr || '').trim();

          return {
            success: true,
            output: out || '已后台启动网关（zsh fallback）',
          };
        } catch (e3: any) {
          return { success: false, output: `所有启动方式均失败:\n${e3.message}` };
        }
      } catch (err: any) {
        return { success: false, output: err.message };
      }
    });
  }

  // ─── Install handlers ───────────────────────────────────────────────────────

  private setupInstallHandlers(): void {
    ipcMain.handle('check-system-node', async () => {
      const env = this.getSystemEnv();

      try {
        const { stdout: version } = await execAsync('node --version', { env, timeout: 10000 });
        const cmd = process.platform === 'win32' ? 'where node' : 'which node';
        const { stdout: nodePath } = await execAsync(cmd, { env, timeout: 5000 });
        const npmCmd = process.platform === 'win32' ? 'where npm' : 'which npm';
        const { stdout: npmPath } = await execAsync(npmCmd, { env, timeout: 5000 });
        const np = nodePath.trim().split('\n')[0].trim();
        const npmP = npmPath.trim().split('\n')[0].trim();
        this.storedNpmPath = npmP;

        return { found: true, version: version.trim(), nodePath: np, npmPath: npmP };
      } catch {
        return { found: false };
      }
    });

    ipcMain.handle('check-openclaw', async () => {
      const env = this.getSystemEnv();

      try {
        const { stdout } = await execAsync('openclaw --version', { env, timeout: 10000 });

        return { found: true, version: stdout.trim() };
      } catch {
        return { found: false };
      }
    });

    ipcMain.handle('install-node-lts', async () => {
      const sendLog: LogSender = (type, message) => {
        this.mainWindow?.webContents.send('install-log', { type, message, timestamp: Date.now() });
      };

      return await this.installNodeLts(sendLog);
    });

    ipcMain.handle('install-openclaw', async () => {
      const sendLog: LogSender = (type, message) => {
        this.mainWindow?.webContents.send('install-log', { type, message, timestamp: Date.now() });
      };

      return await this.installOpenclaw(sendLog);
    });
  }

  /** Return the platform-specific path for the clawhub config file. */
  private getClawHubConfigPath(): string {
    const home = homedir();

    if (process.platform === 'darwin') {
      return join(home, 'Library', 'Application Support', 'clawhub', 'config.json');
    }

    if (process.platform === 'win32') {
      return join(process.env.APPDATA || home, 'clawhub', 'config.json');
    }

    return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'clawhub', 'config.json');
  }

  /**
   * Perform ClawHub browser-based OAuth.
   * 1. Starts a loopback HTTP server on a random port.
   * 2. Opens the ClawHub auth page in the system browser.
   * 3. Waits for the browser to POST the token back.
   * 4. Saves the token to the clawhub config file.
   */
  private performClawHubLogin(): Promise<{ success: boolean; error?: string }> {
    const expectedState = randomBytes(16).toString('hex');
    const configPath = this.getClawHubConfigPath();

    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        const url = req.url ?? '/';
        const method = req.method ?? 'GET';

        // Serve the callback page (browser lands here after OAuth)
        if (method === 'GET' && url.startsWith('/callback')) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(CLAWHUB_CALLBACK_HTML);

          return;
        }

        // Receive the token posted by the callback page's JS
        if (method === 'POST' && url === '/token') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                token?: string;
                registry?: string;
                state?: string;
              };
              if (body.state !== expectedState) throw new Error('state mismatch');
              if (!body.token?.trim()) throw new Error('no token received');

              const configDir = dirname(configPath);
              mkdirSync(configDir, { recursive: true, mode: 0o700 });
              writeFileSync(
                configPath,
                `${JSON.stringify(
                  { registry: body.registry ?? 'https://clawhub.ai', token: body.token.trim() },
                  null,
                  2,
                )}\n`,
                { mode: 0o600 },
              );

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
              server.close();
              resolve({ success: true });
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false }));
              server.close();
              resolve({ success: false, error: (e as Error).message });
            }
          });

          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      server.on('error', (err) => resolve({ success: false, error: err.message }));

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        const redirectUri = `http://127.0.0.1:${addr.port}/callback`;

        const authUrl = new URL('https://clawhub.ai/cli/auth');
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('state', expectedState);
        authUrl.searchParams.set(
          'label_b64',
          Buffer.from('OpenClaw App', 'utf8').toString('base64url'),
        );

        shell.openExternal(authUrl.toString());

        // Timeout after 5 minutes
        const timeout = setTimeout(
          () => {
            server.close();
            resolve({ success: false, error: '登录超时（5分钟），请重试' });
          },
          5 * 60 * 1000,
        );

        server.once('close', () => clearTimeout(timeout));
      });
    });
  }

  /** Read the stored ClawHub auth token (set by `npx clawhub login`). */
  private readClawHubToken(): string | null {
    const home = homedir();
    const candidates: string[] = [];

    if (process.platform === 'darwin') {
      candidates.push(
        join(home, 'Library', 'Application Support', 'clawhub', 'config.json'),
        join(home, 'Library', 'Application Support', 'clawdhub', 'config.json'),
      );
    } else if (process.platform === 'win32') {
      const appData = process.env.APPDATA || '';
      candidates.push(
        join(appData, 'clawhub', 'config.json'),
        join(appData, 'clawdhub', 'config.json'),
      );
    } else {
      const xdg = process.env.XDG_CONFIG_HOME || join(home, '.config');
      candidates.push(join(xdg, 'clawhub', 'config.json'), join(xdg, 'clawdhub', 'config.json'));
    }

    for (const path of candidates) {
      try {
        if (!existsSync(path)) continue;

        const config = JSON.parse(readFileSync(path, 'utf-8')) as { token?: string };
        if (config.token) return config.token;
      } catch {
        // try next candidate
      }
    }

    return null;
  }

  private getSystemEnv(): NodeJS.ProcessEnv {
    if (process.platform === 'win32') {
      const extra = [
        'C:\\Program Files\\nodejs',
        `${process.env.APPDATA}\\npm`,
        `${process.env.LOCALAPPDATA}\\Programs\\nodejs`,
      ].filter(Boolean);
      const PATH = [process.env.PATH, ...extra].filter(Boolean).join(';');

      return { ...process.env, PATH };
    }

    const home = process.env.HOME || '';
    const extra = [
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      `${home}/.nvm/bin`,
      `${home}/.local/share/fnm/aliases/default/bin`,
      `${home}/.local/share/fnm/aliases/lts-latest/bin`,
    ].filter(Boolean);

    const existingPaths = process.env.PATH?.split(':') || [];
    const PATH = [...existingPaths, ...extra]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(':');

    return { ...process.env, PATH };
  }

  private spawnWithLogs(
    command: string,
    args: string[],
    options: { env?: NodeJS.ProcessEnv; cwd?: string },
    sendLog: LogSender,
  ): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
      let output = '';
      const proc = spawn(command, args, {
        ...options,
        stdio: 'pipe',
        shell: process.platform === 'win32',
      });

      proc.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString();
        output += msg;
        sendLog('stdout', msg);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString();
        output += msg;
        sendLog('stderr', msg);
      });

      proc.on('close', (code) => {
        resolve({ code: code ?? 1, output });
      });

      proc.on('error', (err) => {
        sendLog('error', err.message);
        resolve({ code: 1, output: err.message });
      });
    });
  }

  private async installNodeLts(
    sendLog: LogSender,
  ): Promise<{ success: boolean; nodePath?: string; npmPath?: string }> {
    if (process.platform === 'darwin') {
      return this.installNodeMac(sendLog);
    } else if (process.platform === 'win32') {
      return this.installNodeWindows(sendLog);
    } else {
      sendLog('error', '暂不支持此操作系统，请手动安装 Node.js: https://nodejs.org');

      return { success: false };
    }
  }

  private async installNodeMac(
    sendLog: LogSender,
  ): Promise<{ success: boolean; nodePath?: string; npmPath?: string }> {
    const env = this.getSystemEnv();

    // Try Homebrew first
    try {
      await execAsync('which brew', { env, timeout: 5000 });
      sendLog('info', '✓ 检测到 Homebrew，正在安装 Node.js...');
      sendLog('stdout', '$ brew install node\n');

      const { code } = await this.spawnWithLogs('brew', ['install', 'node'], { env }, sendLog);

      if (code === 0) {
        const newEnv = this.getSystemEnv();

        try {
          const { stdout: np } = await execAsync('which node', { env: newEnv, timeout: 5000 });
          const { stdout: npmP } = await execAsync('which npm', { env: newEnv, timeout: 5000 });
          this.storedNpmPath = npmP.trim();
          sendLog('info', `✓ Node.js 安装成功: ${np.trim()}`);

          return { success: true, nodePath: np.trim(), npmPath: npmP.trim() };
        } catch {
          return { success: true };
        }
      }
    } catch {
      sendLog('info', '未检测到 Homebrew，改用 fnm 安装...');
    }

    // Fallback: use fnm
    const home = process.env.HOME || '';
    const fnmBin = `${home}/.local/share/fnm/fnm`;

    sendLog('info', '正在安装 fnm (Fast Node Manager)...');
    sendLog('stdout', '$ curl -fsSL https://fnm.vercel.app/install | bash\n');

    const { code: fnmCode } = await this.spawnWithLogs(
      'bash',
      ['-c', 'curl -fsSL https://fnm.vercel.app/install | bash'],
      { env },
      sendLog,
    );

    if (fnmCode !== 0) {
      sendLog('error', '✗ fnm 安装失败，请检查网络连接后重试');

      return { success: false };
    }

    sendLog('info', '正在安装 Node.js LTS...');
    sendLog('stdout', `$ ${fnmBin} install --lts\n`);

    const { code: nodeCode } = await this.spawnWithLogs(
      fnmBin,
      ['install', '--lts'],
      { env },
      sendLog,
    );

    if (nodeCode !== 0) {
      sendLog('error', '✗ Node.js LTS 安装失败');

      return { success: false };
    }

    await this.spawnWithLogs(fnmBin, ['default', 'lts-latest'], { env }, sendLog);

    const nodePath = `${home}/.local/share/fnm/aliases/lts-latest/bin/node`;
    const npmPath = `${home}/.local/share/fnm/aliases/lts-latest/bin/npm`;
    this.storedNpmPath = npmPath;

    sendLog('info', '✓ Node.js LTS 安装成功');

    return { success: true, nodePath, npmPath };
  }

  private async installNodeWindows(
    sendLog: LogSender,
  ): Promise<{ success: boolean; nodePath?: string; npmPath?: string }> {
    const env = this.getSystemEnv();

    sendLog('info', '正在使用 winget 安装 Node.js LTS...');
    sendLog('stdout', '$ winget install --id OpenJS.NodeJS.LTS\n');

    const { code } = await this.spawnWithLogs(
      'winget',
      [
        'install',
        '--id',
        'OpenJS.NodeJS.LTS',
        '-e',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ],
      { env },
      sendLog,
    );

    if (code === 0) {
      const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
      const npmPath = 'C:\\Program Files\\nodejs\\npm.cmd';
      this.storedNpmPath = npmPath;
      sendLog('info', '✓ Node.js LTS 安装成功');

      return { success: true, nodePath, npmPath };
    }

    sendLog('error', '✗ winget 安装失败，请手动下载 Node.js: https://nodejs.org/en/download/');

    return { success: false };
  }

  private async installOpenclaw(
    sendLog: LogSender,
  ): Promise<{ success: boolean; version?: string }> {
    const env = this.getSystemEnv();
    const npmPath = this.storedNpmPath || 'npm';

    sendLog('info', '正在安装 openclaw@latest...');
    sendLog('stdout', '$ npm install -g openclaw@latest\n');

    const { code } = await this.spawnWithLogs(
      npmPath,
      ['install', '-g', 'openclaw@latest'],
      { env },
      sendLog,
    );

    if (code !== 0) {
      sendLog('error', '✗ OpenClaw 安装失败，请检查 npm 权限或使用管理员权限重试');

      return { success: false };
    }

    try {
      const { stdout } = await execAsync('openclaw --version', { env, timeout: 10000 });
      sendLog('info', `✓ OpenClaw 安装成功: ${stdout.trim()}`);

      return { success: true, version: stdout.trim() };
    } catch {
      sendLog('info', '✓ OpenClaw 安装完成');

      return { success: true };
    }
  }

  // ─── Config file handlers ────────────────────────────────────────────────────

  private setupConfigHandlers(): void {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json');

    ipcMain.handle('read-openclaw-config', () => {
      try {
        const content = readFileSync(configPath, 'utf-8');

        return { success: true, content, path: configPath };
      } catch (err: any) {
        return {
          success: false,
          error: err.code === 'ENOENT' ? 'not-found' : (err.message as string),
          path: configPath,
        };
      }
    });

    ipcMain.handle('write-openclaw-config', (_, content: string) => {
      try {
        mkdirSync(dirname(configPath), { recursive: true });
        writeFileSync(configPath, content, 'utf-8');

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message as string };
      }
    });

    ipcMain.handle('check-openclaw-config-exists', () => {
      return { exists: existsSync(configPath), path: configPath };
    });
  }

  // ─── Markdown file handlers (~/.openclaw/workspace/*.md) ────────────────────

  private setupMarkdownFileHandlers(): void {
    const ALLOWED = new Set(['IDENTITY.md', 'SOUL.md', 'USER.md', 'AGENTS.md', 'MEMORY.md']);

    ipcMain.handle('read-markdown-file', (_: any, filename: string) => {
      if (!ALLOWED.has(filename)) return { success: false, error: 'not-allowed', content: '' };

      const filePath = join(homedir(), '.openclaw', 'workspace', filename);

      try {
        const content = readFileSync(filePath, 'utf-8');

        return { success: true, content, path: filePath };
      } catch (err: any) {
        if (err.code === 'ENOENT') return { success: true, content: '', path: filePath };

        return { success: false, error: err.message as string, content: '' };
      }
    });

    ipcMain.handle('write-markdown-file', (_: any, filename: string, content: string) => {
      if (!ALLOWED.has(filename)) return { success: false, error: 'not-allowed' };

      const dir = join(homedir(), '.openclaw', 'workspace');
      const filePath = join(dir, filename);

      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, content, 'utf-8');

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message as string };
      }
    });
  }

  // ─── OpenClaw Skills handlers ────────────────────────────────────────────────

  private setupSkillHandlers(): void {
    // ── Workspace skills: ~/.openclaw/workspace/skills/ ──
    ipcMain.handle('list-workspace-skills', () => {
      const skillsDir = join(homedir(), '.openclaw', 'workspace', 'skills');

      try {
        mkdirSync(skillsDir, { recursive: true });

        const entries = readdirSync(skillsDir, { withFileTypes: true });
        const skills = entries
          .filter((e) => e.isDirectory())
          .map((e) => {
            const skillPath = join(skillsDir, e.name);

            return {
              name: e.name,
              description: extractSkillDescription(skillPath),
              path: skillPath,
            };
          });

        return { success: true, skills, path: skillsDir };
      } catch (err: any) {
        return { success: false, skills: [], path: skillsDir, error: err.message as string };
      }
    });

    // ── Built-in skills: resolve via `npm root -g`/openclaw/skills/ ──
    ipcMain.handle('list-builtin-skills', async () => {
      const env = this.getSystemEnv();
      const npmPath = this.storedNpmPath || 'npm';

      try {
        const { stdout } = await execAsync(`"${npmPath}" root -g`, { env, timeout: 10000 });
        const globalRoot = stdout.trim();
        const skillsDir = join(globalRoot, 'openclaw', 'skills');

        if (!existsSync(skillsDir)) {
          return {
            success: false,
            skills: [],
            path: skillsDir,
            error: 'OpenClaw 内置 skills 目录不存在，请确认 openclaw 已全局安装',
          };
        }

        const entries = readdirSync(skillsDir, { withFileTypes: true });
        const skills = entries
          .filter((e) => e.isDirectory())
          .map((e) => {
            const skillPath = join(skillsDir, e.name);

            return {
              name: e.name,
              description: extractSkillDescription(skillPath),
              path: skillPath,
            };
          });

        return { success: true, skills, path: skillsDir };
      } catch (err: any) {
        return { success: false, skills: [], path: '', error: err.message as string };
      }
    });

    // ── Check whether a ClawHub auth token is stored ──
    ipcMain.handle('check-clawhub-auth', () => {
      const token = this.readClawHubToken();

      return { hasToken: Boolean(token) };
    });

    // ── Browser-based ClawHub login (loopback OAuth) ──
    ipcMain.handle('clawhub-login', () => this.performClawHubLogin());

    // ── Install a skill from ClawHub via direct API download ──
    ipcMain.handle('install-clawhub-skill', async (_, slug: string) => {
      const sendLog: LogSender = (type, message) => {
        this.mainWindow?.webContents.send('skill-install-log', {
          type,
          message,
          timestamp: Date.now(),
        });
      };

      const env = this.getSystemEnv();
      const skillsDir = join(homedir(), '.openclaw', 'workspace', 'skills');
      const skillDir = join(skillsDir, slug);
      const tmpDir = join(homedir(), '.openclaw', '.tmp');
      const zipPath = join(tmpDir, `${slug}-${Date.now()}.zip`);

      try {
        mkdirSync(tmpDir, { recursive: true });
        mkdirSync(skillsDir, { recursive: true });

        // Read stored clawhub auth token if available
        const token = this.readClawHubToken();

        const downloadUrl = `https://clawhub.ai/api/v1/download?slug=${encodeURIComponent(slug)}`;
        sendLog('stdout', `$ GET ${downloadUrl}\n`);
        if (token) sendLog('info', '使用已存储的 ClawHub 凭证');

        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(downloadUrl, { headers });

        if (!response.ok) {
          const errorText = await response.text().catch(() => `HTTP ${response.status}`);

          if (response.status === 429) {
            throw new Error(
              '请求过于频繁（Rate Limit）。请运行 `npx clawhub login` 登录 ClawHub 账号后再安装。',
            );
          }

          throw new Error(`下载失败: HTTP ${response.status} — ${errorText}`);
        }

        const zipBuffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(zipPath, zipBuffer);
        sendLog('info', `✓ 下载完成 (${Math.round(zipBuffer.length / 1024)}KB)`);

        // Remove existing skill dir if updating
        if (existsSync(skillDir)) {
          sendLog('info', '更新现有技能...');
          await execAsync(
            process.platform === 'win32' ? `rmdir /s /q "${skillDir}"` : `rm -rf "${skillDir}"`,
            { env },
          ).catch(() => null);
        }

        // Extract ZIP into skill directory (quiet / no per-file output)
        sendLog('info', '正在解压...');
        mkdirSync(skillDir, { recursive: true });

        if (process.platform === 'win32') {
          await execAsync(
            `powershell -Command "Expand-Archive -Force '${zipPath}' '${skillDir}'"`,
            { env, timeout: 60_000 },
          );
        } else {
          await execAsync(`unzip -o -q "${zipPath}" -d "${skillDir}"`, {
            env,
            timeout: 60_000,
          });
        }

        sendLog('info', '✓ 解压完成');

        sendLog('info', `✓ ${slug} 安装成功`);

        return { success: true };
      } catch (e) {
        sendLog('error', (e as Error).message);

        return { success: false, error: (e as Error).message };
      } finally {
        try {
          if (existsSync(zipPath)) unlinkSync(zipPath);
        } catch {
          // ignore cleanup errors
        }
      }
    });

    // ── Open a dialog to pick a local skill folder or archive ──
    ipcMain.handle('open-skill-source-dialog', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        title: '选择技能文件夹或压缩包',
        properties: ['openFile', 'openDirectory'],
        filters: [
          { name: '技能压缩包', extensions: ['zip', 'tgz', 'tar.gz', 'gz'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      return result;
    });

    // ── Install a skill from a local folder or archive ──
    ipcMain.handle('install-local-skill', async (_, sourcePath: string) => {
      const sendLog: LogSender = (type, message) => {
        this.mainWindow?.webContents.send('skill-install-log', {
          type,
          message,
          timestamp: Date.now(),
        });
      };

      const env = this.getSystemEnv();
      const skillsDir = join(homedir(), '.openclaw', 'workspace', 'skills');
      const tmpDir = join(homedir(), '.openclaw', '.tmp');
      let tempExtractDir: string | null = null;

      try {
        mkdirSync(skillsDir, { recursive: true });
        mkdirSync(tmpDir, { recursive: true });

        let skillFolderPath: string;
        let skillName: string;

        const src = sourcePath.trim();
        const srcStat = statSync(src);

        if (srcStat.isDirectory()) {
          // ── Folder ──────────────────────────────────────────────────────────
          sendLog('stdout', `$ 读取目录 ${src}\n`);

          if (!existsSync(join(src, 'SKILL.md'))) {
            throw new Error('无效的技能目录：缺少 SKILL.md 文件');
          }

          skillFolderPath = src;
          skillName = basename(src);
        } else {
          // ── Archive ──────────────────────────────────────────────────────────
          const ext = extname(src).toLowerCase();
          const isTarGz = src.endsWith('.tar.gz') || src.endsWith('.tgz');
          const isZip = ext === '.zip';

          if (!isZip && !isTarGz) {
            throw new Error(`不支持的文件格式"${ext}"，请选择 .zip / .tgz / .tar.gz 文件`);
          }

          tempExtractDir = join(tmpDir, `local-skill-${Date.now()}`);
          mkdirSync(tempExtractDir, { recursive: true });

          sendLog('stdout', `$ 解压 ${basename(src)}\n`);

          if (isZip) {
            await execAsync(`unzip -o -q "${src}" -d "${tempExtractDir}"`, {
              env,
              timeout: 120_000,
            });
          } else {
            await execAsync(`tar -xzf "${src}" -C "${tempExtractDir}"`, {
              env,
              timeout: 120_000,
            });
          }

          // Handle single top-level folder (common archive convention)
          const entries = readdirSync(tempExtractDir, { withFileTypes: true });
          let rootInArchive = tempExtractDir;

          if (entries.length === 1 && entries[0].isDirectory()) {
            rootInArchive = join(tempExtractDir, entries[0].name);
          }

          if (!existsSync(join(rootInArchive, 'SKILL.md'))) {
            throw new Error('无效的技能包：压缩包根目录缺少 SKILL.md 文件');
          }

          skillFolderPath = rootInArchive;
          // Derive name from archive filename (strip all extensions)
          skillName = basename(src)
            .replace(/\.(tar\.gz|tgz|zip)$/i, '')
            .replace(/\.tar$/i, '');
        }

        // ── Validate SKILL.md content ──────────────────────────────────────────
        const skillMd = readFileSync(join(skillFolderPath, 'SKILL.md'), 'utf-8').trim();

        if (skillMd.length < 20) {
          throw new Error('SKILL.md 内容过短，不是合规的技能文件');
        }

        sendLog('info', `✓ 通过合规检查（${skillName}）`);

        // ── Install (copy) ──────────────────────────────────────────────────────
        const targetDir = join(skillsDir, skillName);

        if (existsSync(targetDir)) {
          sendLog('info', '更新现有技能...');
          rmSync(targetDir, { recursive: true, force: true });
        }

        sendLog('info', `正在复制到工作区...`);
        cpSync(skillFolderPath, targetDir, { recursive: true });

        sendLog('info', `✓ ${skillName} 安装成功`);

        return { success: true, skillName };
      } catch (e) {
        sendLog('error', (e as Error).message);

        return { success: false, error: (e as Error).message };
      } finally {
        if (tempExtractDir) {
          try {
            rmSync(tempExtractDir, { recursive: true, force: true });
          } catch {
            // ignore cleanup errors
          }
        }
      }
    });

    // ── List files inside a skill directory (max 3 levels deep) ──
    ipcMain.handle('list-skill-files', (_, skillPath: string) => {
      try {
        return { success: true, tree: readDirTree(skillPath, 3) };
      } catch (err: any) {
        return { success: false, tree: [], error: err.message as string };
      }
    });

    // ── Open a directory in Finder / Explorer ──
    ipcMain.handle('open-path-in-finder', async (_, dirPath: string) => {
      try {
        mkdirSync(dirPath, { recursive: true });
        await shell.openPath(dirPath);

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message as string };
      }
    });
  }

  // ─── Env-tool handlers: Node.js / Python / FFmpeg / yt-dlp ─────────────────

  private setupEnvToolHandlers(): void {
    type ToolId = 'node' | 'python' | 'ffmpeg' | 'ytdlp';

    // ── Check a tool version ──
    ipcMain.handle('check-env-tool', async (_, tool: ToolId) => {
      const env = this.getSystemEnv();
      const isWin = process.platform === 'win32';

      const candidates: Record<ToolId, string[]> = {
        node: ['node --version'],
        python: isWin ? ['python --version'] : ['python3 --version', 'python --version'],
        ffmpeg: ['ffmpeg -version'],
        ytdlp: ['yt-dlp --version'],
      };

      for (const cmd of candidates[tool] ?? []) {
        try {
          const { stdout, stderr } = await execAsync(cmd, { env, timeout: 10000 });
          const raw = (stdout || stderr).trim();
          // Extract semver-ish version from output
          const m = raw.match(/(\d+[\.\-]\d+[\.\d\-]*)/);
          const version = m ? m[1] : raw.split('\n')[0].trim();

          return { found: true, version };
        } catch {
          continue;
        }
      }

      return { found: false };
    });

    // ── Install ──
    ipcMain.handle('install-env-tool', async (_, tool: ToolId) => {
      const sendLog: LogSender = (type, message) => {
        this.mainWindow?.webContents.send('env-tool-log', { type, message, timestamp: Date.now() });
      };

      return this.installEnvTool(tool, sendLog);
    });

    // ── Uninstall ──
    ipcMain.handle('uninstall-env-tool', async (_, tool: ToolId) => {
      const sendLog: LogSender = (type, message) => {
        this.mainWindow?.webContents.send('env-tool-log', { type, message, timestamp: Date.now() });
      };

      return this.uninstallEnvTool(tool, sendLog);
    });
  }

  private async installEnvTool(tool: string, sendLog: LogSender): Promise<{ success: boolean }> {
    const env = this.getSystemEnv();
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';

    const hasBrew = async () => {
      try {
        await execAsync('which brew', { env, timeout: 5000 });

        return true;
      } catch {
        return false;
      }
    };

    switch (tool) {
      // ── Node.js ─────────────────────────────────────────────────────────────
      case 'node': {
        if (isMac) {
          if (await hasBrew()) {
            sendLog('stdout', '$ brew install node\n');

            const { code } = await this.spawnWithLogs(
              'brew',
              ['install', 'node'],
              { env },
              sendLog,
            );

            return { success: code === 0 };
          }

          sendLog('info', '请手动下载安装 Node.js: https://nodejs.org/');

          return { success: false };
        }

        if (isWin) {
          sendLog('stdout', '$ winget install OpenJS.NodeJS.LTS\n');

          const { code } = await this.spawnWithLogs(
            'winget',
            [
              'install',
              'OpenJS.NodeJS.LTS',
              '-e',
              '--accept-package-agreements',
              '--accept-source-agreements',
            ],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        break;
      }

      // ── Python ──────────────────────────────────────────────────────────────
      case 'python': {
        if (isMac) {
          if (await hasBrew()) {
            sendLog('stdout', '$ brew install python3\n');

            const { code } = await this.spawnWithLogs(
              'brew',
              ['install', 'python3'],
              { env },
              sendLog,
            );

            return { success: code === 0 };
          }

          sendLog('info', '请手动下载安装 Python: https://www.python.org/downloads/');

          return { success: false };
        }

        if (isWin) {
          sendLog('stdout', '$ winget install Python.Python.3.13\n');

          const { code } = await this.spawnWithLogs(
            'winget',
            [
              'install',
              'Python.Python.3.13',
              '-e',
              '--accept-package-agreements',
              '--accept-source-agreements',
            ],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        break;
      }

      // ── FFmpeg ──────────────────────────────────────────────────────────────
      case 'ffmpeg': {
        if (isMac) {
          if (await hasBrew()) {
            sendLog('stdout', '$ brew install ffmpeg\n');

            const { code } = await this.spawnWithLogs(
              'brew',
              ['install', 'ffmpeg'],
              { env },
              sendLog,
            );

            return { success: code === 0 };
          }

          sendLog('info', '请手动下载安装 FFmpeg: https://ffmpeg.org/download.html');

          return { success: false };
        }

        if (isWin) {
          sendLog('stdout', '$ winget install Gyan.FFmpeg\n');

          const { code } = await this.spawnWithLogs(
            'winget',
            [
              'install',
              'Gyan.FFmpeg',
              '-e',
              '--accept-package-agreements',
              '--accept-source-agreements',
            ],
            { env },
            sendLog,
          );

          if (code === 0) {
            await this.addToWindowsPath('C:\\Program Files\\ffmpeg\\bin', sendLog);
          }

          return { success: code === 0 };
        }

        break;
      }

      // ── yt-dlp ──────────────────────────────────────────────────────────────
      case 'ytdlp': {
        if (isMac) {
          if (await hasBrew()) {
            sendLog('stdout', '$ brew install yt-dlp\n');

            const { code } = await this.spawnWithLogs(
              'brew',
              ['install', 'yt-dlp'],
              { env },
              sendLog,
            );

            return { success: code === 0 };
          }

          sendLog('stdout', '$ pip3 install yt-dlp\n');

          const { code } = await this.spawnWithLogs(
            'pip3',
            ['install', 'yt-dlp'],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        if (isWin) {
          // Try pip first (needs Python), fall back to winget
          sendLog('stdout', '$ pip install yt-dlp\n');

          const { code: pipCode } = await this.spawnWithLogs(
            'pip',
            ['install', 'yt-dlp'],
            { env },
            sendLog,
          );

          if (pipCode === 0) return { success: true };

          sendLog('stdout', '$ winget install yt-dlp.yt-dlp\n');

          const { code } = await this.spawnWithLogs(
            'winget',
            [
              'install',
              'yt-dlp.yt-dlp',
              '-e',
              '--accept-package-agreements',
              '--accept-source-agreements',
            ],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        break;
      }
    }

    sendLog('error', `不支持的操作系统: ${process.platform}`);

    return { success: false };
  }

  private async uninstallEnvTool(tool: string, sendLog: LogSender): Promise<{ success: boolean }> {
    const env = this.getSystemEnv();
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';

    switch (tool) {
      case 'node': {
        if (isMac) {
          sendLog('stdout', '$ brew uninstall node\n');

          const { code } = await this.spawnWithLogs(
            'brew',
            ['uninstall', 'node'],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        if (isWin) {
          sendLog('stdout', '$ winget uninstall --id OpenJS.NodeJS.LTS -e\n');

          const { code } = await this.spawnWithLogs(
            'winget',
            ['uninstall', '--id', 'OpenJS.NodeJS.LTS', '-e'],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        break;
      }

      case 'python': {
        if (isMac) {
          sendLog('stdout', '$ brew uninstall python3\n');

          const { code } = await this.spawnWithLogs(
            'brew',
            ['uninstall', 'python3'],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        if (isWin) {
          sendLog('stdout', '$ winget uninstall --id Python.Python.3 -e\n');

          const { code } = await this.spawnWithLogs(
            'winget',
            ['uninstall', '--id', 'Python.Python.3', '-e'],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        break;
      }

      case 'ffmpeg': {
        if (isMac) {
          sendLog('stdout', '$ brew uninstall ffmpeg\n');

          const { code } = await this.spawnWithLogs(
            'brew',
            ['uninstall', 'ffmpeg'],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        if (isWin) {
          sendLog('stdout', '$ winget uninstall --id Gyan.FFmpeg -e\n');

          const { code } = await this.spawnWithLogs(
            'winget',
            ['uninstall', '--id', 'Gyan.FFmpeg', '-e'],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        break;
      }

      case 'ytdlp': {
        if (isMac) {
          // Try brew list first to decide which uninstaller to use
          try {
            await execAsync('brew list yt-dlp', { env, timeout: 5000 });
            sendLog('stdout', '$ brew uninstall yt-dlp\n');

            const { code } = await this.spawnWithLogs(
              'brew',
              ['uninstall', 'yt-dlp'],
              { env },
              sendLog,
            );

            return { success: code === 0 };
          } catch {
            sendLog('stdout', '$ pip3 uninstall -y yt-dlp\n');

            const { code } = await this.spawnWithLogs(
              'pip3',
              ['uninstall', '-y', 'yt-dlp'],
              { env },
              sendLog,
            );

            return { success: code === 0 };
          }
        }

        if (isWin) {
          sendLog('stdout', '$ pip uninstall -y yt-dlp\n');

          const { code } = await this.spawnWithLogs(
            'pip',
            ['uninstall', '-y', 'yt-dlp'],
            { env },
            sendLog,
          );

          return { success: code === 0 };
        }

        break;
      }
    }

    return { success: false };
  }

  /** Add a directory to the Windows user PATH (permanent, no admin required) */
  private async addToWindowsPath(pathToAdd: string, sendLog: LogSender): Promise<void> {
    const psScript = `
$p = "${pathToAdd}"
$cur = [Environment]::GetEnvironmentVariable('Path','User')
$parts = $cur -split ';' | Where-Object { $_.Trim() -ne '' }
if (-not ($parts -contains $p)) {
  [Environment]::SetEnvironmentVariable('Path', ($parts + $p -join ';'), 'User')
  Write-Host "✓ 已添加到用户 PATH: $p"
} else {
  Write-Host "PATH 已包含: $p"
}
`.trim();

    sendLog('info', `正在将 ${pathToAdd} 添加到 Windows PATH...`);
    await this.spawnWithLogs(
      'powershell',
      ['-NoProfile', '-Command', psScript],
      { env: this.getSystemEnv() },
      sendLog,
    );
  }
}
