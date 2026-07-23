<!-- reviewer: ai-learning-mentor (软层) -->
<!-- review_scope: Phase 1.7 WebSocket 协议切片 -->
<!-- project: skysense-app (Expo SDK 54 + React Native 0.81) -->
<!-- review_date: 2026-07-23 -->

# PR2 WebSocket Protocol AI Mentor Review Report

## Verdict

**APPROVED** ✅

WebSocket 协议切片质量扎实，架构选型合理，无阻塞问题。职责边界清晰，测试覆盖充分，设计取舍有明确文档支撑。发现 1 个低优先级建议，无硬性问题。

---

## 架构优点

### 1. 协议层与服务层分离是正确决策

`websocket-protocol.ts` 纯做二进制帧解析，`websocket-service.ts` 纯做连接生命周期管理，两者之间通过 `CameraWebSocketMessage` 类型桥接。

> **类比**：就像 ProjectHub 的 AI Chat 场景——SSE 数据解析（`detector.ts` 里拆 `data:` 行）和流式 UI 渲染（`TypingBubble` 里的 `setStreamingContent`）是完全分离的两个关注点。协议层不知道谁在用它，服务层不知道二进制怎么解析。**分离的好处是：协议变了（比如固件改用 2 字节头），只改 `websocket-protocol.ts`，服务层不用动。**

### 2. 协议设计符合固件约束，没有过度设计

二进制帧用 4 字节大端序存储 metadata 长度前缀，然后接 JSON metadata，最后接二进制 payload——这是嵌入式固件的通行做法（MP4 box header、Protobuf length-prefixed framing 都是同一模式）。

- `getUint32(0, false)` — 大端序（网络字节序），这是正确的，因为固件通信走的是 TCP/UDP，标准就是大端序
- JSON metadata 校验了"必须是 object、不能是 array、不能是 null"——这个约束合理，固件的指令不会用数组或标量作为根类型
- `serializeCameraJsonMessage` 直接 `JSON.stringify`，没有额外的 envelope——这是对的，复用已有的 HTTP JSON 契约即可

### 3. 断线重连的"手动关闭优先"逻辑正确

```typescript
private manuallyClosed = false;

private scheduleReconnect(): void {
  if (this.manuallyClosed || this.reconnectTimer)
    return;
  // ...
}
```

`manuallyClosed` 标志位是最简洁的"区分主动关闭 vs 意外断开"方案——意外断开时 `onclose` 触发但 `manuallyClosed` 仍为 `false`，所以会重连；主动调用 `close()` 时设 `manuallyClosed = true`，`scheduleReconnect` 第一行就 return，不再重连。

> **取舍**：为什么不加最大重连次数？因为 Phase 1.7 是**相机的持续连接场景**（固件推送曝光状态、实时流），不是"用户发请求然后等结果"的短生命周期请求。无限重连在这里是合理的——相机重启后 App 应该自动恢复连接。如果将来要加 max reconnect，应该加在 Zustand store 层（Phase 1.8 的职责），而不是 service 层。

### 4. MockWebSocket 测试桩是可维护的

`websocket-service.test.ts` 的 `MockWebSocket` 手写了 `open()`/`message()`/`fail()`/`finish()` 四个触发方法，不用任何第三方 mock 库。相比 `jest.mock('websocket')` 的全量替换，这个方案：

- **意图清晰**：调用方明确知道"触发哪个事件"
- **不污染全局**：`afterAll` 恢复了 `OriginalWebSocket`
- **可扩展**：如果将来要测试 binary message，加一个 `message(buffer: ArrayBuffer)` 分支即可

### 5. `index.ts` 统一导出是 feature-first 的正确做法

```typescript
export * from './services/websocket-protocol';
export * from './services/websocket-service';
```

Phase 1.8 的 `CameraContext` / Zustand store 只需要 `import { CameraWebSocketService } from '@/features/camera'`，不需要知道 `services/` 的子目录结构。这是渐进迁移的关键——**消费者不依赖内部目录结构**。

---

## Findings（按严重性排序）

### Finding 1 — Low：断线重连无最大次数限制（设计建议，非阻塞）

**文件**：`websocket-service.ts` 第 106-113 行

