---
name: component-structure-open-claw
description: 规范 open-claw Next.js 应用的组件目录结构：shadcn/ui 组件放在 components/ui，可复用业务组件放在 components/common，单页面专用组件放在本地 _components 目录。在本仓库中创建、移动或重构 React/Next.js 组件时使用本规范。
---

# open-claw 组件目录规范

## 适用场景

在 apps/open-claw 中进行以下操作时，应参考本规范：

- 创建新的 React/Next.js 组件
- 决定组件文件应该放在哪里
- 从页面中抽离 JSX 到独立组件
- 重构可能在多个页面间复用的组件

除非特别说明，下面提到的路径都以 apps/open-claw/src 为根目录。

## 总体规则

整体分为三类组件：

1. shadcn/ui 组件：统一放在 components/ui 下
2. 可在多个页面间复用的业务组件：统一放在 components/common 下，按组件建文件夹
3. 仅单个页面使用的本地组件：放在对应页面旁边的 \_components 目录中

下面分别说明。

## 1. shadcn/ui 组件

- 位置：统一放在 components/ui 目录下
- 规则：不要把 shadcn 组件直接放在页面目录或其他任意目录中
- 基本结构：
  - 单文件形式：
    - apps/open-claw/src/components/ui/<component-name>.tsx
  - 若需要多个文件时，可以使用组件文件夹形式，相关辅助文件放在同一文件夹：
    - apps/open-claw/src/components/ui/<ComponentName>/index.tsx
    - apps/open-claw/src/components/ui/<ComponentName>/types.ts
- 引用方式：
  - 从页面或其他组件中引用时，一律从 components/ui 开始引用
  - 示例：
    - import { Button } from "@/components/ui/button"

## 2. 可复用业务组件（非 shadcn）

这一类是打算在多个页面中复用的业务组件，但不是 shadcn/ui 内置组件。

- 位置：统一放在 components/common 目录下
- 规则：如果预期组件会被多个页面使用，应放到 components/common，而不是留在某个单独页面目录下
- 结构：推荐采用「一个组件一个文件夹」的结构
  - apps/open-claw/src/components/common/<ComponentName>/index.tsx
  - 如有需要，可以在同一目录下放相关辅助文件：
    - apps/open-claw/src/components/common/<ComponentName>/types.ts
    - apps/open-claw/src/components/common/<ComponentName>/hooks.ts
    - apps/open-claw/src/components/common/<ComponentName>/styles.css（或 .module.css / .ts，视项目样式方案而定）
- 引用方式：
  - 从页面或其他组件中引用时，从 components/common 开始
  - 示例：
    - import Header from "@/components/common/Header"

## 3. 单页面专用组件（不可复用的页面级组件）

这一类组件当前只服务于某一个具体页面或路由段，不确定会不会在其他地方复用。

- 位置：在页面文件旁新建一个本地 \_components 目录
- 规则：
  - 这些组件只在同一个页面或同一路由段内引用
  - 如果未来在其他页面中需要复用，再将其提升到 components/common
- 结构示例：
  - 根路由页面：
    - 页面文件：
      - apps/open-claw/src/app/page.tsx
    - 本地组件：
      - apps/open-claw/src/app/\_components/<ComponentName>.tsx
  - 嵌套路由或子路由：
    - 页面文件：
      - apps/open-claw/src/app/dashboard/page.tsx
    - 本地组件：
      - apps/open-claw/src/app/dashboard/\_components/<ComponentName>.tsx
  - 使用 route group 的情况：
    - 页面文件：
      - apps/open-claw/src/app/(marketing)/home/page.tsx
    - 本地组件：
      - apps/open-claw/src/app/(marketing)/home/\_components/<ComponentName>.tsx

## 4. 新组件应该放在哪里

创建新组件时，按下面的顺序进行判断：

1. 这是 shadcn/ui 生成或风格上完全属于 shadcn/ui 的组件吗？
   - 是：放在 components/ui 下
2. 这个组件很明确会在多个页面复用吗（例如 Header、Footer、Layout 区块、通用卡片组件、通用表单等）？
   - 是：放在 components/common 下，并为该组件创建单独文件夹
3. 目前它只为某一个具体页面服务，短期内也不打算在其他地方用吗？
   - 是：放在对应页面的 \_components 目录下

