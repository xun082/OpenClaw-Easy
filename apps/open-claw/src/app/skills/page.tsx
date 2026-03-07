'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Box,
  FolderOpen,
  Loader2,
  Monitor,
  RefreshCw,
  Search,
  Server,
} from 'lucide-react';

import type { Skill } from '@/electron';
import type { SSHConn } from '@/lib/ssh-utils';
import { buildSshCmd } from '@/lib/ssh-utils';
import { useConfigStore } from '@/store/config-store';
import { selectActiveConn, useConnectionStore } from '@/store/connection-store';

import LocalInstallButton from './_components/LocalInstallButton';
import SkillCard from './_components/SkillCard';

// ── Types ──────────────────────────────────────────────────────────────────

interface SkillEntry {
  name: string;
  description: string;
}

interface AgentSource {
  agentId: string;
  label: string;
  skillsPath: string;
  /** true = main/default agent → use window.api.listWorkspaceSkills() for richer Skill objects */
  isMain: boolean;
}

// ── Shell scripts ──────────────────────────────────────────────────────────

/** Build a listing script for a LOCAL path (replaces ~ with $HOME) */
function buildLocalListScript(skillsDir: string): string {
  const dir = skillsDir.startsWith('~') ? `$HOME${skillsDir.slice(1)}` : skillsDir;

  return `SKILLS_DIR="${dir}"
if [ ! -d "$SKILLS_DIR" ]; then
  echo "NODIR:$SKILLS_DIR"
  exit 0
fi
echo "PATH:$SKILLS_DIR"
for d in "$SKILLS_DIR"/*/; do
  [ -d "$d" ] || continue
  n=$(basename "$d")
  desc=""
  if [ -f "$d/SKILL.md" ]; then
    desc=$(head -20 "$d/SKILL.md" 2>/dev/null | grep -v "^#" | grep -v "^[[:space:]]*$" | grep -v "^---" | head -1 | cut -c1-120 2>/dev/null || echo "")
  fi
  printf "SKILL:%s:%s\\n" "$n" "$desc"
done`;
}