```typescript
private scheduleReconnect(): void {
  if (this.manuallyClosed || this.reconnectTimer)
    return;

  this.reconnectTimer = setTimeout(() => {
    this.reconnectTimer = null;
    this.connect();
  }, this.options.reconnectDelayMs);
}
```

**现状**：意外断开后无限重连，间隔固定 `reconnectDelayMs`。

**潜在风险**：如果相机固件永久离线（比如硬件故障），App 会永远以 1 秒间隔重连——浪费电量和 CPU。

**建议**：加一个 max reconnect 机制：

```typescript
private reconnectAttempts = 0;
private readonly maxReconnectAttempts = 5;

private scheduleReconnect(): void {
  if (this.manuallyClosed || this.reconnectTimer)
    return;
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
    this.options.onStatusChange?.('error');
    return;
  }
  this.reconnectAttempts++;
  // ...
}
```

`onStatusChange('error')` 通知上层（比如 Zustand store）"重连耗尽"，由 Phase 1.8 的 Camera store 决定是否提示用户。

**为什么这是低优先级**：Phase 1.7 是纯 service，不带 UI；重连策略应该由 Phase 1.8 的 Camera store 和 UI 层来决定（比如"显示重连提示 + 用户手动重试"）。把 max reconnect 放在 service 层会让 service 承担了 UI 决策。

> **类比**：就像 ProjectHub 的 AI Chat 的 SSE 断流处理——`AbortController` 取消请求是 service 层的事，但"显示连接中断提示"是 UI 层的事。**service 提供状态，UI 决定反馈。**

---

### Finding 2 — Info：协议文档未说明字节序假设

**文件**：`websocket-protocol.ts`

**现状**：`getUint32(0, false)` 硬编码了大端序。注释里没有写明这个假设。

**建议**：在 `parseCameraWebSocketMessage` 顶部加一行注释：

```typescript
/**
 * Parses camera WebSocket frames.
 *
 * Binary frame format (big-endian / network byte order):
 *   [4 bytes: metadata length (uint32)] [N bytes: JSON metadata]
 *   [remaining: binary payload]
 */
```

**为什么这个信息值得文档化**：固件团队可能未来改变帧格式（改成小端序、加 checksum 等）。注释里的字节序说明是"固件契约"的一部分——和 `types.ts` 里的 `time_zone` snake_case 是同一类契约文档。

---

### Finding 3 — Info：`index.ts` 缺少 `CameraWebSocketMessage` 类型导出

**文件**：`src/features/camera/index.ts`

**现状**：`websocket-service.ts` 的类型 `CameraWebSocketStatus` 和 `CameraWebSocketOptions` 通过 `export * from './services/websocket-service'` 导出，但 `websocket-protocol.ts` 的核心输出类型 `CameraWebSocketMessage` 的 union 成员 `CameraBinaryMessage` 没有被导出。

**影响**：Phase 1.8 的 Camera store 或 CameraContext 如果需要区分"JSON 消息"和"二进制消息"，当前要同时 import 两个文件：

```typescript
import { CameraWebSocketService } from '@/features/camera';
import type { CameraBinaryMessage } from '@/features/camera/services/websocket-protocol';
```

**建议**：在 `index.ts` 中显式导出 `CameraBinaryMessage`：

```typescript
export type {
  CameraJsonMessage,
  CameraBinaryMessage,
  CameraWebSocketMessage,
} from './services/websocket-protocol';
```

或者用更宽泛的 `export type * from './services/websocket-protocol'`。

---

## 架构一致性检查

### Feature-first 服从性：✅

| 规范 | 现状 | 结论 |
|------|------|------|
| Feature 内部用 `@/` 绝对路径 | `websocket-service.ts` 用 `'./websocket-protocol'`（相对路径） | ✅ 同级文件相对路径是允许的 |
| 公共接口从 `index.ts` 导出 | `index.ts` 导出全部 public API | ✅ |
| Feature 外不直接 import 内部路径 | 尚未被消费（Phase 1.8 接入） | — |
| `services/` 子目录 | `camera/` 下有 `services/` | ⚠️ 见下方说明 |

