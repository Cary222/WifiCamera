<!-- reviewer: ai-learning-mentor (软层) -->
<!-- review_scope: Phase 0 + camera-core HTTP 最小切片 -->
<!-- project: skysense-app (Expo SDK 54 + React Native 0.81) -->
<!-- review_date: 2026-07-23 -->

# PR1 Camera AI Mentor Review Report

## Verdict

**CHANGES_REQUIRED**

Phase 0 基础设施选型方向正确，但存在 **5 个需要调整的软层问题**，集中在命名准确性、feature-first 边界服从性、以及下一步扩展路径的提前设计这几个方面。核心问题不是"写错了"，而是"命名超前了实际固件能力"和"文件边界与 feature-first 规范不对齐"。

---

## 架构优点

### 1. 三层错误抽象干净利落

`errors.ts` 里的 `CameraApiError` 是这次切片质量最高的部分。三种 `kind`（`network` / `http` / `business`）完全对应了固件 HTTP 调用在真实环境里的三种失败模式，且 `fromAxios` 和 `fromBusiness` 两个工厂方法职责清晰，`cause` 链完整。Testable Error 是做长链路调试的基础，这个设计选型是合理的。

> **类比**：就像 ProjectHub 里的全局事件追踪系统——同一个 event 可能有多种来源（visit / computed / routed），但出口统一。camera HTTP 这层也是：网络问题 / HTTP 状态 / 固件业务失败，来源不同但都收敛到同一个 Error type。

### 2. snake_case 字段命名守住了固件契约

`types.ts` 里 `UpdateTimePayload` 的 `time_zone`、固件返回的 `SN` / `HD` / `magic` 都保留了原始 field name，并在注释里明确写了"firmware contract"。这是正确的——固件 HTTP API 是字节协议，改了字段名就不兼容了。**这个决策是对的，不应该改成驼峰。**

### 3. 独立 axios 实例隔离了云端和局域网流量

`config.ts` 的注释把这个设计决策写得很清楚：camera HTTP 走的是 LAN 明文（`192.168.1.1:8999`），而 `@/lib/api/` 走的是云端 HTTPS。**把两个流量通道完全隔离是正确的**，不会出现在 axios interceptor 里互相污染的风险。

### 4. `unwrapCamera` 统一了成功路径

`errors.ts` 里的 `unwrapCamera` 函数把固件 HTTP 200 但 `success: false` 的情况作为业务错误抛出，是正确处理"固件层业务错误"的方式。这个在 `startup-service.ts` 里被所有函数复用，代码量少但语义精准。

### 5. 测试覆盖了三层错误路径

`startup-service.test.ts` 覆盖了 4 + 4 + 4 = 12 个 case，axios mock 用了 `jest-setup.ts` 里的全局 fake，不依赖真实网络。三层错误（network/http/business）各有 4 个测试，这个覆盖率在 Phase 0 是足够的。

---

## 需要调整项

### 问题 1：`config.ts` 的 endpoint 路径命名与固件实际路由不对齐

**文件**：`config.ts` 第 14-18 行

**问题**：

```typescript
getVersion: '/StartUp/GetVersion/',
getSerial: '/StartUp/Serial/',
postUpdateTime: '/StartUp/UpdateTime/',
```

固件路由是 `GetVersion`（驼峰）、`Serial`（无动词）、`UpdateTime`（驼峰）——三种命名风格不统一。把它们映射到 `getVersion` / `getSerial` / `postUpdateTime` 是正确的**客户端命名**，但问题是：

1. 固件端点是**固件的事**，客户端内部应该用更抽象的 key，比如 `getVersion` → `version`，`postUpdateTime` → `timeSync`。这样当固件未来改变 endpoint 路径时，只改 `config.ts` 里的 value。
2. `postUpdateTime` 的 key 名用了 HTTP method 前缀（`post`），这是 HTTP 动词，不是业务语义。固件 API 是 HTTP 动词+路径，客户端 service 里已经写了 `'post'`，所以 key 不需要再带 `post` 前缀。

**调整建议**：

