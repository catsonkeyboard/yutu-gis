---
name: UI Design System Implementation
description: 一个用于将 Craft Agents UI 设计系统应用到 React 项目的综合技能。使用 Tailwind CSS v4 和 Radix UI 提供现代、无障碍且支持主题的组件。
---

# UI 设计系统实现技能

此技能帮助您迁移或设置使用 Craft Agents UI 设计系统的 React 项目。它利用 **Tailwind CSS v4** 的原生 CSS 变量/主题引擎、用于无障碍访问的 Radix UI 以及强大的 6 色系统（OKLCH）。

## 🛠️ 先决条件

- **React 19+**
- **TypeScript 4.5+**
- **Tailwind CSS v4** (CSS 中 `@theme` 和 `@property` 支持所必需)
- **Bun** (推荐) 或 npm/pnpm/yarn

## 🚀 安装与设置

### 1. 安装依赖

运行以下命令安装所需的依赖项：

```bash
# Tailwind v4 的核心依赖
bun add tailwindcss@latest @tailwindcss/vite clsx tailwind-merge class-variance-authority lucide-react

# Radix UI 原语（按需安装，此处为基础组件）
bun add @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover @radix-ui/react-label @radix-ui/react-separator

# 动画（可选，用于高级动态效果）
bun add framer-motion

# 工具库
bun add -D prettier prettier-plugin-tailwindcss
```

### 2. 设置全局 CSS (Tailwind v4)

使用设计系统 Token 替换您的全局 CSS 文件（例如 `src/index.css`）。
该文件使用 Tailwind v4 的 `@theme` 块直接在 CSS 中定义变量，无需复杂的 JavaScript 配置。

- **源文件**: `resources/index.css`
- **目标文件**: `src/index.css`

> **注意**: 确保您的 Vite 配置使用了 `@tailwindcss/vite` 插件。

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    // ... 其他插件
  ],
})
```

### 3. 创建工具函数

创建用于合并类的工具文件。

- **源文件**: `resources/lib/utils.ts`
- **目标文件**: `src/lib/utils.ts`

## 🧩 组件设置

创建以下组件文件，通常位于 `src/components/ui/` 下。

### 核心组件

1.  **Button** (支持变体、尺寸和 Radix Slot)
    - **源文件**: `resources/components/ui/button.tsx`
    - **目标文件**: `src/components/ui/button.tsx`

2.  **Input** (优化的聚焦环和透明度)
    - **源文件**: `resources/components/ui/input.tsx`
    - **目标文件**: `src/components/ui/input.tsx`

3.  **Card** (简洁的边框和阴影样式)
    - **源文件**: `resources/components/ui/card.tsx`
    - **目标文件**: `src/components/ui/card.tsx`

4.  **Theme Provider** (管理明亮/黑暗/系统模式)
    - **源文件**: `resources/components/theme-provider.tsx`
    - **目标文件**: `src/components/theme-provider.tsx`

## 💻 使用方法

### 1. 包裹您的应用

在 `App.tsx` 或 `main.tsx` 中：

```tsx
import { ThemeProvider } from "@/components/theme-provider"

function App() {
  return (
    <ThemeProvider defaultTheme="system" defaultFont="system" storageKey="ui-theme">
      <YourAppContent />
    </ThemeProvider>
  )
}
```

### 2. 使用组件

```tsx
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function LoginPage() {
  return (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Login</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid w-full items-center gap-4">
          <Input type="email" placeholder="Email" />
          <Button variant="default">Sign In</Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

## 🎨 设计 Token 与自定义

该系统直接在 CSS 变量 (`resources/index.css`) 中处理设计 Token。

### 6 色系统 (OKLCH)
- **Background/Foreground**: 表面和文本。
- **Accent**: 品牌高亮（紫色）。
- **Info**: 询问模式/警告（琥珀色）。
- **Success**: 已连接/安全（绿色）。
- **Destructive**: 错误（红色）。

### 风景模式 (玻璃拟态)
该系统支持“风景”模式，在此模式下背景变为透明，以显示带有玻璃面板的背景图像。
- 向 `<html>` 添加 `data-scenic="true"` 以启用。
- 在 `<html>` 上设置 `--background-image` 属性。

### 排版
- **Inter**: 默认无衬线字体（通过 `data-font="inter"`）。
- **JetBrains Mono**: 等宽字体。

---

**注意**: 扩展设计时，请优先在 `@theme` 块内编辑 `src/index.css`，而不是创建 `tailwind.config.ts`。
