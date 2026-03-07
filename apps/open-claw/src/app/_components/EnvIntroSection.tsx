import { Activity, PackageCheck, ScrollText, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: PackageCheck,
    title: '一键安装 / 卸载',
    desc: '无需手动敲命令，点击即完成工具的安装与清理。',
  },
  {
    icon: Activity,
    title: '版本状态检测',
    desc: '自动识别本机已安装的版本号，并以颜色标注健康状态。',
  },
  {
    icon: ScrollText,
    title: '实时安装日志',
    desc: '内置终端面板，安装过程的每一行输出都即时呈现。',
  },
  {
    icon: Zap,
    title: '全局一键检测',
    desc: '点击「全部检测」，立刻刷新所有工具的安装状态。',
  },
];

export function EnvIntroSection() {
  return (
    <div className="shrink-0 mb-6 space-y-4">
      {/* Description */}
      <div
        className="rounded-xl border border-border bg-muted/30 px-4 py-3.5
          text-sm text-muted-foreground leading-relaxed"
      >
        <p>
          <span className="font-semibold text-foreground">环境配置</span>{' '}
          是 OpenClaw 的运行时依赖管理中心。它会帮你检测本机是否已安装
          Node.js、Python、FFmpeg、yt-dlp 等核心工具，并支持一键安装或卸载，
          省去繁琐的手动配置步骤。
        </p>
        <p className="mt-2">
          无论你是第一次使用还是在新环境中部署，只需点击「全部检测」，
          系统即可立即告知哪些依赖缺失，再点「安装」即可完成——全程无需打开终端。
        </p>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-xl border border-border/60
              bg-muted/20 px-3.5 py-3 hover:border-border transition-colors"
          >
            <div className="mt-0.5 shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground mb-0.5">{title}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
