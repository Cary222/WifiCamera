<!-- reviewer: code-reviewer (硬层) -->

# Code Review — PR2: WifiCamera WebSocket Protocol Slice

**Scope:** `src/features/camera/services/websocket-protocol.ts`, `websocket-protocol.test.ts`, `websocket-service.ts`, `websocket-service.test.ts`, `src/features/camera/index.ts`
**Review Type:** Local Uncommitted Changes
**TypeScript:** ✅ Zero errors (`pnpm type-check` clean, per user report)
**Tests:** ✅ 27 tests passed across 3 suites (per user report)

---

## Verdict: ✅ Approved

协议实现质量高，无阻塞问题。有一个 **Recommended** 改进项（错误吞掉细节）和两个 **Nitpick**。

---

## Findings

### Critical (Must Fix)

无阻塞问题。

---

### Improvements (Recommended)

#### 1. **[websocket-service.ts:67-69]** `catch` 块吞掉了错误原因，调试困难

```ts
socket.onmessage = async (event) => {
  // ...
  try {
    // ...
  }
  catch {
    this.options.onStatusChange?.('error');
  }
};
```

- **Issue:** `catch` 没有捕获错误对象本身。如果 `parseCameraWebSocketMessage` 抛出格式错误（malformed JSON、metadata length 无效等），调用方无法区分是协议解析失败还是网络错误。`onStatusChange('error')` 语义模糊，调用方收到 `'error'` 时不知道该重试还是上报。
- **Impact:** 生产环境中遇到格式被破坏的二进制帧时，问题无法诊断。`CameraApiError` 的 `cause` 模式已在本 feature 的 HTTP 层建立，WS 层也应该遵循。
- **Suggestion:** 将 `catch` 改为 `catch (err) { ...; console.error('[CameraWebSocket] parse error:', err); this.options.onStatusChange?.('error'); }`，或者暴露一个专用的 `onParseError?: (error: unknown) => void` 回调。

---

### Nitpicks (Optional)

#### 2. **[websocket-service.ts:124-126]** `BlobLike` 类型与 `Blob` 接口不完全等价

```ts
type BlobLike = {
  arrayBuffer: () => Promise<ArrayBuffer>;
};
```

- **Issue:** 标准 `Blob` 还有 `size`、`type`、`text()` 等属性。当前类型只覆盖了 `arrayBuffer`，但实际使用中只访问了 `arrayBuffer()`，所以运行时行为正确，只是类型签名比实际 API 窄。
- **Impact:** 极低 — 实际使用场景（RN/Expo WebSocket）只传 `ArrayBuffer` 或 `Blob`，guard 函数只查 `arrayBuffer`，类型窄不影响功能。
- **Suggestion:** 可以加注释说明这只是部分接口。如果未来需要 `text()` 就要补全。

#### 3. **[websocket-service.ts:128-133]** `isArrayBufferLike` 的 guard 逻辑可简化

```ts
function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return typeof value === 'object'
    && value !== null
    && 'byteLength' in value
    && 'slice' in value
    && typeof value.slice === 'function';
}
```

- **Issue:** 检查了 `byteLength` 和 `slice` 但没有检查 `byteLength` 的类型（应为 `number`）。不过 WebSocket 在 RN/Expo 中只发 `string | ArrayBuffer`，不存在类型混淆的运行时场景。
- **Impact:** 极低 — 实际不可能有其他类型同时满足这两个属性。

#### 4. **[websocket-protocol.ts:42-50]** `parseJsonObject` 静默丢弃 JSON 解析错误

```ts
function parseJsonObject(value: string): CameraJsonMessage {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Camera WebSocket message must be a JSON object');
  }
  return parsed as CameraJsonMessage;
}
```

- **Issue:** 如果 JSON.parse 抛出（无效 JSON），错误会直接冒泡到 `parseCameraWebSocketMessage` 的调用者，但没有携带原始 payload 信息。如果固件发送了损坏的 JSON，调用方只知道 "not a JSON object"，无法判断是真的非对象还是 JSON 本身损坏。
- **Impact:** 低 — 在协议层，`parseJsonObject` 的异常通常意味着收到了格式异常的文本帧，比较少见。
- **Suggestion:** 可以在 `parseJsonObject` 内 catch JSON.parse 异常后 throw 一个带上下文的错误，例如 `throw new Error(\`Invalid JSON in WebSocket message: \${value.slice(0, 100)}\`)`。

