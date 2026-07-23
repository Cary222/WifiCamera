<!-- reviewer: ai-learning-mentor (软层) -->

# PR3 Review: Camera Store + CameraContext (Phase 1.8)

**范围**：`camera-store.ts` · `camera-store.test.ts` · `camera-context.tsx` · `config.ts` · `index.ts` · `src/app/_layout.tsx`

**前置验证**：✅ 4 suites · 29 tests · tsc · eslint · git diff check passed

---

## 整体评价

**APPROVED — 无阻塞项。** 架构选型合理，职责边界清晰，Feature-First 落地正确。发现 2 个低风险观察点（无需修改，记录在案），1 个取舍已充分说明。

---

## Finding 1 [LOW] — 模块级 WebSocket 单例的隐式状态

**文件**：`camera-store.ts` 第 65 行

```ts
let cameraWebSocket: CameraWebSocketService | null = null;
```

**问题描述**：WebSocket 实例作为模块级变量游离在 Store 状态之外，不受 Zustand 追踪。

**实际影响**：
- 不影响正确性：`connect()` 有 `!cameraWebSocket` 守卫，重复调用安全；`disconnect()` 正确清空。
- 潜在盲点：若未来有测试需要 mock 单例，需要额外处理模块状态。
- 当前 `beforeEach` 未重置此变量，但因测试依赖 `setState` 而非真实连接，并未触发此路径。

**判断**：低风险，可接受的设计。不修改，持续观察。

---

## Finding 2 [INFO] — Auto-Connect 的幂等性保证

**文件**：`camera-context.tsx` 第 20-22 行

```ts
useEffect(() => {
  connect();
  return disconnect;
}, [connect, disconnect]);
```

**观察**：`connect()` 在 store 内部已有 `if (!cameraWebSocket)` 守卫，任何 Consumer 多次调用不会重复创建连接。

**取舍记录**：
- **选了自动连接**（实用主义）：Consumer 只需 `<CameraProvider>` 包裹，连接自动建立，无需手动管理。
- **Trade-off**：任何使用 CameraProvider 的组件都会触发连接。若未来需要"只订阅状态、不触发连接"的场景（如查看缓存图片），需要拆分 Context。
- 当前 camera 场景下合理，后续 album/settings/stellarium 接入时需确认是否始终需要主动连接。

**判断**：信息记录，非缺陷。取舍合理且有意识地做了幂等守卫。

---

## Finding 3 [ARCH] — Store/Context/Service 三层职责验证

| 层 | 文件 | 职责 | 边界 |
|---|---|---|---|
| **Service** | `websocket-service.ts` | WebSocket 生命周期（连接/断开/重连/收发） | ✅ 纯协议，无 React 依赖 |
| **Store** | `camera-store.ts` | 状态管理 + `handleCameraMessage` 协议解析 | ✅ 只做状态更新，不直接操作 socket |
| **Context** | `camera-context.tsx` | 自动连接生命周期（挂载连、卸载断） | ✅ 只封装 store action，不含业务逻辑 |

**无越界情况**：Store 的 `connect/disconnect/sendCommand` 是对外接口，Service 是底层实现，这一层隔离符合依赖倒置原则。

---

## Finding 4 [CONVENTION] — Feature-First 落地检查

| 约定 | 实际情况 | 结果 |
|---|---|---|
| Feature 目录结构 | `camera/` 下有 `services/` 子目录，screen/store/context/service/type/config 同级 | ✅ |
| `@/` 路径别名 | 所有 import 均用 `@/features/camera`、`@/lib/utils` | ✅ |
| `createSelectors` | `camera-store.ts` 使用 `@/lib/utils` 的 `createSelectors` | ✅ 符合现有模式 |
| `export const useXxx = createSelectors(_useXxx)` | `useCameraStore` 命名一致 | ✅ |
| Barrel export | `index.ts` 导出所有公开接口 | ✅ |
| 与 `dashboard/` 特征目录对比 | 参照 `src/features/dashboard/` 的 `*-screen.tsx` + `hooks/` 模式 | ✅ 结构一致 |

**无违规。**

---

## Finding 5 [CONVENTION] — React Native Expo 约定检查