**关于 `services/` 子目录**：PR1 的 review 指出 Phase 0 只有一个 `startup-service.ts`，用 `services/` 是过度设计。但 Phase 1.7 后 `camera/` 下已经有 `startup-service` + `websocket-protocol` + `websocket-service` 三个 service 文件——**从 Phase 0 的 1 个 service 到 Phase 1.7 的 3 个 service，`services/` 子目录的存在已经是合理的了**。当一个 feature 有多个不同领域的 service 时，目录分层是合适的组织方式。

> **判断**：PR1 当时的建议（扁平化）是针对 Phase 0 的正确建议；随着 service 数量增长，目录分层是 feature-first 规范允许的。

### React Native + Expo 兼容性：✅

- `WebSocket` 是 React Native 内置 API（`global.WebSocket`），无需 polyfill
- `Blob` 在 RN 的事件处理中可能返回 `Blob` 对象，`isBlobLike` 的 duck typing 防护是正确的
- 没有使用任何 Node.js 独有 API（`Buffer` 等）
- Jest 测试桩 `MockWebSocket` 操作 `globalThis.WebSocket`，兼容 RN/Node 环境

### 断线重连的可解释性：✅

用苏格拉底式问题验证：

| 问题 | 答案 |
|------|------|
| 相机固件重启后 App 多久恢复连接？ | `reconnectDelayMs`（默认 1 秒）后自动重连 |
| 用户主动切到后台再回来会怎样？ | `connect()` 检查 `readyState`，如果已是 OPEN/CONNECTING 则不重复创建 socket |
| 相机永久离线会发生什么？ | 无限重连（见 Finding 1 的改进建议） |
| 重连时固件已发送的消息会丢吗？ | **会丢**——固件推送的消息没有 client ACK 机制，这是固件设计，不是 App 的问题 |

### 协议解析的可维护性：✅

用苏格拉底式问题验证：

| 问题 | 答案 |
|------|------|
| 固件改成 2 字节长度头要改哪里？ | `websocket-protocol.ts` 第 22 行：`getUint32` → `getUint16` |
| 固件加了个新 JSON 字段在哪里处理？ | 在 Phase 1.8 的 Camera store 里 switch/case，不需要改协议层 |
| 如何调试"收不到二进制帧"？ | 看 `websocket-service.test.ts` 的 binary 测试用例，用 `createBinaryMessage` 构造测试帧 |

---

## 与 Phase 1.8 的对接路径

Phase 1.8（Camera Store + CameraContext）的集成路径清晰：

```
CameraStore (Zustand)
    │
    ├── new CameraWebSocketService({
    │     url: wsUrl,
    │     reconnectDelayMs: 1000,
    │     onMessage: (msg) => store.dispatch(handleCameraMessage(msg)),
    │     onStatusChange: (status) => store.setConnectionStatus(status),
    │   })
    │
    └── connect() on mount
        │
        └── disconnect() on unmount
```

**关键设计点**：
- `CameraWebSocketService` 是**无状态的连接管理器**，它只负责"建立连接 → 路由消息 → 管理重连"，不持有任何业务状态
- 所有业务状态（`camera_status`、`exposure_config_list`、`streaming_in_progress`）都在 Zustand store 里
- `onMessage` 回调是唯一的业务注入点，store 的 `dispatch` 决定了"这条消息更新哪个字段"

这个对接路径和迁移计划 §1.8 的描述一致，没有歧义。

---

## 总结

PR2 WebSocket 协议切片 **APPROVED**，无阻塞问题。

核心设计亮点：
- **协议层与服务层正交**：`parseCameraWebSocketMessage` 和 `CameraWebSocketService` 可以独立演进
- **重连逻辑简洁**：用 `manuallyClosed` 标志位区分主动/被动断开，代码量少但语义精准
- **测试覆盖充分**：5 个 protocol 测试 + 4 个 service 测试，边界 case（短 buffer、incomplete metadata、Blob vs string）都有覆盖
- **Feature-first 服从**：从 `index.ts` 统一导出，Phase 1.8 接入时无歧义

唯一低优先级建议是 **Finding 1**（max reconnect），属于 Phase 1.8 Camera store 层的决策，当前 service 层保持无限重连是合理的设计选择。

Phase 1.7 完成后，下一步是 **Phase 1.8：Camera Store + CameraContext**——将 WebSocket service 接入 Zustand store，建立相机业务状态机。
