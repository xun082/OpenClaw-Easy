import { Clock3 } from 'lucide-react';

const ROADMAP_ITEMS = [
  { label: '环境变量配置', desc: '图形化管理 PATH 等系统路径，无需手动修改配置文件。' },
  { label: '多版本并行管理', desc: '支持同时安装多个 Python / Node.js 版本，按需切换。' },
  { label: '自动更新检测', desc: '定期检查已安装工具的新版本，一键升级。' },
  { label: '更多工具支持', desc: '计划新增 pip 包管理、ffprobe、aria2 等工具的支持。' },
];

export function EnvRoadmap() {
  return (
    <div
      className="shrink-0 mt-5 rounded-xl border border-dashed border-border/60
        bg-muted/10 px-4 py-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Clock3 className="w-3.5 h-3.5 text-muted-foreground/70" />
        <span className="text-xs font-semibold text-muted-foreground/80 tracking-wide uppercase">
          即将支持 · 路线图
        </span>
      </div>

      <ul className="space-y-2">
        {ROADMAP_ITEMS.map(({ label, desc }) => (
          <li key={label} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 shrink-0 inline-flex items-center justify-center
                rounded-full border border-border/50 bg-muted/40
                text-[10px] text-muted-foreground/60 px-1.5 py-0.5 leading-none font-medium"
            >
              待开发
            </span>
            <div className="min-w-0">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <span className="ml-1.5 text-[11px] text-muted-foreground/50">{desc}</span>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3.5 text-[11px] text-muted-foreground/50 leading-relaxed">
        如果你有其他需求，欢迎告知——后续版本会持续更新并支持更多功能。
      </p>
    </div>
  );
}