```typescript
export const CAMERA_ENDPOINTS = {
  version: '/StartUp/GetVersion/',      // 读版本：业务语义而非 HTTP 动词
  serial: '/StartUp/Serial/',            // 读序列号
  timeSync: '/StartUp/UpdateTime/',      // 同步时间：业务语义而非 postUpdateTime
} as const;
```

对应地，`startup-service.ts` 里的 `CAMERA_ENDPOINTS.getVersion` 改为 `CAMERA_ENDPOINTS.version`，以此类推。

**为什么这个取舍是对的**：endpoint key 是客户端对固件能力的抽象，应该用业务语义命名。`/StartUp/GetVersion/` 是固件的 URL path，`version` 是客户端理解这个 path 在做什么。当前命名混入了 HTTP 动词前缀，模糊了业务语义的抽象层。

---

### 问题 2：`services/` 目录边界与 feature-first 规范不对齐

**文件**：`src/features/camera/services/startup-service.ts`

**问题**：

`camera/` feature 下面直接建了 `services/` 目录。根据 `skysense-app-conventions` skill §3 的 feature module 布局规范：

```
features/<feature>/
├── <feature>-screen.tsx      # 屏幕组件
├── components/               # 特性私有组件
├── hooks/                    # 特性私有 hooks
└── [stores/]                # 特性私有 store
```

`services/` 不是规范里列出的子目录。`startup-service.ts` 是 camera feature 的**核心业务逻辑**，它应该直接放在 `src/features/camera/` 下，文件名 `startup-service.ts` 本身就说明了它是 startup 相关的 service。

**调整建议**：

把 `services/startup-service.ts` → `src/features/camera/startup-service.ts`（或更准确地说，`camera-startup-service.ts` 以和 `types.ts`/`errors.ts`/`config.ts` 保持同级）。

```
src/features/camera/
├── index.ts                  # 统一导出
├── types.ts                  # 固件 wire types
├── errors.ts                 # 错误类型
├── config.ts                 # 配置常量
├── startup-service.ts        # ← 移到这里
├── startup-service.test.ts   # ← 同步移动
├── client.ts                 # axios 实例
└── [future: device-service.ts]  # 固件设备信息
```

**为什么这个取舍是对的**：feature-first 的核心是"同一业务的代码聚合在一起"——`startup-service.ts` 是 camera startup 场景的唯一 service，它和 `types.ts`/`errors.ts`/`config.ts` 都在同一个抽象层次（camera HTTP 协议层），平铺比嵌套更合理。`services/` 子目录适合"一个 feature 有多个不同领域 service"的场景，Phase 0 只有一个 service，嵌套是过度设计。

---

### 问题 3：feature-first 迁移路径文档缺失

**问题**：这次切片是 Phase 0，但 `docs/architecture/` 下没有任何关于"camera feature 迁移路径"的文档。现有的 `docs/architecture/nextjs-feature-first-architecture.md` 是 Next.js 的，和 React Native 项目无关。用户在验收时没有办法从文档层面确认"这个 feature 将来会如何扩展"。

**调整建议**：

在 `docs/architecture/` 下新增 `camera-feature-roadmap.md`（或写入 `PR1-camera-ai-mentor.md` 的"逐步验证建议"章节），说明：

```
Phase 0（当前）:  HTTP 基础层（client + errors + types + config）
Phase 1:         Startup 服务（version/serial/timeSync）
Phase 2:         固件设备信息 API（设备状态、SD 卡等）
Phase 3:         固件拍照/录像 API（流媒体）
Phase 4:         固件 OTA 升级
```

每个 Phase 标注验收路径（"用户能解释什么"），让用户知道每次 merge 的价值在哪里。

**为什么这个取舍是对的**：用户的学习风格是"能向团队解释方案"，文档是解释的锚点。Phase 0 没有文档，后续的 Phase 1-4 也没有参照物，团队无法判断"做到了什么程度"。

---

### 问题 4：mock 数据与 feature-first "真实数据优先" 原则不对齐

**文件**：`startup-service.ts`（无真实实现）和 `use-measurement-store.ts`（跨 feature 引用）

**问题**：

Phase 0 实现了 service 函数，但没有对应的真实 API 调用路径——`startup-service.ts` 里的函数调用的是 `cameraClient.request`，而这个 client 指向 `192.168.1.1:8999`。在开发/测试阶段，设备不在同一 LAN 的情况下，这些调用会全部失败（network error）。