| 约定 | 实际情况 | 结果 |
|---|---|---|
| `_layout.tsx` 根 Provider 结构 | `GestureHandlerRootView` → `KeyboardProvider` → `ThemeProvider` → `APIProvider` → `CameraProvider` → `BottomSheetModalProvider` → `FlashMessage` | ✅ 嵌套顺序正确 |
| Provider 渲染树 | `app/_layout.tsx` 第 50-72 行 | ✅ |
| MMKV storage 模式 | 未引入（camera feature 使用内存状态，合理） | ✅ N/A |
| axios vs React Query | `client.ts` 用原生 axios（camera 请求无缓存需求，不需要 RQ） | ✅ 决策合理 |
| i18n | camera feature 当前无 UI 文本，暂不需要 | ✅ N/A |

---

## Finding 6 [TYPING] — TypeScript 整洁度

- `CameraStatus` 联合类型：`'idle' | 'in_repeat' | 'in_streaming' | 'in_exposure'` — 与业务语义对应，非布尔展开 ✅
- `CameraWebSocketStatus`（service 内部）与 `connectionStatus`（store 暴露）命名区分清晰 ✅
- `LongExposureConfig` 带 `id: number`（业务主键），`Date.now()` 生成 ID 够用 ✅
- `CameraApiError` 三 kind 联合（`network` / `http` / `business`）——调用方可精确处理 ✅
- `unwrapCamera` 错误边界兜底 `payload ?? { success: false }` ✅

**无类型缺陷。**

---

## Finding 7 [EXTENSIBILITY] — 未来 album / settings / stellarium 接入路径

| 扩展方向 | 接入方式 | 平滑度 |
|---|---|---|
| **album**（相册） | 复用 `camera-store` 的 `newestCameraJpgUrl` / `newestStreamJpgUrl` | ✅ Store 已暴露 |
| **album**（独立抓取） | 新 feature `album/` 调用 `cameraRequest()`（`client.ts` 已导出） | ✅ HTTP 层可独立复用 |
| **settings**（参数配置） | 新 feature `settings/` 复用 `CameraContext` 或直接用 `useCameraStore` | ✅ Context 已暴露接口 |
| **stellarium**（星图） | 新 feature `stellarium/` 复用 `CameraWebSocketService`（独立实例）或走 HTTP | ✅ service 可 new |
| **settings/stellarium 独立 UI** | 各自 `<CameraProvider>` 包裹，或父级统一提供 | ⚠️ 注意：当前 auto-connect 意味着每个 Provider 实例都会触发一次连接。多个 Provider 可接受（有幂等守卫），但重复代码多。 |

**建议（不阻塞）**：若 album/settings/stellarium 需要各自独立的 camera 连接，考虑将连接管理抽为 hook（`useCameraConnection`），避免重复 `<CameraProvider>` 包裹。

---

## Finding 8 [OBSERVABILITY] — 缺失日志点（信息级）

当前实现无 debug 日志。考虑在生产调试时补充：

| 场景 | 建议位置 | 目的 |
|---|---|---|
| WebSocket 连接成功/失败 | `websocket-service.ts` `onopen` / `onerror` | 区分连接失败 vs 业务错误 |
| 命令发送失败 | `camera-store.ts` `sendCommand` throw | 捕获 send 异常 |
| 消息解析失败 | `websocket-service.ts` `onParseError` | 已有 `onParseError` callback，建议上层接入 console.error |

**当前代码已有 `onParseError` 回调通道，但未被 store 使用**（`connect()` 时未传 `onParseError`）。不影响功能，但会静默丢失解析异常。

---

## Summary

| 维度 | 结论 |
|---|---|
| Feature-First 约定 | ✅ 完全合规 |
| Zustand 模式 | ✅ `createSelectors` + 命名正确 |
| React Native Expo 约定 | ✅ Provider 嵌套正确 |
| Store / Context / Service 边界 | ✅ 三层清晰，无越界 |
| TypeScript 类型 | ✅ 无缺陷 |
| 过度设计 | ✅ 无。模块级单例是合理的轻量缓存；auto-connect 幂等保证。 |
| album/settings/stellarium 接入 | ✅ HTTP 层可复用；多个 feature 接入需注意 auto-connect 幂等性。 |
| 可维护性 | ✅ 命名一致，注释清晰，error kind 设计优良 |
| **总体** | **APPROVED** |

---

*Reviewer: ai-learning-mentor (软层架构审查)*
*Date: 2026-07-23*
*Mode: Ask — 只读审查，不修改代码*
