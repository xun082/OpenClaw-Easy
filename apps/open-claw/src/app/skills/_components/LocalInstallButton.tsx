'use client';

import { useState } from 'react';
import { HardDriveDownload, Loader2 } from 'lucide-react';

import type { InstallLogEvent } from '@/electron';

import SkillInstallDrawer, { type InstallStatus } from './SkillInstallDrawer';

interface ActiveInstall {
  slug: string;
  logs: InstallLogEvent[];
  status: InstallStatus;
}

interface Props {
  isElectron: boolean;
  /** Called when an install succeeds so the parent can refresh the list */
  onInstalled?: () => void;
}

export default function LocalInstallButton({ isElectron, onInstalled }: Props) {
  const [activeInstall, setActiveInstall] = useState<ActiveInstall | null>(null);
  const [picking, setPicking] = useState(false);

  const handleClick = async () => {
    if (!isElectron || picking) return;
    setPicking(true);

    try {
      const result = await window.api.openSkillSourceDialog();
      if (result.canceled || result.filePaths.length === 0) return;

      const sourcePath = result.filePaths[0];
      const slug = sourcePath.split('/').pop() ?? sourcePath;

      // Register log listener before calling install so we don't miss early logs
      setActiveInstall({ slug, logs: [], status: 'installing' });

      const unsubscribe = window.api.onSkillInstallLog((log) => {
        setActiveInstall((prev) => {
          if (!prev || prev.status !== 'installing') return prev;

          return { ...prev, logs: [...prev.logs, log] };
        });
      });

      try {
        const installResult = await window.api.installLocalSkill(sourcePath);
        setActiveInstall((prev) =>
          prev ? { ...prev, status: installResult.success ? 'success' : 'error' } : null,
        );
        if (installResult.success) onInstalled?.();
      } finally {
        unsubscribe();
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={!isElectron || picking}
        title="从本地文件夹或压缩包安装技能"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors
          px-2 py-1.5 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {picking ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <HardDriveDownload className="w-3.5 h-3.5" />
        )}
        本地安装
      </button>

      {activeInstall && (
        <SkillInstallDrawer
          slug={activeInstall.slug}
          logs={activeInstall.logs}
          status={activeInstall.status}
          onClose={() => setActiveInstall(null)}
        />
      )}
    </>
  );
}
