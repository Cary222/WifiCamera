<!-- reviewer: code-reviewer (硬层) -->
# Code Review: PR3 - Camera Store + CameraContext (Phase 1.8)

## Scope

Files: `camera-store.ts`, `camera-store.test.ts`, `camera-context.tsx`, `config.ts`, `index.ts`, `services/websocket-service.ts`, `services/websocket-protocol.ts`

Reviewed against 6 dimensions: Correctness, Maintainability, Efficiency, Security, Edge Cases, Testing.

---

## Verdict: ⚠️ Approved with Suggestions

No **Critical (Must Fix)** blocking items, but there are 3 significant issues that should be addressed before this ships to production or interacts with real camera hardware.

---

## Findings

### Critical (Must Fix)

#### 1. **[`camera-store.ts:124-126`] — `deleteExposureConfig` breaks `currentExposureConfig` invariant**

```startLine:124:camera-store.ts
deleteExposureConfig: id => set(state => ({
  exposureConfigs: state.exposureConfigs.filter(item => item.id !== id),
})),
```

**Impact:** Deleting the currently selected exposure config leaves `currentExposureConfig` pointing to a stale object. If the UI or downstream code (e.g., sending an exposure command to the camera) relies on `currentExposureConfig`, it will use deleted data or crash.

**Suggestion:** Add a guard to fall back to the first remaining config, or the default:

```ts
deleteExposureConfig: id => set(state => {
  const remaining = state.exposureConfigs.filter(item => item.id !== id);
  const needsFallback = state.currentExposureConfig.id === id;
  return {
    exposureConfigs: remaining,
    currentExposureConfig: needsFallback
      ? (remaining[0] ?? DEFAULT_CURRENT_CONFIG)
      : state.currentExposureConfig,
  };
}),
```

---

#### 2. **[`websocket-service.ts:108-116`] — Infinite reconnect loop with no cap**

```startLine:108:camera-service.ts
private scheduleReconnect(): void {
  if (this.manuallyClosed || this.reconnectTimer)
    return;

  this.reconnectTimer = setTimeout(() => {
    this.reconnectTimer = null;
    this.connect();
  }, this.options.reconnectDelayMs);
}
```

**Impact:** When `CameraProvider` mounts (at app start, on every Fast Refresh, or after navigating back to a camera screen), it calls `connect()`. Combined with auto-connect in `CameraContext`, the `CameraWebSocketService` singleton will retry forever if the camera is unreachable or unbound. This causes:

- Continuous background network traffic and battery drain.
- On React Native, potential watchdog timer violations.
- Log spam in development.

Per the PR1 review gap: *"最大重连次数和退避策略留给 Camera Store/UI 层决定."* — but the Store doesn't implement any cap either.

**Suggestion:** Add a `maxReconnectAttempts` counter. After N failures, stop reconnecting and surface a non-retryable error state to the store.

---

#### 3. **[`camera-store.ts:113-118`] — `addExposureConfig` uses `Date.now()` as ID**

```startLine:113:camera-store.ts
addExposureConfig: (config) => {
  const next = { ...config, id: Date.now() };
```

**Impact:** Two configs added within the same millisecond will collide. Also, IDs are not stable across store re-initialization.

**Suggestion:** Use an incrementing counter or a robust ID generator (e.g., `nanoid`).

---

### Improvements (Recommended)

#### 4. **[`camera-store.ts:120-123`] — `updateExposureConfig` unconditionally switches `currentExposureConfig`**

```startLine:120:camera-store.ts
updateExposureConfig: config => set(state => ({
  exposureConfigs: state.exposureConfigs.map(item => item.id === config.id ? config : item),
  currentExposureConfig: config,
})),
```

**Impact:** Every `updateExposureConfig` call changes the active selection, even when editing a different config. This causes unexpected UI behavior during batch edits.

**Suggestion:** Only update `currentExposureConfig` if the edited config was already the active one:

```ts
updateExposureConfig: config => set(state => ({
  exposureConfigs: state.exposureConfigs.map(item => item.id === config.id ? config : item),
  currentExposureConfig:
    state.currentExposureConfig.id === config.id
      ? config
      : state.currentExposureConfig,
})),
```

---

#### 5. **[`camera-store.ts:65`] — Module-level singleton `cameraWebSocket` survives test `setState` reset**

```startLine:65:camera-store.ts
let cameraWebSocket: CameraWebSocketService | null = null;
```

**Impact:** `camera-store.test.ts` calls `useCameraStore.setState({...})` to reset state between tests, but the module-level `cameraWebSocket` variable is never nulled. If one test creates a `CameraWebSocketService` instance and a subsequent test calls `connect()`, it will reuse the stale singleton with its previous event listeners and timers still attached.

**Suggestion:** Add a test-only teardown or document that tests must call `useCameraStore.getState().disconnect()` in `afterEach`.

---