---

## Non-Issues (Confirmed Safe)

### ✅ 协议字节序正确
`websocket-protocol.ts:22` 使用 `view.getUint32(0, false)`（大端），与旧版协议规范一致。

### ✅ metadata length 边界检查完整
`websocket-protocol.ts:17-27` 正确检查了 `byteLength < 4`（无法读 length）和 `metadataEnd > byteLength`（metadata 不完整）两个边界。

### ✅ 文本帧 JSON 类型守卫到位
`websocket-protocol.ts:45` 明确拒绝 `null`、数组和原始类型（`string`/`number`/`boolean`），防止固件误发非对象 JSON。

### ✅ 重连定时器生命周期正确
`websocket-service.ts` 的定时器管理：
- `connect()` 先 `clearReconnectTimer()` 再建连 → 防止重连触发期间手动 `close()` 后又触发旧定时器
- `scheduleReconnect()` 检查 `manuallyClosed` 标志 → 手动 close 不触发自动重连
- `close()` 先设 `manuallyClosed = true` → 逻辑顺序正确

### ✅ WebSocket 实例比较防止竞态
所有回调（`onopen`、`onmessage`、`onerror`、`onclose`）内部都有 `if (this.socket !== socket) return;` 检查。在异步 `onmessage` 执行期间，`close()` 可能已经创建了新 socket，这种比较确保旧的异步回调不会在新的 socket 上执行。

### ✅ Blob/ArrayBuffer 分支逻辑正确
`websocket-service.ts:56-63` 的分支处理：
- `Blob` → `await arrayBuffer()` → 后续走 ArrayBuffer 分支
- `ArrayBuffer` → 直接使用
- `string` → 直接使用
任何其他类型都被 `isArrayBufferLike` 或 string check 过滤，兜底是 `onStatusChange('error')`。

### ✅ `connect()` 防重复连接正确
`websocket-service.ts:37-40` 检查 `readyState === OPEN || CONNECTING` 后提前返回，防止在 socket 正在连接时重复创建实例。

### ✅ `close()` 处理 CLOSING 状态安全
`websocket-service.ts:91` 只在 `readyState !== WebSocket.CLOSED` 时调用 `socket.close()`。即使 socket 已经在 CLOSING 状态，`close()` 不会触发额外操作。

### ✅ 测试 mock 设计合理
`websocket-service.test.ts` 的 `MockWebSocket`：
- 静态列表 `MockWebSocket.instances` 追踪所有实例 → 正确验证重连创建了新 socket
- `onclose` 手动调用 → 正确触发 `socket.onclose` 回调链
- `fail()` 只触发 `onerror` 不触发 `onclose` → 与真实 WebSocket 行为一致（`onerror` 后 `onclose` 由浏览器/RN 驱动）

### ✅ 测试场景覆盖充分

| 场景 | 文件:行 |
|---|---|
| JSON 文本帧解析 | `websocket-protocol.test.ts:17-21` |
| JSON 文本帧序列化 | `websocket-protocol.test.ts:23-27` |
| 二进制帧解析 + binary payload 保留 | `websocket-protocol.test.ts:29-38` |
| 过短二进制帧拒绝 | `websocket-protocol.test.ts:40-44` |
| 不完整 metadata 拒绝 | `websocket-protocol.test.ts:46-53` |
| 非对象 JSON 拒绝 | `websocket-protocol.test.ts:55-59` |
| 连接 → 发 JSON → 收 JSON | `websocket-service.test.ts:68-86` |
| error + close → 自动重连 | `websocket-service.test.ts:88-106` |
| close() → 不重连 | `websocket-service.test.ts:108-121` |
| 离线发送拒绝 | `websocket-service.test.ts:123-127` |

