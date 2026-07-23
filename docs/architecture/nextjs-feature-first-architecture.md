# Next.js App Router + Features 分层架构模板

> **目的**：作为新站起步时的目录骨架与硬规则参考。**不**追求面面俱到，重在把"应该放在哪"和"绝对不能放在哪"讲清楚。
>
> **适配版本**：Next.js 15+ (App Router) · React 19 · TypeScript strict · shadcn/ui · Tailwind v4 · Prisma · Auth.js v5 · Zod · TanStack Query · Zustand

---

## 0. 一句话原则

> **路由只负责 URL，feature 负责业务，组件库负责复用，工具库负责通用能力。**
>
> 任何文件放进仓库前先问一句："它属于 URL、属于某个业务领域、属于通用 UI、还是属于通用工具？" —— 答案决定目录归属。

---

## 1. 顶层目录结构

```
my-next-app/
├── app/                              # 路由层（极薄）
│   ├── (marketing)/                  # Route Group: 不带 URL 前缀的逻辑分组
│   │   ├── layout.tsx                # 共用 Header/Footer
│   │   ├── page.tsx                  # /
│   │   ├── pricing/page.tsx          # /pricing
│   │   └── about/page.tsx
│   ├── (auth)/                       # Route Group: 登录/注册（独立布局）
│   │   ├── layout.tsx                # 居中卡片布局
│   │   ├── login/page.tsx            # /login
│   │   └── register/page.tsx
│   ├── (app)/                        # Route Group: 登录后主应用
│   │   ├── layout.tsx                # 侧边栏 + 顶部
│   │   ├── dashboard/page.tsx        # /dashboard
│   │   ├── projects/
│   │   │   ├── page.tsx              # /projects
│   │   │   └── [projectId]/
│   │   │       ├── page.tsx          # /projects/123
│   │   │       └── settings/page.tsx
│   │   └── settings/page.tsx
│   ├── api/                          # Route Handlers (REST/Webhook)
│   │   ├── webhooks/stripe/route.ts
│   │   └── auth/[...nextauth]/route.ts
│   ├── _components/                  # 路由层私有组件（不跨路由复用）
│   ├── _lib/                         # 路由层私有工具（不跨路由复用）
│   ├── layout.tsx                    # Root layout（html/body/Providers）
│   ├── error.tsx                     # 全局错误边界
│   ├── not-found.tsx
│   ├── loading.tsx                   # 全局 loading
│   └── globals.css                   # Tailwind v4 @theme tokens
│
├── features/                         # 业务特性模块（核心）
│   ├── auth/                         #   登录/注册/session
│   ├── billing/                      #   订阅/Stripe webhook
│   ├── projects/                     #   项目 CRUD
│   ├── dashboard/                    #   仪表盘聚合
│   ├── notifications/                #   站内通知
│   └── settings/                     #   账户偏好
│
├── components/                       # 跨特性共享的 UI 基础组件
│   └── ui/                           #   shadcn/ui 生成的原子组件
│       ├── button.tsx
│       ├── dialog.tsx
│       └── ...
│
├── lib/                              # 跨特性共享的基础设施
│   ├── db/                           #   Prisma client + repositories
│   ├── auth/                         #   Auth.js 配置 + helpers
│   ├── email/                        #   Resnod 模板
│   ├── storage/                      #   S3 / R2 客户端
│   ├── queue/                        #   后台任务
│   ├── i18n/                         #   多语言
│   ├── fetcher.ts                    #   通用 fetch 封装
│   ├── utils.ts                      #   cn() 等
│   └── nav.ts                        #   侧边栏/顶导配置
│
├── server/                           # 纯服务端代码（绝不能进客户端 bundle）
│   ├── actions/                      #   Server Actions 编排
│   ├── services/                     #   业务服务（跨表/跨领域）
│   └── queries/                      #   复杂查询（专用 repository）
│
├── hooks/                            # 跨特性共享的 React hooks
│
├── stores/                           # 跨特性共享的客户端 store
│
├── types/                            # 全局类型（领域无关）
│
├── styles/                           # 额外 CSS（globals.css 之外）
│
├── public/                           # 静态资源
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── tests/                            # E2E (Playwright) / 集成测试
│
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── components.json                   # shadcn/ui 配置
├── tsconfig.json
└── package.json
```

---

## 2. `app/` 路由层：能做到多薄就多薄

### 2.1 路由文件只做三件事

