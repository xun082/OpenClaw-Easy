'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, GitBranch, Network } from 'lucide-react';

import { GatewayStatusBanner } from './_components/GatewayStatusBanner';

const SUB_NAV = [
  { href: '/agents', label: 'Agent 管理', icon: Bot },
  { href: '/agents/bindings', label: '路由绑定', icon: GitBranch },
  { href: '/agents/collab', label: '多 Agent 协作', icon: Network },
] as const;

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Horizontal sub-nav */}
      <nav className="flex items-center px-8 border-b border-border shrink-0 gap-6">
        {SUB_NAV.map((item) => {
          const isActive =
            item.href === '/agents'
              ? pathname === '/agents'
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

      {/* Gateway status — shows a red banner with restart button when gateway is down */}
      <GatewayStatusBanner />

      {/* Page content */}
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
