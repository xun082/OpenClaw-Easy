# 本项目的 Agent 约定

本文件只约束在本仓库里跑的 AI Agent，重点是：

- 代码修改后的 lint \ typecheck 要求

除非用户在当前会话里另说，Agent 默认都要遵守下面规则。

## 1. TS / TSX 与前端代码修改后的检查

当对 TypeScript、TSX 或前端相关代码做出非极小改动（比如增加组件、改业务逻辑、调类型等）时：

1. 至少对刚修改的文件跑一次 ESLint \ 类型检查
   - 优先使用 Cursor 内置诊断能力（如 `ReadLints`），只检查刚改的文件。
2. 能跑脚本时，优先用根目录现成命令：
   - `pnpm lint`：仓库级 ESLint（会尝试自动修复）。
   - `pnpm typecheck`：通过 Turbo 运行各包的 typecheck。
   - 如果只改了 `apps/open-claw`，可以优先用该包自己的 lint 命令（如 `pnpm -C apps/open-claw lint`，若存在）。
3. 如果环境限制不能跑脚本
   - 至少用 Lint 诊断工具检查刚改文件。
   - 在回复里说明没跑完整的 `pnpm lint` \ `pnpm typecheck`，提示用户本地再手动执行一次。

原则：只要不是“纯注释 \ 纯文案”的小改动，所有 TS \ TSX \ 前端相关实质性修改，都必须做上述检查。