现有的 mock 数据（`use-measurement-store.ts` 的 `MOCK_DEVICES`）是硬编码的，不经过 camera HTTP service。这意味着 camera HTTP 的三种错误路径（network/http/business）在开发阶段完全无法触发。

**调整建议**：

Phase 0 应该同时交付一个开发阶段的 **mock/fallback 机制**：

```typescript
// config.ts
export const CAMERA_MOCK_MODE =
  Env.EXPO_PUBLIC_CAMERA_MOCK === 'true' || __DEV__;

// client.ts 或 startup-service.ts
async function cameraRequest<T>(...): Promise<CameraApiResponse<T>> {
  if (CAMERA_MOCK_MODE) {
    return mockCameraResponse<T>(endpoint);
  }
  return realRequest(...);
}
```

或者更简单：在 `jest-setup.ts` 里已经做了 axios mock，测试阶段用测试文件验证就够了——但这个决策需要**文档化**，说明"Phase 0 的真实 API 验证需要等 Phase 1 的设备在场"。

**为什么这个取舍是对的**：mock 机制是 feature-first 渐进迁移的关键——每个 Phase 交付可用功能，不能因为设备不在场就卡住。`__DEV__` 自动开启 mock 是 RN 项目的通行做法。

---

### 问题 5：`cameraRequest` 泛型没有处理固件返回 `data: null` 的情况

**文件**：`client.ts` 第 21-32 行 + `errors.ts` 第 100 行

**问题**：

```typescript
export async function cameraRequest<T>(
  method: 'get' | 'post',
  url: string,
  data?: unknown,
): Promise<CameraApiResponse<T>> {
  const response = await cameraClient.request<CameraApiResponse<T>>({
    method,
    url,
    data,
  });
  return response.data;
}
```

固件的 `success: true` 响应里，`data` 可能是 `null`（比如 `postUpdateTime` 的成功响应是 `{ success: true, data: null }`）。`CameraApiResponse<T>` 的泛型 `T` 无法表达"data 是 `null`"的情况。当前 `postUpdateTime` 用的是 `cameraRequest<null>`，但 TypeScript 里 `null` 作为泛型参数和 `null` 作为 data 字段值是两个不同的东西。

`unwrapCamera` 里 `payload.data` 返回的是 `T`（可能是 `null`），这是对的——`null` 作为 T 的值是被允许的。但 `CameraApiResponse<CameraVersion>` 和 `CameraApiResponse<null>` 在类型层面是冲突的。

**调整建议**：

```typescript
// 分离两种响应类型
export type CameraApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

export type CameraApiFailureResponse = {
  success: false;
  data: null;
  message?: string;
};

export type CameraApiResponse<T> =
  | CameraApiSuccessResponse<T>
  | CameraApiFailureResponse;
```

这样 `unwrapCamera` 的类型收窄更精确，测试里的 `success: false` case 类型检查也会更严。

**为什么这个取舍是对的**：固件 API 的成功和失败响应结构完全不同（一个有 data，一个无 data），用 discriminated union 能让 TypeScript 在编译期就区分开。`null` 在 TS 里既是类型也是值，`CameraApiResponse<null>` 容易和 `CameraApiFailureResponse` 混淆。

---

## 给用户理解系统的关键取舍

### 取舍 1：为什么 camera client 要独立，不复用 `@/lib/api/` 里的 axios？

**类比**：就像 ProjectHub 里 RAG 的 FastAPI 服务和 Next.js 主应用的关系——RAG 的 embedding 服务跑在 `:5000`，Next.js 跑在 `:3000`，两边完全不共享 axios instance。

camera HTTP client 走的是 LAN 明文 `192.168.1.1:8999`，云端 API 走的是 HTTPS。两者在以下维度都不同：

| 维度 | Camera LAN | 云端 API |
|------|------------|---------|
| 协议 | HTTP 明文 | HTTPS |
| 鉴权 | 无（固件不支持） | Bearer token |
| 超时 | 8s（固件慢） | 默认 |
| 错误处理 | 三层（network/http/business） | 统一 API error |
| 重试策略 | 不重试（固件幂等性未知） | 可能重试 |