```tsx
// app/(app)/dashboard/page.tsx
import { DashboardScreen } from '@/features/dashboard/dashboard-screen'
import { HydrateClient } from '@/trpc/react'  // 或 RSC prefetch helper

export default async function Page() {
  // ① 服务端预取（数据/权限校验）
  const data = await getDashboardData()

  // ② 渲染一个特性组件
  return <DashboardScreen initialData={data} />
}
```

✅ **允许的**：URL 参数解析、权限校验（`redirect('/login')`）、数据预取、把数据传给 feature。
❌ **禁止的**：UI 业务逻辑、复杂状态、跨多个 feature 的编排 —— 那些放 `features/<x>/` 或 `server/services/`。

### 2.2 路由私有文件用 `_` 前缀

Next 15 私有文件夹约定：`_components/`、`_lib/` 不会变成 URL 段，且 IDE 折叠更整齐。

> ⚠️ **利**：路由级组件不会污染全局 `components/`。
> ⚠️ **弊**：私有组件如果被三个页面用到，就该升级到 `features/<x>/components/`。

### 2.3 Route Group `(name)` 的正确用法

- **共用布局**：`(marketing)/` 和 `(auth)/` 各自 layout 不同 → 用 Group。
- **权限隔离**：`(app)/` 在 layout 里做 session 检查 → 用 Group。
- ❌ **错误用法**：为了"分类好看"就把 page 都扔进 Group，但 layout 没有任何差异 → 删掉 Group。

### 2.4 路由分组的坑

| 陷阱 | 后果 | 应对 |
|---|---|---|
| 同一 URL 在两个 Group 出现 | 路由冲突 | 一个 URL 只能对应一个 `page.tsx` |
| Group layout 嵌套层级深 | 调试栈难追 | 建议最多 2 层 Group |
| Group 名与 URL 段名重复 | 404 | Group 不影响 URL，但代码易混淆 → Group 名用括号内单数 |

---

## 3. `features/` 业务特性层：项目的核心

### 3.1 标准范式

```
features/<feature>/
├── <feature>-screen.tsx        # 主要屏幕组件（被路由 import）
├── components/                 # 特性私有组件
│   ├── project-card.tsx
│   └── project-form.tsx
├── hooks/                      # 特性私有 hooks
│   └── use-projects.ts
├── stores/                     # 特性私有 store
│   └── use-project-filters.ts
├── actions/                    # "use server" 入口（编排层）
│   └── project-actions.ts
├── schemas/                    # Zod schema
│   └── project-schema.ts
├── types.ts                    # 领域类型
├── queries.ts                  # RSC 数据查询函数
├── api.ts                      # 客户端可调用的 server action 封装
└── README.md                   # 特性业务说明（可选）
```

### 3.2 features 之间禁止互引

> **铁律**：`features/a/` 不能 `import` 任何 `features/b/` 的代码。

**怎么办**？两种合法路径：

1. **抽到 `lib/`**：通用能力（utils、fetcher）。
2. **通过 `server/services/` 编排**：跨特性的业务编排（如下单时同时扣库存 + 发通知）。

> ⚠️ **利**：特性可独立删除、可独立测试，不会形成"特性之间的隐式依赖网"。
> ⚠️ **弊**：有时必须开一个新文件到 `server/services/` 解决 —— 比"图省事互相 import"多两步，但回报巨大。

### 3.3 Server Action / Client Action 怎么分

| 触发源 | 应该放在 |
|---|---|
| 表单提交、按钮点击（用户动作） | `features/<x>/actions/` 内的 `"use server"` 函数 |
| 跨多个领域（用户操作触发 + 账单 + 通知） | `server/services/<x>-service.ts` 编排 |
| 仅 RSC 数据获取 | `features/<x>/queries.ts`，不要包成 Action |
| 纯客户端状态 | `features/<x>/stores/`（Zustand） |

### 3.4 Feature 必须有公开入口

> **建议**：每个 `features/<x>/` 暴露一个 `index.ts`，只导出对外可见的组件/函数/类型。
> feature 内部的文件依然能正常 import，但别人用这个 feature 时只 `import { ProjectCard } from '@/features/projects'`。

> ⚠️ **利**：换内部实现不影响调用方，删除/重构 feature 时一眼看清公共面。
> ⚠️ **弊**：多一层文件。妥协：只有 ≥ 3 个调用方时才做 `index.ts`，小 feature 不强制。

---

## 4. `components/ui/`：原子组件只放真正可复用的

- ✅ `Button`、`Input`、`Dialog`、`DropdownMenu`、`DataTable` —— 跨多个 feature 复用。
- ❌ `ProjectCard`、`BillingSummary` —— 这属于 `features/<x>/components/`。
- ❌ `Navbar`、`Footer` —— 这属于 `app/(marketing)/_components/` 或 `features/marketing/`。

