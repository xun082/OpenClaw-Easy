// Shared SSH connection type and command builder.

export interface SSHConn {
  id: string;
  name: string;
  host: string;
  port: string;
  username: string;
  authType: 'password' | 'key';
  password: string;
  keyPath: string;
  gatewayPort: string;
  createdAt: number;
}

function escapeSh(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ── Local-machine SSH key helpers (run via window.api.executeCommand) ─────────

/** List private key files in ~/.ssh/ (excludes .pub / known_hosts / config). */
export function buildListLocalKeysCmd(): string {
  return "ls -1 ~/.ssh/ 2>/dev/null | grep -vE '\\.(pub|bak|old)$' | grep -vE '^(known_hosts|config|authorized_keys|environment)' | sed 's|^|~/.ssh/|'";
}

/**
 * Read the public key that corresponds to a private key path.
 * Tries the .pub sidecar first; falls back to deriving it with ssh-keygen -y.
 */
export function buildReadPubKeyCmd(keyPath: string): string {
  const pubPath = keyPath.endsWith('.pem') ? keyPath.slice(0, -4) + '.pub' : `${keyPath}.pub`;

  return `cat "${pubPath}" 2>/dev/null || ssh-keygen -y -f "${keyPath}" 2>/dev/null`;
}

/** Fix private key file permissions to 600 (required by SSH). */
export function buildFixKeyPermCmd(keyPath: string): string {
  return `chmod 600 "${keyPath}" 2>&1 && echo "✓ 权限已修复" && ls -la "${keyPath}"`;
}

/** Generate a new ed25519 key pair with no passphrase. */
export function buildGenKeyCmd(keyPath: string): string {
  return `[ -f "${keyPath}" ] \
    && echo "⚠ 文件已存在，已跳过。如需重新生成，请先删除 ${keyPath}" \
    || (ssh-keygen -t ed25519 -N "" -f "${keyPath}" -C "openclaw-$(date +%Y%m%d)" \
        && echo "" && echo "=== 公钥内容 ===" && cat "${keyPath}.pub")`;
}

/**
 * Copy a public key to the remote server's authorized_keys using a temporary
 * password (requires sshpass to be installed locally).
 */
export function buildCopyIdCmd(
  keyPath: string,
  tempPassword: string,
  user: string,
  host: string,
  port: string,
): string {
  const pubPath = keyPath.endsWith('.pem') ? keyPath.slice(0, -4) + '.pub' : `${keyPath}.pub`;

  return `sshpass -p ${escapeSh(tempPassword)} ssh-copy-id -i "${pubPath}" -o StrictHostKeyChecking=accept-new -p ${port || '22'} ${user}@${host}`;
}

function b64Encode(script: string): string {
  return btoa(unescape(encodeURIComponent(script)));
}

/**
 * Build a local shell command that executes `remoteCmd` on the remote server via SSH.
 * The remote script is base64-encoded to avoid all quoting/heredoc issues.
 */
export function buildSshCmd(conn: SSHConn, remoteCmd: string): string {
  const portFlag = `-p ${conn.port || '22'}`;
  const opts = '-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=no';
  const target = `${conn.username}@${conn.host}`;

  const encoded = b64Encode(remoteCmd);
  const remoteExec = `echo '${encoded}' | base64 -d | bash`;

  if (conn.authType === 'password' && conn.password) {
    return `sshpass -p ${escapeSh(conn.password)} ssh ${opts} ${portFlag} ${target} ${escapeSh(remoteExec)}`;
  }

  if (conn.authType === 'key' && conn.keyPath) {
    return `ssh -i ${escapeSh(conn.keyPath)} ${opts} ${portFlag} ${target} ${escapeSh(remoteExec)}`;
  }

  return `ssh ${opts} ${portFlag} ${target} ${escapeSh(remoteExec)}`;
}
