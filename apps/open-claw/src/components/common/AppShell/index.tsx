'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Terminal, Home, Puzzle, FileJson, Settings, PlugZap } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const NAV_ITEMS = [
  {
    href: '/',
    label: '环境配置',
    sublabel: 'Node · Python · FFmpeg · yt-dlp',
    icon: Home,
  },
  {
    href: '/connect',
    label: '安装与连接',
    sublabel: '安装 · 本地 · 远程',
    icon: PlugZap,
  },
  {
    href: '/skills',
    label: '技能管理',
    sublabel: 'workspace / builtin',
    icon: Puzzle,
  },
  {
    href: '/config',
    label: '配置文件',
    sublabel: 'openclaw.json',
    icon: FileJson,
  },
  {
    href: '/settings',
    label: '设置',
    sublabel: 'API Key · 偏好',
    icon: Settings,
  },
] as const;

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[220px] shrink-0 flex flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3 border-b border-border/60">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm shadow-primary/30 shrink-0">
            <Terminal className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">OpenClaw</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">AI Gateway 网关</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  }`}
                />
                <div className="min-w-0">
                  <p
                    className={`text-sm leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}
                  >
                    {item.label}
                  </p>
                  <p
                    className={`text-[10px] mt-0.5 font-mono truncate ${
                      isActive ? 'text-primary/70' : 'text-muted-foreground/70'
                    }`}
                  >
                    {item.sublabel}
                  </p>
                </div>
                {isActive && (
                  <div className="ml-auto w-1 h-4 rounded-full bg-primary shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom toolbar */}
        <div className="px-4 py-3 border-t border-border/60 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-mono">v0.1.0</span>
          <ThemeToggle />
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto min-w-0">{children}</main>
    </div>
  );
}