复用 axios instance 会在 interceptor 里引入不必要的耦合。**分离是对的。**

### 取舍 2：为什么 snake_case 字段名不改成 camelCase？

固件 HTTP API 是一个独立的嵌入式系统，它的 JSON 序列化规则是固件团队定的（`time_zone`、`SN`、`HD`）。我们在客户端改字段名只改变了 JS 内存里的形状，但：

- 发送请求时 axios 还是会按 `time_zone` 发给固件
- 固件返回 `SN` 后我们内存里是 `sN` 还是 `sN` 都不影响逻辑

所以保留 snake_case 是**最小改动的正确选择**——只在业务层（`startup-service.ts`）用 camelCase 作为内部 API（比如 `postUpdateTime` 函数接受 `timeZone` 参数），在 HTTP 层和固件打交道时保持 snake_case。

### 取舍 3：为什么 Phase 0 只做 startup service，不做 UI？

这是 feature-first 渐进迁移的核心原则——**先抽象底层依赖，再做上层 UI**。

camera HTTP service 是 `device/` feature 的基础设施。如果 Phase 0 就做 UI（比如在 `device-list-screen.tsx` 里调用 `getVersion()`），那么：

1. 固件接口变了 → UI 和 service 一起改
2. 想换一种 HTTP 客户端 → UI 不知道
3. 想加 mock/fallback → UI 要改

分层后，`device/` feature 的 screen 只依赖 `camera/` feature 的 service interface，不依赖 axios 和 HTTP 细节。**UI 变化快，基础设施变化慢，先稳定底层是正确的顺序。**

---

## 逐步验证建议

验收路径按以下顺序让用户逐层解释"系统链路"：

### 验证 1：三层错误路径（用户能解释固件 HTTP 的三种失败模式）

```
getVersion()
    │
    ├── [固件断电/网线拔了] → network error → kind: 'network'
    │     解释：axios 根本没收到 HTTP 响应，固件不在网上
    │
    ├── [固件返回 500] → http error → kind: 'http'
    │     解释：固件收到了请求，但内部处理失败，返回了非 2xx
    │
    └── [固件返回 {success: false}] → business error → kind: 'business'
          解释：固件 HTTP 200，但业务层拒绝了（设备未初始化）
```

**验证方法**：看 `startup-service.test.ts` 里 12 个 case，确认每种错误 kind 都有对应测试。

### 验证 2：snake_case 契约（用户能解释为什么不能改字段名）

```
postUpdateTime({ time: '...', time_zone: 8 })
    │
    ├── [正确字段名] → 固件返回 200
    │
    └── [改成 camelCase timeZone] → 固件返回 {success: false, message: 'Invalid field'}
```

**验证方法**：读 `startup-service.ts` 第 37-39 行的注释，确认团队理解"firmware contract"的含义。

### 验证 3：feature-first 边界（用户能解释 camera 和 device 是两个不同抽象层）

```
device-list-screen.tsx（UI 层）──依赖──→ camera/startup-service.ts（HTTP service 层）
                                              │
                                              └── camera/client.ts（axios 底层）
```

**验证方法**：确认 `device/` 里的任何文件都不直接 import axios，都通过 `camera/startup-service.ts` 的函数接口调用。

### 验证 4：独立 axios 实例隔离（用户能解释为什么 camera HTTP 不会干扰云端 API）

**验证方法**：在 `device-list-screen.tsx` 里搜索 `axios`，应该找不到任何 import camera client 之外的 axios 用法。

---

## 总结

Phase 0 交付了 camera HTTP 协议的最小可用切片，基础设施选型正确，三层错误抽象和固件契约保留都是对的。主要调整点是 **5 个软层问题**：

1. endpoint key 命名去 HTTP 动词前缀，用业务语义（`timeSync` 而非 `postUpdateTime`）
2. `services/` 目录扁平化到 feature 根目录
3. 补充 camera feature 迁移路径文档
4. 补充开发阶段 mock 机制或明确标注"需要设备在场验证"
5. `CameraApiResponse` 泛型分离 success/failure union

调整完后，Phase 0 就是一块干净的基础设施层——用户可以向团队解释"camera HTTP 是什么"+"为什么要这样分层"。