### ✅ FSD 边界清晰
- `index.ts` 正确导出两个新服务的所有公开 API（protocol + service）
- 导出了 `CameraWebSocketStatus` 类型
- 没有跨 features 引用
- `websocket-protocol.ts` 是纯函数库，无副作用，可独立测试

### ✅ 与 HTTP 层错误模型一致
`CameraWebSocketStatus` 定义了 `'connecting' | 'open' | 'closed' | 'error'`，虽然与 HTTP 层的 `CameraApiError` 体系（`network/http/business`）不同，但这是合理的——WebSocket 是连接层，状态切换比 HTTP 错误分类更简单。

---

## Test Gaps

| 场景 | 覆盖状态 | 备注 |
|---|---|---|
| 二进制帧 metadata 截断（length 指向 mid-string） | ✅ 已覆盖 | `websocket-protocol.test.ts:46-53` |
| 空 JSON `{}` 文本帧 | ❌ 缺失 | 合法的 camera 消息体，应测试 |
| JSON 中含 null 值 `{key: null}` | ❌ 缺失 | `parseJsonObject` 允许 null（typeof null === 'object'），但这是正确的 JSON |
| WebSocket 在 OPEN 状态时 `send()` 成功 | ✅ 已覆盖 | `websocket-service.test.ts:80-85` |
| 收到 ArrayBuffer（原生）直接解析 | ❌ 缺失 | 测试只有 string 和 Blob，真实 RN 环境可能原生 ArrayBuffer |
| 重连次数限制 | ❌ 缺失（不在本次范围） | 未来需要无限重连改为有限次数 |
| close 时 socket 已在 CLOSING 状态 | ❌ 缺失 | 低概率但边界 |
| `onopen` 后立即调用 `send()`（send before onopen buffer） | ❌ 缺失 | 真实场景：connect() 同步创建 socket，send() 检查 OPEN 状态才发 |

---

## Summary Table

| # | Severity | File | Line | Issue |
|---|---|---|---|---|
| 1 | Recommended | `websocket-service.ts` | 67-69 | `catch` 块吞掉错误原因，调试困难 |
| 2 | Nitpick | `websocket-service.ts` | 124-126 | `BlobLike` 类型是部分接口 |
| 3 | Nitpick | `websocket-service.ts` | 128-133 | `isArrayBufferLike` 未检查 `byteLength` 类型 |
| 4 | Nitpick | `websocket-protocol.ts` | 42-50 | `parseJsonObject` JSON 解析异常信息不足 |

---

## Positive Points

- **协议实现正确：** 大端 4 字节 length prefix + JSON metadata + binary payload，与旧版协议完全兼容。
- **安全性高：** 二进制帧有双层边界检查（长度不足 + metadata 不完整），JSON 帧拒绝 null/数组/原始值。
- **竞态防护：** 所有回调都做了 `this.socket !== socket` 比较，确保连接生命周期内的回调不会串线。
- **定时器管理清晰：** `manuallyClosed` 标志 + `clearReconnectTimer` 的组合正确区分了自动重连和手动关闭。
- **类型设计良好：** `CameraJsonMessage | CameraBinaryMessage` 联合类型让调用方必须做类型收窄，强制处理两种帧格式。
- **测试质量高：** 协议层覆盖了所有边界（过短、不完整、非对象），服务层覆盖了连接生命周期和重连行为。
- **跨平台 Blob 兼容：** 通过 duck-typed guard 函数（`isBlobLike` / `isArrayBufferLike`）处理 RN/浏览器/WebWorker 不同环境的 WebSocket binary 类型差异。
- **代码简洁：** 整体逻辑干净，没有过度工程。

---

## Next Steps

1. **[Recommended]** 在 `onmessage` 的 `catch` 块中记录错误原因，便于生产诊断。
2. **[Optional]** 补充 `{}` 空对象文本帧测试和 ArrayBuffer 原生（非 Blob 转换）消息测试。
3. **[Optional]** 考虑在 `CameraWebSocketStatus` 中增加 `reconnecting` 状态，让调用方区分"连接失败"和"正在重连"，或通过事件回调传递重试次数。
