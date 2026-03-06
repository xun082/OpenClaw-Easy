'use client';

import { useState } from 'react';
import {
  ChevronRight,
  File,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Puzzle,
} from 'lucide-react';

import type { FileEntry, Skill } from '@/electron';

// ── File icon helpers ────────────────────────────────────────────────────────

const CODE_EXTS = new Set(['js', 'ts', 'jsx', 'tsx', 'py', 'sh', 'bash', 'mjs', 'cjs']);
const DOC_EXTS = new Set(['md', 'mdx', 'txt', 'json', 'yaml', 'yml', 'toml']);

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (CODE_EXTS.has(ext)) return <FileCode className={className} />;
  if (DOC_EXTS.has(ext)) return <FileText className={className} />;

  return <File className={className} />;
}

// ── Recursive file tree node ──────────────────────────────────────────────────

function TreeNode({ entry, depth }: { entry: FileEntry; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const isDir = entry.type === 'dir';
  const indent = depth * 14;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-[2px] rounded text-[11px] leading-5 ${
          isDir ? 'cursor-pointer hover:text-foreground' : 'text-muted-foreground/70'
        }`}
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={isDir ? () => setOpen((o) => !o) : undefined}
      >
        {isDir ? (
          <>
            <ChevronRight
              className={`w-3 h-3 shrink-0 text-muted-foreground/50 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            {open ? (
              <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-400/80" />
            ) : (
              <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400/80" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileIcon name={entry.name} className="w-3.5 h-3.5 shrink-0 text-sky-400/70" />
          </>
        )}
        <span className={isDir ? 'text-foreground/80 font-medium' : ''}>{entry.name}</span>
      </div>
      {isDir &&
        open &&
        entry.children?.map((child) => (
          <TreeNode key={child.name} entry={child} depth={depth + 1} />
        ))}
    </div>
  );
}

// ── Main SkillCard ────────────────────────────────────────────────────────────

interface Props {
  skill: Skill;
}

const isElectronEnv = () =>
  typeof window !== 'undefined' && typeof window.api?.listSkillFiles === 'function';

export default function SkillCard({ skill }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tree, setTree] = useState<FileEntry[] | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);

    if (next && tree === null && isElectronEnv()) {
      setLoadingTree(true);

      try {
        const result = await window.api.listSkillFiles(skill.path);
        setTree(result.success ? result.tree : []);
      } finally {
        setLoadingTree(false);
      }
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header row */}
      <div
        className="flex items-center gap-3.5 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={handleToggle}
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Puzzle className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground font-mono">{skill.name}</p>
          {skill.description ? (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{skill.description}</p>
          ) : null}
        </div>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </div>

      {/* Expandable file tree */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 px-3 py-2.5">
          {loadingTree ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground px-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              读取文件...
            </div>
          ) : tree && tree.length > 0 ? (
            <div className="font-mono">
              {tree.map((entry) => (
                <TreeNode key={entry.name} entry={entry} depth={0} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50 px-1 py-1 font-mono">(空目录)</p>
          )}
        </div>
      )}
    </div>
  );
}