如果后续发现某个 \_components 目录中的组件开始被多个页面复用，应将其迁移到 components/common，并更新所有引用路径。

## 5. 命名与引用约定

- 组件命名：
  - 使用 PascalCase，例如：Header、SidebarNav、HeroSection
- 文件命名：
  - 推荐与组件名一致，或者在组件文件夹中使用 index.tsx
- 引用路径约定：
  - 页面中引用 shadcn 组件：
    - import { Button } from "@/components/ui/button"
  - 页面中引用可复用业务组件：
    - import Header from "@/components/common/Header"
  - 页面中引用本地 \_components 组件：
    - import HeroSection from "./\_components/HeroSection"

## 6. 从页面中抽离 JSX 时的步骤

当页面文件体积较大、希望抽离部分 JSX 成为独立组件时，建议流程如下：

1. 第一步优先放在本页面的 \_components 目录中
   - 先保证重构安全、局部修改可控
2. 后续根据实际复用情况再决定是否上移到 components/common
   - 如果发现另一个页面需要同样的 UI 或逻辑：
     - 将该组件从 \_components 目录移动到 components/common 对应位置
     - 调整所有使用该组件的 import 路径
3. 避免的做法：
   - 在 app/home 等页面目录下再创建任意命名的 components 子目录（例如 app/home/components/）
   - 在同一目录下混放 shadcn 组件和普通业务组件

## 7. 示例

### 示例 A：Button（shadcn/ui）

- 组件路径：
  - apps/open-claw/src/components/ui/button.tsx
- 在页面中的使用：
  - apps/open-claw/src/app/page.tsx 中：
    - import { Button } from "@/components/ui/button"

### 示例 B：可复用 Header

- 组件路径：
  - apps/open-claw/src/components/common/Header/index.tsx
- 该组件在多个页面使用：
  - apps/open-claw/src/app/page.tsx
  - apps/open-claw/src/app/dashboard/page.tsx
- 引用方式：
  - import Header from "@/components/common/Header"

### 示例 C：页面专用 HeroSection

- 页面文件：
  - apps/open-claw/src/app/page.tsx
- 本地组件：
  - apps/open-claw/src/app/\_components/HeroSection.tsx
  - apps/open-claw/src/app/\_components/FeaturesGrid.tsx
- 在 page.tsx 中的引用：
  - import HeroSection from "./\_components/HeroSection"
  - import FeaturesGrid from "./\_components/FeaturesGrid"

如果之后需要在其他页面中复用 HeroSection 或 FeaturesGrid，应将它们移动到：

- apps/open-claw/src/components/common/HeroSection/
- apps/open-claw/src/components/common/FeaturesGrid/

并同步更新所有引用路径。

---

name: component-structure-open-claw
description: Defines the component folder structure for the open-claw Next.js app, including shadcn/ui components under components/ui, shared reusable components under components/common, and page-only components under local \_components folders. Use when creating, moving, or refactoring React/Next.js components in this repository.

---

# Component Structure for `open-claw`

## When to use this skill

Use this skill whenever:

- Creating new React/Next.js components in `apps/open-claw`
- Deciding where a component file should live
- Extracting JSX from a page into a separate component
- Refactoring components that might be reused across multiple pages

All paths in this skill are relative to `apps/open-claw/src`.

## Instructions

### 1. shadcn/ui components

- **Location**: Always place shadcn-generated components under `components/ui`.
- **Rule**: Do **not** put shadcn components directly inside page folders or other directories.
- **Structure**:
  - `apps/open-claw/src/components/ui/<component-name>.tsx`
  - Additional files for the same component (helpers, types) should live alongside it in the same folder if needed:
    - `apps/open-claw/src/components/ui/<ComponentName>/index.tsx`
    - `apps/open-claw/src/components/ui/<ComponentName>/types.ts`
- **Imports**:
  - From pages or other components, import shadcn components from `components/ui/...`.

### 2. Shared reusable components (non-shadcn)

These are components that are intended to be reused across multiple pages but are not part of the shadcn/ui library.