> ⚠️ **判断标准**：「如果我换一个项目，会带走它吗？」—— 会 → `components/ui/`；不会 → 留在 feature。

### shadcn/ui 的角色

- `components/ui/` 下的所有文件是 shadcn 生成的（你可以随时改源码）。
- `components.json` 锁定别名和样式 token。
- 新增原子组件优先 `pnpm dlx shadcn@latest add xxx`，不要从零手写。

---

## 5. `lib/`：跨特性的纯通用能力

```
lib/
├── db/
│   ├── client.ts                # Prisma 单例
│   ├── repositories/
│   │   ├── project-repo.ts
│   │   └── user-repo.ts
│   └── types.ts                 # DB 派生类型
├── auth/
│   ├── config.ts                # Auth.js v5 配置
│   ├── session.ts               # auth() / getCurrentUser() 封装
│   └── permissions.ts           # 权限规则
├── email/
│   ├── client.ts                # Resnod 客户端
│   └── templates/               # React Email 模板
├── storage/
│   ├── client.ts                # S3 client
│   └── upload.ts
├── queue/
│   └── workers/
├── fetcher.ts                   # SWR/TanStack Query 通用 fetcher
├── utils.ts                     # cn(), formatDate() 等
└── nav.ts                       # 导航配置
```

**判断**：放到 `lib/` 还是 `features/<x>/`？
- 「这个能力**在两个或以上 feature**里用到」→ `lib/`
- 「**只有一个 feature**用到」→ 留在 feature 内部

> ⚠️ **利**：`lib/` 几乎不会增长失控。
> ⚠️ **弊**：判断"通用"是个手艺活，前期可能反复搬 —— **正常**，别怕搬。

---

## 6. `server/`：Node-only 代码的"防泄露墙"

> **为什么单独建？** Next.js 的 RSC/Action 编译时无法 100% 检测所有 server-only 依赖。手动隔开是最稳的防御。

```
server/
├── actions/                     # 复合 server actions（feature 之外）
├── services/                    # 跨领域业务服务
│   ├── billing-service.ts       # 订阅、发票
│   └── onboarding-service.ts    # 注册后初始化
└── queries/                     # 复杂专用查询
    └── analytics-query.ts
```

> **铁律**：`server/**` 内的文件**绝不能**被 `features/<x>/components/`、`components/ui/`、`hooks/` 引用（直接用 `'server-only'` 包裹会编译失败，是好事）。

> ⚠️ **利**：杜绝"在客户端组件里意外 import 了 Prisma"这种事故。
> ⚠️ **弊**：多一层心智 —— 简单项目（5 个页面）可以省略 `server/`，直接放 `lib/`。

---

## 7. 状态管理怎么分

| 状态类型 | 工具 | 放在哪 |
|---|---|---|
| 服务端真实数据 | RSC + Server Actions | `features/<x>/queries.ts` |
| 客户端缓存的服务端数据 | TanStack Query / SWR | `features/<x>/hooks/use-x.ts` |
| 跨页面用户偏好 / UI 状态 | Zustand | `stores/use-<x>.ts`（如果跨 feature）<br>`features/<x>/stores/`（feature 内部） |
| 表单状态 | react-hook-form + Zod | `features/<x>/schemas/` + `components/` |
| URL 状态 | `nuqs` 或 `useSearchParams` | 路由层处理 |

> **少即是多**：能用 URL 表达的（filter、tab、分页）就别用 store。store 只放"用户关掉 app 再打开还得在"的东西。

---

## 8. 数据库与 ORM 边界

```
prisma/
├── schema.prisma                # 唯一 schema 源
├── migrations/                  # 迁移历史
└── seed.ts

lib/db/
├── client.ts                    # PrismaClient 单例（防 dev hot reload 多实例）
├── repositories/                # Repository pattern（可选）
└── types.ts
```

**是否抽 Repository？**

| 情况 | 建议 |
|---|---|
| 简单 CRUD，5 张表 | 直接 `prisma.project.findMany()`，不抽 |
| 业务复杂（多表 join / 复杂权限） | 抽到 `repositories/project-repo.ts`，feature 只调 repo |
| 团队 ≥ 3 人，DAO 风格统一 | 抽 repo，统一命名（`findById`, `findManyByOwner`） |

> ⚠️ **利**：repo 隐藏 Prisma 细节，feature 业务代码不耦合 ORM。
> ⚠️ **弊**：小项目是 over-engineering，纯增加函数调用深度。