/** Build a listing script for a REMOTE path over SSH */
function buildRemoteListScript(): string {
  return `SKILLS_DIR=~/.openclaw/skills
if [ ! -d "$SKILLS_DIR" ]; then
  echo "NODIR:$SKILLS_DIR"
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

// ── Output parser ──────────────────────────────────────────────────────────

function parseSkillsOutput(
  raw: string,
  pathPrefix?: string,
): { skills: SkillEntry[]; path: string } {
  const skills: SkillEntry[] = [];
  let path = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith('PATH:')) {
      const p = line.slice(5).trim();
      path = pathPrefix ? `${pathPrefix}:${p}` : p;
    } else if (line.startsWith('SKILL:')) {
      const parts = line.slice(6).split(':');
      const name = (parts[0] ?? '').trim();
      const description = parts.slice(1).join(':').trim();
      if (name) skills.push({ name, description });
    }
  }

  return { skills, path };
}

// ── Fetch helpers ──────────────────────────────────────────────────────────

async function fetchLocalAgentSkills(
  skillsPath: string,
): Promise<{ skills: SkillEntry[]; path: string; error: string }> {
  const res = await window.api.executeCommand(buildLocalListScript(skillsPath));
  const output = (res.output ?? '').trim();

  if (!res.success && !output) {
    return { skills: [], path: skillsPath, error: res.error ?? '读取技能目录失败' };
  }

  if (output.startsWith('NODIR:')) {
    return { skills: [], path: output.slice(6), error: '' };
  }

  const { skills, path } = parseSkillsOutput(output);

  return { skills, path: path || skillsPath, error: '' };
}

async function fetchRemoteSkills(
  conn: SSHConn,
): Promise<{ skills: SkillEntry[]; path: string; error: string }> {
  const res = await window.api.executeCommand(buildSshCmd(conn, buildRemoteListScript()));
  const output = (res.output ?? '').trim();

  if (!res.success && !output) {
    return { skills: [], path: '', error: res.error ?? 'SSH 执行失败' };
  }

  if (output.startsWith('NODIR:')) {
    return {
      skills: [],
      path: `${conn.username}@${conn.host}:${output.slice(6)}`,
      error: '',
    };
  }

  const { skills, path } = parseSkillsOutput(output, `${conn.username}@${conn.host}`);

  return { skills, path, error: '' };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const config = useConfigStore((s) => s.config);
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const sshConns = useConnectionStore((s) => s.connections);
  const setSelectedConnId = useConnectionStore((s) => s.setSelectedConnId);
  const activeConn = useConnectionStore(selectActiveConn);

  const [mounted, setMounted] = useState(false);

  // Unified source: 'agent:<id>' | 'ssh:<connId>'
  const [sourceId, setSourceId] = useState<string>('agent:main');

  // Separate skill buckets per source type
  const [mainSkills, setMainSkills] = useState<Skill[]>([]);
  const [agentSkills, setAgentSkills] = useState<SkillEntry[]>([]);
  const [remoteSkills, setRemoteSkills] = useState<SkillEntry[]>([]);

  const [dir, setDir] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load config on mount (needed when user navigates directly to Skills without
  // having visited another page that loads the config store)
  useEffect(() => {
    setMounted(true);
    if (!config) void loadConfig();
  }, []);

  // ── Derive agent sources from openclaw.json (reactive to config changes) ─
  const agentSources: AgentSource[] = useMemo(() => {
    const defaultWs = (config?.agents?.defaults?.workspace ?? '').trim() || '~/.openclaw/workspace';
    const list = config?.agents?.list ?? [];

    // Always include main first
    const agents = list.some((a) => a.id === 'main') ? list : [{ id: 'main' }, ...list];

    return agents.map((agent) => {
      const ws = agent.workspace?.trim() || defaultWs;

      return {
        agentId: agent.id,
        label: agent.id === 'main' ? '主 Agent' : agent.name?.trim() || agent.id,
        skillsPath: `${ws}/skills`,
        isMain: agent.id === 'main' && !agent.workspace,
      };
    });
  }, [config]);

  const isRemote = sourceId.startsWith('ssh:');
  const currentAgent = isRemote
    ? null
    : (agentSources.find((a) => `agent:${a.agentId}` === sourceId) ?? agentSources[0] ?? null);

  // ── Loaders ────────────────────────────────────────────────────────────

  const loadMainSkills = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await window.api.listWorkspaceSkills();
      setMainSkills(res.success ? res.skills : []);
      setDir(res.path ?? '~/.openclaw/workspace/skills');
      if (!res.success) setError(res.error ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAgentSkills = useCallback(async (src: AgentSource) => {
    setLoading(true);
    setError('');

    try {
      const result = await fetchLocalAgentSkills(src.skillsPath);
      setAgentSkills(result.skills);
      setDir(result.path);
      setError(result.error);
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
      const result = await fetchRemoteSkills(conn);
      setRemoteSkills(result.skills);
      setDir(result.path);
      setError(result.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep a stable ref to agentSources/sshConns for use in effects
  const agentSourcesRef = useRef(agentSources);
  agentSourcesRef.current = agentSources;

  const sshConnsRef = useRef(sshConns);
  sshConnsRef.current = sshConns;

  const reload = useCallback(
    (id: string) => {
      if (id === 'agent:main') {
        void loadMainSkills();
      } else if (id.startsWith('agent:')) {
        const src = agentSourcesRef.current.find((a) => `agent:${a.agentId}` === id);
        if (src) void (src.isMain ? loadMainSkills() : loadAgentSkills(src));
      } else if (id.startsWith('ssh:')) {
        const conn = sshConnsRef.current.find((c) => `ssh:${c.id}` === id);
        if (conn) void loadRemoteSkills(conn);
      }
    },
    [loadMainSkills, loadAgentSkills, loadRemoteSkills],
  );

  // Reload when source changes
  useEffect(() => {
    if (!mounted) return;
    setSearchQuery('');
    reload(sourceId);
    setSelectedConnId(sourceId.startsWith('ssh:') ? sourceId.slice(4) : 'local');
  }, [sourceId, reload, setSelectedConnId, mounted]);

  // Also reload when config first arrives (agentSources paths may have changed)
  const prevConfigRef = useRef<typeof config>(null);
  useEffect(() => {
    if (!config || prevConfigRef.current === config) return;
    prevConfigRef.current = config;
    // Re-run only if we haven't loaded yet or the source path may have changed
    reload(sourceId);
  }, [config, reload, sourceId]);

  const handleRefresh = () => reload(sourceId);

  // ── Filter ─────────────────────────────────────────────────────────────

  const sq = searchQuery.toLowerCase();
  const filterFn = <T extends { name: string; description: string }>(items: T[]): T[] =>
    searchQuery
      ? items.filter(
          (s) => s.name.toLowerCase().includes(sq) || s.description.toLowerCase().includes(sq),
        )
      : items;

  const filteredMain = filterFn(mainSkills);
  const filteredAgent = filterFn(agentSkills);
  const filteredRemote = filterFn(remoteSkills);

  const isEmpty = isRemote
    ? filteredRemote.length === 0
    : currentAgent?.isMain
      ? filteredMain.length === 0
      : filteredAgent.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-8">
      {/* Source selector */}
      <div className="flex items-center gap-1.5 mb-6 pb-4 border-b border-border flex-wrap">
        <span className="text-xs text-muted-foreground shrink-0 mr-0.5">技能来源：</span>

        {/* Local agents */}
        {agentSources.map((agent) => {
          const id = `agent:${agent.agentId}`;
          const active = sourceId === id;

          return (
            <button
              key={id}
              onClick={() => setSourceId(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {agent.agentId === 'main' ? (
                <Monitor className="w-3 h-3" />
              ) : (
                <Bot className="w-3 h-3" />
              )}
              {agent.label}
            </button>
          );
        })}

        {/* Divider */}
        {sshConns.length > 0 && <span className="w-px h-4 bg-border mx-1 shrink-0" />}

        {/* SSH servers */}
        {sshConns.map((conn) => {
          const id = `ssh:${conn.id}`;
          const active = sourceId === id;

          return (
            <button
              key={id}
              onClick={() => setSourceId(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Server className="w-3 h-3" />
              {conn.name || `${conn.username}@${conn.host}`}
            </button>
          );
        })}

        {sshConns.length === 0 && (
          <span className="text-xs text-muted-foreground/50 italic ml-1">
            （前往「安装与连接 → SSH 远程部署」添加远程服务器）
          </span>
        )}
      </div>

      {/* Title + actions */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight mb-1">
            {isRemote
              ? `远端技能 — ${activeConn?.name || activeConn?.host}`
              : currentAgent?.isMain
                ? '工作区技能'
                : `${currentAgent?.label} · 工作区技能`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRemote
              ? `${activeConn?.username}@${activeConn?.host} 远端技能目录（只读）`
              : currentAgent?.isMain
                ? '主 Agent 工作区中已安装的技能列表。'
                : `Agent "${currentAgent?.agentId}" 专属工作区中已安装的技能列表。`}
          </p>
          {/* Show workspace path hint for non-main agents */}
          {!isRemote && currentAgent && !currentAgent.isMain && (
            <p className="text-[11px] text-muted-foreground/50 mt-1 font-mono">
              工作区：{currentAgent.skillsPath.replace('/skills', '')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Install button: only for main agent (installs to default workspace) */}
          {sourceId === 'agent:main' && (
            <LocalInstallButton isElectron onInstalled={handleRefresh} />
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* Search bar + open dir */}
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-14 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">
            {isRemote
              ? `正在读取 ${activeConn?.host} 技能目录…`
              : `正在读取${currentAgent?.isMain ? '' : ` ${currentAgent?.label}`}工作区技能…`}
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
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Box className="w-8 h-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? `未找到匹配 "${searchQuery}" 的技能`
              : isRemote
                ? `远端 ${activeConn?.host} 暂无工作区技能`
                : `${currentAgent?.isMain ? '' : `${currentAgent?.label} `}工作区暂无技能`}
          </p>
          {!searchQuery && dir && (
            <p className="text-xs text-muted-foreground/60 mt-1">目录：{dir}</p>
          )}
        </div>
      ) : isRemote ? (
        <div className="space-y-1.5">
          {filteredRemote.map((skill) => (
            <SkillEntryCard key={skill.name} skill={skill} badge="远端" />
          ))}
        </div>
      ) : currentAgent?.isMain ? (
        // Main agent → full SkillCard with rich metadata
        <div className="space-y-1.5">
          {filteredMain.map((skill) => (
            <SkillCard key={skill.name} skill={skill} />
          ))}
        </div>
      ) : (
        // Non-main agent → simple entry cards
        <div className="space-y-1.5">
          {filteredAgent.map((skill) => (
            <SkillEntryCard key={skill.name} skill={skill} badge={currentAgent?.agentId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── SkillEntryCard ─────────────────────────────────────────────────────────

interface SkillEntryCardProps {
  skill: SkillEntry;
  badge?: string;
}

function SkillEntryCard({ skill, badge }: SkillEntryCardProps) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Box className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground font-mono">{skill.name}</p>
        {skill.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
            {skill.description}
          </p>
        )}
      </div>
      {badge && (
        <span className="shrink-0 text-[10px] text-muted-foreground/50 mt-0.5 font-mono">
          {badge}
        </span>
      )}
    </div>
  );
}