#### 6. **[`camera-context.tsx:20-23`] — No device-binding / auth guard before auto-connect**

```startLine:20:camera-context.tsx
useEffect(() => {
  connect();
  return disconnect;
}, [connect, disconnect]);
```

**Impact:** `CameraProvider` is mounted in `RootLayout`'s `Providers`, wrapping the entire app (including onboarding, login, and device-setup routes). If the app is opened without a bound camera device or before Wi-Fi is connected, the WebSocket will connect to `EXPO_PUBLIC_CAMERA_BASE_URL` (which defaults to `http://192.168.1.1`) and immediately begin the infinite reconnect loop (Issue #2). This is wasteful and noisy.

**Suggestion:** Add a condition (e.g., a Zustand flag `isCameraDeviceBound`) before calling `connect()`, or move `CameraProvider` to only the app routes that actually need it.

---

#### 7. **[`websocket-service.ts:100-106`] — `sendCommand` throws synchronously with no graceful handling**

```startLine:100:websocket-service.ts
send(message: CameraJsonMessage): void {
  if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
    throw new Error('Camera WebSocket is not open');
  }
  this.socket.send(serializeCameraJsonMessage(message));
}
```

**Impact:** Any call to `sendCommand` when the socket is not open will throw, crashing the calling code if not wrapped in try/catch. The error is not surfaced to the store or UI.

**Suggestion:** Consider returning a boolean or Result type instead of throwing, and let callers decide how to handle the failure.

---

### Nitpicks (Optional)

#### 8. **[`camera-store.ts:55-61`] — Default exposure configs are hardcoded**

Default configs are not persisted. If a user customizes them and the store resets, all changes are lost. Consider persisting to MMKV.

#### 9. **[`camera-context.tsx:16-18`] — Zustand selector hooks called without arguments**

```startLine:16:camera-context.tsx
const connect = useCameraStore.use.connect();
const disconnect = useCameraStore.use.disconnect();
const sendCommand = useCameraStore.use.sendCommand();
```

Per `createSelectors` in `@/lib/utils`, `use.connect()` extracts the `connect` function from the store. This is correct. However, if `createSelectors` changes or is misconfigured, these could trigger unnecessary re-renders. Document the expected pattern in the store file.

#### 10. **[`camera-context.tsx:29`] — `sendCommand` dependency missing from `useMemo`**

```startLine:29:camera-context.tsx
}), [connect, disconnect, sendCommand]);
```

`sendCommand` is correctly included as a dependency.

---

## Positive Points

- **`isCameraStatus` type guard** (`camera-store.ts:165-170`) — Clean runtime validation with proper narrowing.
- **Stale closure guard** in `CameraWebSocketService` (`websocket-service.ts:48-49, 53-54, etc.) — All event handlers check `if (this.socket !== socket)` before executing, preventing cross-connection pollution on reconnect.
- **`manuallyClosed` flag** — Correctly prevents reconnect after `close()` is called.
- **`metadata` filter in `handleCameraMessage`** — Correctly skips binary frames to avoid mis-parsing.
- **`device_name` filter** — Guards against processing messages from unrelated devices.
- **`isBlobLike` / `isArrayBufferLike` type guards** — Defensive handling of RN's binary data variants.
- **FSD compliance** — All camera code lives under `src/features/camera/`, with clean barrel exports in `index.ts`.
- **Test coverage** — CRUD for exposure configs and status updates are covered. Test isolation via `setState` reset is appropriate (aside from Issue #5).

---

## Security

- No `dangerouslySetInnerHTML` usage.
- No sensitive data in logs.
- `CameraJsonMessage = Record<string, unknown>` is intentionally loose — all input validation happens in `handleCameraMessage`. This is acceptable for a protocol layer.
- `config.ts` correctly separates camera LAN endpoints from cloud API paths.

---

## Testing Assessment

The test suite covers the core state transitions. However:

- **Missing**: Test for `deleteExposureConfig` when deleting the currently selected config (directly tests Issue #1).
- **Missing**: Test for `updateExposureConfig` when editing a non-selected config (directly tests Issue #4).
- **Missing**: Test for `connect` / `disconnect` behavior with the singleton WebSocket.
- **Missing**: Test for `sendCommand` throwing when socket is closed.

---

## FSD Boundary Review

✅ No cross-feature imports. All dependencies are within `src/features/camera/`.
✅ `config.ts` correctly reads from `env.ts` (validated in PR1).
✅ `CameraProvider` is the only public React component; all WebSocket logic is encapsulated.

---

## Next Steps

1. **Before Phase 1.9**: Fix Issues #1, #2, and #3.
2. **Before Phase 1.9**: Add tests covering the missing edge cases (see Testing Assessment).
3. **Optional (Phase 1.9+)**: Address Issues #4, #5, #6, #7.
4. **Real device smoke test**: Connect an actual camera and verify the reconnect loop stops after max attempts, and that `deleteExposureConfig` gracefully falls back.