---

## 9. 鉴权：把权限判断收拢到一处

```
lib/auth/
├── config.ts                    # Auth.js 配置
├── session.ts                   # auth() 封装
└── permissions.ts               # can(user, 'project.delete', project)
```

### 9.1 三层校验

```tsx
// ① 路由层（粗粒度）
// app/(app)/projects/[projectId]/page.tsx
const session = await auth()
if (!session) redirect('/login')

// ② 服务层（细粒度，必须）
// server/services/project-service.ts
import { assertCan } from '@/lib/auth/permissions'
assertCan(session.user, 'project.delete', project)

// ③ UI 层（仅用来藏按钮，不替代前两层）
{can('project.delete', project) && <DeleteButton />}
```

> ⚠️ **铁律**：前端隐藏按钮**不是**安全措施。后端不验，攻击者 curl 一下就过。
> ⚠️ **利**：三层分离让"权限从 1 处改 1 行"成为可能。
> ⚠️ **弊**：每个 mutation 都要加 `assertCan` —— 容易漏。**用 lint rule 或 wrapper helper 强制**。

---

## 10. 测试在哪做

| 层级 | 工具 | 位置 |
|---|---|---|
| 单元 / 组件 | Vitest + Testing Library | `components/ui/button.test.tsx`（与组件同目录） |
| Server Action / Service | Vitest | `server/services/billing-service.test.ts` |
| Hook | Vitest + renderHook | `features/projects/hooks/use-projects.test.ts` |
| E2E | Playwright | `tests/e2e/login.spec.ts` |
| Visual regression | Chromatic / Playwright | `tests/visual/` |

> **与组件同目录**是关键 —— 改组件时能立刻看到测试。
> 复杂特性可加 `features/<x>/__tests__/` 子目录（不要走 `__tests__` 全局）。

---

## 11. 文件命名规范

| 类型 | 规范 | 示例 |
|---|---|---|
| 路由文件 | Next 默认 | `page.tsx`, `layout.tsx`, `loading.tsx` |
| React 组件 | kebab-case | `project-card.tsx`, `use-projects.ts` |
| Hook | `use-*` 前缀 | `use-debounce.ts` |
| 非组件工具 | kebab-case | `format-date.ts` |
| 类型文件 | `types.ts` 或 `*.d.ts` | `features/projects/types.ts` |
| Server action | `*-actions.ts` | `project-actions.ts` |
| Schema | `*-schema.ts` | `project-schema.ts` |
| 常量文件 | `constants.ts` 或 `nav.ts` | `lib/nav.ts` |
| 测试 | `*.test.ts(x)` 或 `*.spec.ts(x)` | `button.test.tsx` |

---

## 12. 硬规则（不要破）

| ❌ 禁止 | ✅ 替代 |
|---|---|
| `features/a/` 引用 `features/b/` 内部文件 | 抽到 `lib/` 或 `server/services/` |
| 在客户端组件里 `import` Prisma / fs / 任何 server-only 包 | 该逻辑搬进 server action / service |
| 把跨特性复用的组件放在 `features/<x>/components/` | 升级到 `components/ui/` |
| 在 `app/<route>/page.tsx` 里写 200 行业务代码 | 拆到 `features/<x>/<x>-screen.tsx` |
| 用 `npm` / `yarn` | 用 `pnpm`（统一在 `package.json#packageManager` 锁版本） |
| `// @ts-ignore` 静默吞错 | 用 `as const` + 真正的 narrowing |
| 直接在 DB 字段里存 JSON 字符串滥用 | 用专门的关联表（除非确有 audit 需求） |
| 把 secret 写进 `NEXT_PUBLIC_*` | 客户端能读的才放 `NEXT_PUBLIC_` |
| 在 Server Action 里不验证输入 | 第一行 `schema.parse(formData)` |
| 在 root layout 做重业务（如查所有用户） | 推到具体 page layout 或 page 自身 |

---

## 13. 性能 / SSR 取舍清单

| 场景 | 模式 |
|---|---|
| SEO 关键页（落地页、文章） | RSC + 静态生成（`revalidate`） |
| 登录后页面（dashboard） | RSC + 强制 dynamic（`export const dynamic = 'force-dynamic'`） |
| 重交互（编辑器、表单构造器） | `'use client'` 子树，最小化 hydration |
| 实时数据（IM、协作） | 客户端组件 + WebSocket / SSE |
| 大列表 | 走 RSC + 流式 `<Suspense>`，或客户端 + `react-virtuoso` |
| 第三方重组件（富文本、图表） | 动态 import + `ssr: false` |

