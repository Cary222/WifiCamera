<!-- merged by Main -->
<!-- source reviews: code-reviewer, ai-learning-mentor -->

# PR1 Camera HTTP + WebSocket Slice Review

## Scope

本阶段完成 WifiCamera 品牌显示名、相机 HTTP StartUp 最小切片和 WebSocket 协议/连接基础层，不包含路由、UI、FileCopy、OTA、CameraContext、Zustand 或 Stellarium。

## Decision

**APPROVED FOR NEXT SLICE**

硬层与架构层审查最初均为 `CHANGES_REQUIRED`，阻塞项已修复：

- Android 通过 `expo-build-properties ~1.0.10` 配置 `usesCleartextTraffic`。
- iOS 在相机 base URL 为 HTTP 时配置 `NSAllowsLocalNetworking`。
- 未修改 EAS owner、projectId、updates URL、Expo slug、bundle ID 或 Android package。
- axios mock 从全局 `jest-setup.ts` 移至 camera 专用测试文件，避免污染现有云端 API 测试。
- 相机 base URL 的默认值由 `env.ts` 单一负责，feature 配置只读取解析后的环境值。
- `CameraApiResponse<T>` 改为 success/failure 判别联合，补充缺失 payload 的错误测试。
- 恢复了实现过程中误改的 skill 文件和 `uniwind-types.d.ts`。
- WebSocket 解析器支持文本 JSON、4 字节大端 metadata 二进制帧和 Blob-like 数据。
- WebSocket service 支持连接状态、主动关闭、异常断线重连和解析错误回调。
- 两份 PR2 审查均为 `APPROVED`，无阻塞项。

## Implemented Contract

- `getVersion()` -> `GET /StartUp/GetVersion/`
- `getSerial()` -> `GET /StartUp/Serial/`
- `postUpdateTime({ time, time_zone })` -> `POST /StartUp/UpdateTime/`
- 固件 snake_case 字段保持不变。
- `CameraApiError.kind` 区分 `network`、`http`、`business` 三类失败。

## Verification

通过：

- `pnpm test -- src/features/camera/services/startup-service.test.ts --runInBand`：17/17
- `pnpm type-check`
- `pnpm exec eslint app.config.ts env.ts src/features/camera/**/*.{ts,tsx}`
- `pnpm exec expo config --type public --json`
- `git diff --check`
- WebSocket + HTTP camera suites：3 suites、27/27 tests 通过
- 全量 Jest：5/6 suites 通过、56/57 tests 通过；唯一失败为既有 `login-form.test.tsx` 的过期 `form-title` 断言

Expo 配置解析确认：

- name: `WifiCamera`
- slug: `skysense`（保持不变）
- owner: `cary222`（保持不变）
- EAS projectId: `13d38557-f618-4a12-812f-4505aea6929f`（保持不变）
- iOS bundle ID / Android package: `com.skysense.development`（保持不变）
- iOS LAN cleartext: enabled when camera URL uses `http://`
- Android cleartext: enabled through `expo-build-properties` when camera URL uses `http://`

## Remaining Gaps

- 尚未连接真实相机验证固件返回的实际 JSON 字段、业务错误格式和 WebSocket binary frame。
- 尚未在 iOS/Android 真机上验证 HTTP/WebSocket 可达性与平台网络策略。
- 当前重连策略为固定间隔，最大重连次数和退避策略留给 Camera Store/UI 层决定。
- 全量 Jest 的既有 `login-form.test.tsx` 仍失败：测试查找 `form-title`，组件实际暴露 `login-title`，并伴随既有 `act(...)` 警告；不归因于本阶段。

## Next Slice

下一步进入 Camera Store + CameraContext：将 WebSocket 状态和消息分发接入 Zustand，建立可供拍摄/相册/设置复用的相机连接状态。重连上限、退避和用户提示在 Store/UI 层决定。真实设备烟测仍是独立验收条件。
