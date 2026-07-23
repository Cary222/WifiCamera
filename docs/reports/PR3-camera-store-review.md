<!-- merged by Main -->
<!-- source reviews: code-reviewer, ai-learning-mentor -->

# PR3 Camera Store + Context Review

## Decision

**APPROVED FOR NEXT SLICE**

审查发现的风险已处理：

- 删除当前曝光预设时自动选择剩余预设，若全部删除则回到默认配置。
- 曝光配置 ID 改为基于当前最大 ID 递增，避免同毫秒冲突。
- WebSocket 默认最多重连 5 次，并支持自定义 `maxReconnectAttempts`。
- `CameraProvider` 只有在 `STORAGE_KEYS.BOUND_DEVICE_ID` 存在时才连接相机；登录和设备向导阶段不会访问局域网设备。
- Store 通过 `createSelectors` 暴露，Context 只负责连接生命周期和 command API。

## Implemented State

- `cameraStatus`: `idle | in_repeat | in_streaming | in_exposure`
- WebSocket connection status
- Exposure presets and current preset
- Streaming flag
- Power/charging and disk usage
- Camera serial/version
- Latest camera/stream JPG URLs
- Remaining exposure time

## Verification

- Camera suites：4 suites、30/30 tests passed
- `pnpm type-check`
- `pnpm exec eslint src/features/camera src/app/_layout.tsx`
- `git diff --check`

## Remaining Risks

- 真实设备尚未验证 WebSocket 指令字段和硬件状态消息字段。
- `CameraProvider` 依赖绑定设备 ID，首次设备连接流程完成后需要触发 MMKV 更新以启动连接。
- 曝光配置目前为内存状态，MMKV 持久化留到拍摄功能接入时实现。
- 重连策略为固定间隔和有限次数，退避与用户可见提示留给后续 UI/Store 演进。

## Next Slice

进入 camera 主页面和 command actions：先接 `get_camera_status`、拍摄开始/停止、曝光预设选择，再迁移文件服务和相册。保持当前 HTTP/WebSocket service contract 不变。