> ⚠️ **默认就是 Server Component**。`'use client'` 写在**最深的、真正需要交互的叶子**上，而不是 root。

---

## 14. 演进路径

不要一开始就把所有目录都建出来：

1. **MVP 阶段（≤ 10 页面）**：`app/` + `components/ui/` + `lib/` + `features/<核心域>/`，**不要** `server/` / `repositories/` / `hooks/` 全局。
2. **增长期（10–40 页面）**：补 `server/services/`，开始拆 `features/`。
3. **成熟期（多团队）**：补 `repositories/`、抽 `server/actions/`、引入 `tests/` 严格分层、考虑 monorepo（`apps/web` + `packages/db` + `packages/ui`）。

> **新项目最容易犯的错**：照搬大厂的"完美"目录，结果 70% 文件是空的。**按需生长**，每加一层目录前先问"我当下有 ≥ 2 个调用方吗？"

---

## 15. 速查：新增一个 X feature 的清单

新增 `features/notifications/` 时的检查项：

- [ ] 路由文件：`app/(app)/notifications/page.tsx` 一行 re-export
- [ ] 主组件：`features/notifications/notifications-screen.tsx`
- [ ] 子组件：`features/notifications/components/notification-item.tsx`
- [ ] 数据查询：`features/notifications/queries.ts`（RSC）
- [ ] 客户端状态：`features/notifications/stores/use-notification-filters.ts`（如需）
- [ ] Server Action：`features/notifications/actions/notification-actions.ts`（如需）
- [ ] Schema：`features/notifications/schemas/notification-schema.ts`（如需）
- [ ] 类型：`features/notifications/types.ts`
- [ ] 跨特性需要用 → 在 `server/services/` 加 service
- [ ] 跨特性需要的能力 → 在 `lib/` 加通用模块
- [ ] 是否触达新领域 → 检查 `lib/auth/permissions.ts` 是否要加规则
- [ ] 是否需要新表 → 更新 `prisma/schema.prisma` + 写迁移
- [ ] 索引文件：仅在调用方 ≥ 3 时建 `features/notifications/index.ts`
- [ ] README：仅当业务复杂时建 `features/notifications/README.md`

---

## 16. 一张图总结

```
┌─────────────────────────────────────────────────────────────┐
│  app/                  URL 形状、layout、Provider            │
│      ↓ (re-export)                                           │
│  features/<x>/         业务逻辑、私有组件、私有状态           │
│      ↓ (调用)                                                │
│  server/ services       跨领域编排、敏感操作                  │
│      ↓ (调用)                                                │
│  lib/                   db/auth/email/storage... 基础设施     │
│      ↓                                                       │
│  prisma/                schema / migrations                  │
└─────────────────────────────────────────────────────────────┘
            ↘                    ↙
       components/ui/      hooks/   stores/
       跨特性原子组件      通用 hooks  通用 store
```

> **方向只有一条**：从上往下，**单向**依赖。`lib/` 不知道 `features/`，`features/` 之间不互相 import。

---

## 17. 与原 RN 项目的对照（方便迁移时参考）

| RN 端 (`src/...`) | Next.js 端 |
|---|---|
| `app/` (Expo Router) | `app/` (App Router) — 名字一样，角色相同 |
| `features/<x>/<x>-screen.tsx` | `features/<x>/<x>-screen.tsx` — **基本一致** |
| `features/<x>/components/` | `features/<x>/components/` — 一致 |
| `lib/storage.tsx` (MMKV) | `lib/db/` + `lib/storage/`（S3 / 持久化） |
| `lib/api/` (axios + React Query) | `lib/fetcher.ts`（TanStack Query 或 RSC fetch） |
| `components/ui/` (Button/Text/Input) | `components/ui/`（shadcn/ui） |
| `useMMKVString(key)` | `cookies()` / `headers()` / DB 查 |
| `useAppGate()` 路由守卫 | `layout.tsx` 里 `auth()` + `redirect()` |
| `translations/*.json` | `messages/zh.json` + `next-intl` |
| `uniwind` (Tailwind v4) | Tailwind v4（`@theme` 一致） |
| `react-native-svg` 图表 | `recharts` 或自研 SVG |

---

**版本**：v0.1 · 最近更新：2026-06-17

> 用法：把这份文档当 checklist 校对现有项目；或 clone 一个空 Next 项目后按 §1 目录骨架开建。
> 改文档时请同步更新 §17 对照表。
