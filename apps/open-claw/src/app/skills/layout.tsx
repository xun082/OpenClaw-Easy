'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Bot, Globe, Puzzle, Sparkles } from 'lucide-react';

const SUB_NAV = [
  { href: '/skills', label: '工作区', icon: Puzzle },
  { href: '/skills/builtin', label: '内置', icon: BookOpen },
  { href: '/skills/clawhub', label: 'ClawHub', icon: Globe },
  { href: '/skills/ai', label: 'AI 推荐', icon: Sparkles },
  { href: '/skills/identity', label: '身份配置', icon: Bot },
] as const;

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Horizontal sub-nav */}
      <nav className="flex items-center px-8 border-b border-border shrink-0 gap-6">
        {SUB_NAV.map((item) => {
          const isActive =
            item.href === '/skills'
              ? pathname === '/skills' || pathname === '/skills/workspace'
              : pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-1.5 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary' : ''}`} />
              {item.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Page content */}
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