- **Location**: Place these under `components/common`.
- **Rule**: If you expect a component to be used in more than one page, prefer putting it here rather than inside a page-specific folder.
- **Structure (folder-per-component)**:
  - `apps/open-claw/src/components/common/<ComponentName>/index.tsx`
  - Optional supporting files live in the same folder:
    - `apps/open-claw/src/components/common/<ComponentName>/types.ts`
    - `apps/open-claw/src/components/common/<ComponentName>/hooks.ts`
    - `apps/open-claw/src/components/common/<ComponentName>/styles.css` (or `.module.css` / `.ts` depending on the project’s styling approach)
- **Imports**:
  - From pages or other components, import from `components/common/<ComponentName>`.

### 3. Page-only components (不可复用的页面级组件)

These are components that are currently only used by a single page or route and are not yet clearly reusable.

- **Location**: Create a local `_components` folder **next to the page file**.
- **Rule**: Only import these components within the same page/route segment. If they later become reusable across pages, promote them to `components/common`.
- **Structure**:
  - For a route file:
    - Page: `apps/open-claw/src/app/page.tsx`
    - Local components: `apps/open-claw/src/app/_components/<ComponentName>.tsx`
  - For nested routes or route groups:
    - Page: `apps/open-claw/src/app/dashboard/page.tsx`
    - Local components: `apps/open-claw/src/app/dashboard/_components/<ComponentName>.tsx`
    - Or, with route groups:
      - Page: `apps/open-claw/src/app/(marketing)/home/page.tsx`
      - Local components: `apps/open-claw/src/app/(marketing)/home/_components/<ComponentName>.tsx`

### 4. Deciding where a new component should live

When creating a new component, follow this decision flow:

1. **Is it a shadcn/ui generated or styled component?**
   - **Yes** → Put it under `components/ui`.
2. **Is it clearly reusable across multiple pages (e.g., header, footer, layout sections, cards, shared forms)?**
   - **Yes** → Put it under `components/common` using a folder-per-component structure.
3. **Is it currently specific to a single page/route and unlikely to be reused elsewhere right now?**
   - **Yes** → Put it under that page’s local `_components` folder.

If, over time, a local `_components` component is reused by other pages, move it into `components/common` and update import paths accordingly.

### 5. Naming conventions and imports

- **Component names**: Use PascalCase for React components (e.g., `Header`, `SidebarNav`, `HeroSection`).
- **File names**:
  - Recommended: Match the component name or use `index.tsx` within a folder named after the component.
- **Import paths**:
  - From pages:
    - shadcn: `import { Button } from "@/components/ui/button";`
    - shared: `import Header from "@/components/common/Header";`
    - page-local: `import HeroSection from "./_components/HeroSection";`

### 6. What to do when refactoring existing JSX out of a page

When a page becomes large and you want to extract sections into components:

1. **First step**: Extract into the page’s own `_components` folder.
2. **Evaluate reuse**:
   - If later a different page needs the same piece of UI/logic, move that component into `components/common`.
3. **Avoid**:
   - Creating ad-hoc shared folders inside pages (e.g., `app/home/components/`).
   - Mixing shadcn components with non-shadcn common components in the same folder.

## Examples

### Example A: Button (shadcn/ui)

- Path: `apps/open-claw/src/components/ui/button.tsx`
- Usage in page:
  - `apps/open-claw/src/app/page.tsx` imports as:
    - `import { Button } from "@/components/ui/button";`

### Example B: Shared Header

- Path: `apps/open-claw/src/components/common/Header/index.tsx`
- Used in multiple pages:
  - `apps/open-claw/src/app/page.tsx`
  - `apps/open-claw/src/app/dashboard/page.tsx`
- Import:
  - `import Header from "@/components/common/Header";`

### Example C: Page-specific Hero section

- Page file:
  - `apps/open-claw/src/app/page.tsx`
- Local components:
  - `apps/open-claw/src/app/_components/HeroSection.tsx`
  - `apps/open-claw/src/app/_components/FeaturesGrid.tsx`
- Import inside `page.tsx`:
  - `import HeroSection from "./_components/HeroSection";`
  - `import FeaturesGrid from "./_components/FeaturesGrid";`

If `HeroSection` or `FeaturesGrid` later need to be reused on other pages, move them to:

- `apps/open-claw/src/components/common/HeroSection/`
- `apps/open-claw/src/components/common/FeaturesGrid/`

and update imports accordingly.
