'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Download, Server, Wifi } from 'lucide-react';

const SUB_NAV = [
  { href: '/connect', label: '本地安装', Icon: Download, exact: true },
  { href: '/connect/local', label: '连接测试', Icon: Wifi, exact: false },
  { href: '/connect/ssh', label: 'SSH 远程部署', Icon: Server, exact: false },
] as const;

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ── */}
      <div className="px-8 pt-8 pb-0">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground mb-1.5">安装与连接</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          连接本地 Gateway 网关，或通过 SSH 一键部署到远程服务器。
        </p>
      </div>

      {/* ── Horizontal sub-nav ── */}
      <nav className="flex items-center px-8 border-b border-border shrink-0 gap-6 mt-5">
        {SUB_NAV.map(({ href, label, Icon, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + '/');

          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-1.5 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary' : ''}`} />
              {label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Page content ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
