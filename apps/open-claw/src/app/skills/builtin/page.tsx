'use client';

import { useEffect, useCallback, useState } from 'react';
import {
  RefreshCw,
  FolderOpen,
  Search,
  Box,
  Loader2,
  AlertCircle,
  Monitor,
  Server,
} from 'lucide-react';

import SkillCard from '../_components/SkillCard';

import type { Skill } from '@/electron';
import { useConnectionStore, selectActiveConn } from '@/store/connection-store';
import { buildSshCmd } from '@/lib/ssh-utils';
import type { SSHConn } from '@/lib/ssh-utils';

// ── Remote builtin skill listing ──────────────────────────────────────────────

interface RemoteSkill {
  name: string;
  description: string;
}

function buildListBuiltinSkillsScript(): string {
  return `export PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/www/server/nodejs/v22.16.0/bin:$PATH"

if ! command -v openclaw &>/dev/null; then
  echo "NODIR:openclaw not found — make sure it is globally installed"
  exit 0
fi

SKILLS_DIR=""

# Method 1: npm root -g (most portable)
if command -v npm &>/dev/null; then
  NPM_ROOT=$(npm root -g 2>/dev/null)
  if [ -n "$NPM_ROOT" ] && [ -d "$NPM_ROOT/openclaw/skills" ]; then
    SKILLS_DIR="$NPM_ROOT/openclaw/skills"
  fi
fi

# Method 2: follow symlink from the openclaw binary
if [ -z "$SKILLS_DIR" ]; then
  OPENCLAW_BIN=$(which openclaw 2>/dev/null)
  if [ -n "$OPENCLAW_BIN" ]; then
    REAL=$(readlink -f "$OPENCLAW_BIN" 2>/dev/null || realpath "$OPENCLAW_BIN" 2>/dev/null || echo "$OPENCLAW_BIN")
    # REAL is typically …/openclaw/bin/openclaw — go up two levels to the package root
    PKG_ROOT=$(dirname "$(dirname "$REAL")")
    if [ -d "$PKG_ROOT/skills" ]; then
      SKILLS_DIR="$PKG_ROOT/skills"
    fi
  fi
fi

if [ -z "$SKILLS_DIR" ] || [ ! -d "$SKILLS_DIR" ]; then
  echo "NODIR:\${SKILLS_DIR:-builtin skills directory not found}"
  exit 0
fi

echo "PATH:$SKILLS_DIR"
for dir in "$SKILLS_DIR"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  desc=""
  if [ -f "$dir/SKILL.md" ]; then
    desc=$(head -20 "$dir/SKILL.md" 2>/dev/null | grep -v '^#' | grep -v '^$' | grep -v '^---' | head -1 | cut -c1-120)
  fi
  echo "SKILL:$name:$desc"
done`;
}

async function fetchRemoteBuiltinSkills(
  conn: SSHConn,
): Promise<{ skills: RemoteSkill[]; path: string; error: string }> {
  const res = await window.api.executeCommand(buildSshCmd(conn, buildListBuiltinSkillsScript()));
  const output = (res.output ?? '').trim();

  if (!res.success && !output) {
    return { skills: [], path: '', error: res.error ?? 'SSH 执行失败' };
  }

  if (output.startsWith('NODIR:')) {
    return { skills: [], path: output.slice(6), error: '' };
  }

  const skills: RemoteSkill[] = [];
  let path = `${conn.username}@${conn.host}:(openclaw builtin skills)`;

  for (const line of output.split('\n')) {
    if (line.startsWith('PATH:')) {
      path = `${conn.username}@${conn.host}:${line.slice(5)}`;
    } else if (line.startsWith('SKILL:')) {
      const parts = line.slice(6).split(':');
      const name = parts[0] ?? '';
      const description = parts.slice(1).join(':').trim();
      if (name) skills.push({ name, description });
    }
  }

  return { skills, path, error: '' };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuiltinPage() {
  // ── Global connection source ───────────────────────────────────────────────
  const sshConns = useConnectionStore((s) => s.connections);
  const selectedConnId = useConnectionStore((s) => s.selectedConnId);
  const setSelectedConnId = useConnectionStore((s) => s.setSelectedConnId);
  const activeConn = useConnectionStore(selectActiveConn);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkill[]>([]);
  const [dir, setDir] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isRemote = selectedConnId !== 'local';

  const loadLocalSkills = useCallback(async () => {
    setLoading(true);

    try {
      const res = await window.api.listBuiltinSkills();
      setSkills(res.success ? res.skills : []);
      setDir(res.path ?? '');
      setError(!res.success ? (res.error ?? '') : '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRemoteSkills = useCallback(async (conn: SSHConn) => {
    setLoading(true);
    setError('');

    try {
      const result = await fetchRemoteBuiltinSkills(conn);
      setRemoteSkills(result.skills);
      setDir(result.path);
      setError(result.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSearchQuery('');

    if (!isRemote) {
      void loadLocalSkills();
    } else if (activeConn) {
      void loadRemoteSkills(activeConn);
    }
  }, [selectedConnId]);

  const handleRefresh = () => {
    if (!isRemote) {
      void loadLocalSkills();
    } else if (activeConn) {
      void loadRemoteSkills(activeConn);
    }
  };

  const rawSkills: { name: string; description: string }[] = isRemote ? remoteSkills : skills;
  const filtered = searchQuery
    ? rawSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : rawSkills;

  return (
    <div className="px-8 py-8">
      {/* ── Source selector ── */}
      <div className="flex items-center gap-1.5 mb-6 pb-4 border-b border-border">
        <span className="text-xs text-muted-foreground shrink-0 mr-0.5">技能来源：</span>
        <button
          onClick={() => setSelectedConnId('local')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            !isRemote
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-1">
            {isRemote ? `远端内置技能 — ${activeConn?.name || activeConn?.host}` : '内置技能'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRemote
              ? `${activeConn?.username}@${activeConn?.host} 服务器上随 openclaw 安装的内置技能（只读）。`
              : '随 openclaw 一同安装的内置技能。'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索技能名称或描述..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm
              placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {dir && !isRemote && (
          <button
            onClick={() => window.api.openPathInFinder(dir).catch(() => null)}
            title={dir}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            打开目录
          </button>
        )}
      </div>
      {dir && <p className="text-[11px] font-mono text-muted-foreground/50 mb-4 truncate">{dir}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">
            {isRemote ? `正在读取 ${activeConn?.host} 内置技能目录...` : '正在读取技能目录...'}
          </span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-300/50 bg-red-50 dark:bg-red-950/20 dark:border-red-800/50 px-4 py-3.5 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">读取失败</p>
            <p className="text-xs text-red-600/70 dark:text-red-500/70 mt-0.5">{error}</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Box className="w-8 h-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? `未找到匹配 "${searchQuery}" 的技能`
              : isRemote
                ? `远端 ${activeConn?.host} 未找到内置技能，请确认 openclaw 已安装`
                : '未找到内置技能，请确认 openclaw 已全局安装'}
          </p>
        </div>
      ) : isRemote ? (
        <div className="space-y-1.5">
          {(filtered as RemoteSkill[]).map((skill) => (
            <div
              key={skill.name}
              className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Box className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground font-mono">{skill.name}</p>
                {skill.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {skill.description}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground/50 mt-1">远端</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {(filtered as Skill[]).map((skill) => (
            <SkillCard key={skill.name} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}
